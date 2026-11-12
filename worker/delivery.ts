import type { SupabaseClient } from '@supabase/supabase-js';
import type { Event } from '../shared/model';
import { emailConfiguration, sendDigest, singleEmail, type EmailTransport } from './outbox';

interface Digest {
  id: string; status: 'pending' | 'sending'; payload: Event[];
  first_attempt_at: string | null; lease_until: string | null; claim_token: string | null;
  last_error: string | null; sent_at: string | null;
}
const marker = (transport: EmailTransport) => `transport=${transport};`;
const retryMs = 23*60*60*1000;
class DeliveryError extends Error {}

// Compare every claim/transition against the exact owner/id/status/token snapshot.
// Only a returned single row proves ownership; losing a race never permits a send.
async function transition(db: SupabaseClient, owner: string, digest: Digest, patch: Record<string,unknown>): Promise<boolean> {
  let update = db.from('outbox').update(patch).eq('owner_id',owner).eq('id',digest.id).eq('status',digest.status);
  for (const field of ['claim_token','first_attempt_at','lease_until'] as const) {
    update = digest[field] === null ? update.is(field,null) : update.eq(field,digest[field]!);
  }
  const {data,error} = await update.select('id');
  if (error || !data || data.length > 1) throw new DeliveryError('Outbox conditional update failed; no delivery ownership established');
  return data.length === 1;
}

async function claim(db: SupabaseClient, owner: string, transport: EmailTransport, now: number): Promise<Digest | null> {
  const {data,error} = await db.from('outbox').select('id,status,payload,first_attempt_at,lease_until,claim_token,last_error,sent_at').eq('owner_id',owner).in('status',['pending','sending']).order('created_at',{ascending:true}).limit(20);
  if (error) throw new DeliveryError('Outbox read failed; no send attempted');
  for (const digest of (data ?? []) as Digest[]) {
    const attempted = digest.first_attempt_at !== null;
    const first = attempted ? Date.parse(digest.first_attempt_at!) : NaN;
    const lease = digest.lease_until ? Date.parse(digest.lease_until) : NaN;
    if (digest.status === 'sending' && Number.isFinite(lease) && lease > now) continue;
    const sameResend = transport === 'resend' && digest.last_error?.startsWith(marker('resend'));
    const retryableLease = digest.status === 'pending' ? digest.lease_until === null : Number.isFinite(lease) && lease <= now;
    const resendRetry = attempted && sameResend && digest.sent_at === null && digest.claim_token !== null && retryableLease && Number.isFinite(first) && first <= now && now-first < retryMs;
    const pristine = digest.status === 'pending' && !attempted && digest.claim_token === null && digest.lease_until === null && digest.sent_at === null && digest.last_error === null;
    if (!pristine && !resendRetry) {
      // Gmail is never retried after a claim, even on a connect failure. Legacy or
      // cross-provider attempts have no trustworthy shared idempotency guarantee.
      await transition(db,owner,digest,{status:'review',lease_until:null,last_error:'Delivery outcome/provider uncertain or retry window expired; inspect provider before manual resolution'});
      continue;
    }
    // The profile read above Auth is only an early exit. This RPC locks that same
    // profile row and checks the current opt-in atomically with the guarded claim.
    const {data:claimed,error:claimError} = await db.rpc('claim_delivery_digest',{
      p_owner:owner,p_id:digest.id,p_transport:transport,p_expected_status:digest.status,
      p_expected_token:digest.claim_token,p_expected_first_attempt_at:digest.first_attempt_at,p_expected_lease_until:digest.lease_until,
    });
    if (claimError) throw new DeliveryError('Atomic delivery claim unavailable; install supabase/migrations/20261112_atomic_delivery_claim.sql before enabling mail; no send attempted');
    if (claimed === null) continue; // Opted out, stale snapshot or competing claim.
    if (!claimed || Array.isArray(claimed) || claimed.owner_id !== owner || claimed.id !== digest.id || claimed.status !== 'sending' || typeof claimed.claim_token !== 'string' || !claimed.claim_token || typeof claimed.first_attempt_at !== 'string' || typeof claimed.lease_until !== 'string' || !Array.isArray(claimed.payload) || !claimed.last_error?.startsWith(marker(transport))) throw new DeliveryError('Atomic delivery claim returned invalid ownership; no send attempted');
    return claimed as Digest;
  }
  return null;
}

interface Options { send?: typeof sendDigest; now?: number }
/** One digest maximum. No provider fallback, SMTP verify, queue drain or raw errors. */
export async function deliverNextDigest(db: SupabaseClient, owner: string, env: NodeJS.ProcessEnv, options: Options = {}) {
  if (env.ENABLE_EMAIL !== 'true') return {status:'disabled' as const};
  const transport = emailConfiguration(env); // Fail before database/provider contact if not configured.
  try { return await deliverConfigured(db,owner,env,transport,options); }
  catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('Email delivery stopped; database/provider outcome unavailable; inspect outbox before retry');
  }
}
async function deliverConfigured(db: SupabaseClient, owner: string, env: NodeJS.ProcessEnv, transport: EmailTransport, options: Options) {
  const {data:profile,error:profileError} = await db.from('profiles').select('config').eq('owner_id',owner).single();
  if (profileError) throw new DeliveryError('Email preference unavailable; no send attempted');
  if (profile?.config?.emailEnabled !== true) return {status:'disabled' as const};
  const {data:account,error:accountError} = await db.auth.admin.getUserById(owner);
  const recipient = account?.user?.email;
  if (accountError || !singleEmail(recipient)) throw new DeliveryError('Provisioned owner email unavailable; no send attempted');
  const digest = await claim(db,owner,transport,options.now ?? Date.now());
  if (!digest) return {status:'empty' as const};
  let accepted = false;
  try { await (options.send ?? sendDigest)(digest.id,digest.payload,recipient,env); accepted=true; }
  catch {
    if (transport === 'gmail') {
      if (!await transition(db,owner,digest,{status:'review',lease_until:null,last_error:'transport=gmail; delivery not confirmed; manual review required; never automatically resend'})) throw new DeliveryError('Gmail outcome uncertain and lease lost; manual review required');
    } else {
      const {error} = await db.rpc('finish_digest',{p_owner:owner,p_id:digest.id,p_token:digest.claim_token,p_error:'transport=resend; delivery not confirmed; retry only the same Resend digest within its retention window'});
      if (error) throw new DeliveryError('Resend failure acknowledgement unavailable; lease retained');
    }
  }
  if (!accepted) throw new DeliveryError(transport === 'gmail' ? 'Gmail outcome unconfirmed; automatic resend stopped for review' : 'Resend delivery unconfirmed; stable-key retry remains bounded');
  // On acknowledgement failure leave sending untouched. Gmail's expired lease is
  // moved to review, never reclaimed; a provider switch also cannot resend it.
  try {
    const {error} = await db.rpc('finish_digest',{p_owner:owner,p_id:digest.id,p_token:digest.claim_token,p_error:null});
    if (error) throw new Error('acknowledgement failed');
  } catch { throw new DeliveryError('Delivery accepted but database acknowledgement unavailable; do not resend manually; inspect provider/outbox'); }
  return {status:'sent' as const};
}
