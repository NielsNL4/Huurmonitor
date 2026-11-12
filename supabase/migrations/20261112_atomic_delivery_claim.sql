-- Apply manually to an existing database BEFORE enabling the new mail worker.
-- No table/data migration. No automatic installation or legacy-claim fallback.
begin;
create or replace function public.claim_delivery_digest(
  p_owner uuid, p_id uuid, p_transport text, p_expected_status text,
  p_expected_token uuid, p_expected_first_attempt_at timestamptz,
  p_expected_lease_until timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; d public.outbox%rowtype; claimed_at timestamptz;
begin
  if p_transport is null or p_transport not in ('gmail','resend') then
    raise exception 'Unsupported delivery transport';
  end if;
  -- Same profile-first lock order as save_profile/set_decision/apply_batch.
  -- A completed opt-out, including one committed while Auth was pending, is
  -- observed here. Hold this lock through the outbox update and transaction end.
  select config into cfg from public.profiles where owner_id = p_owner for update;
  if not found or cfg->'emailEnabled' is distinct from 'true'::jsonb then return null; end if;
  claimed_at := clock_timestamp(); -- Server time AFTER acquiring the profile lock.
  update public.outbox as o set
    status = 'sending', first_attempt_at = coalesce(o.first_attempt_at, claimed_at),
    lease_until = claimed_at + interval '10 minutes', claim_token = gen_random_uuid(),
    last_error = 'transport=' || p_transport || '; claimed; delivery not yet confirmed'
  where o.owner_id = p_owner and o.id = p_id and o.status = p_expected_status
    and o.claim_token is not distinct from p_expected_token
    and o.first_attempt_at is not distinct from p_expected_first_attempt_at
    and o.lease_until is not distinct from p_expected_lease_until
    and o.sent_at is null
    and (
      -- Only pristine pending rows may begin a Gmail attempt (or new Resend).
      (o.status = 'pending' and o.first_attempt_at is null and o.claim_token is null
        and o.lease_until is null and o.last_error is null)
      or
      -- Never reclaim SMTP/unknown-provider attempts. Resend alone has a bounded
      -- same-digest idempotency window, with an explicit existing provider marker.
      (p_transport = 'resend' and o.last_error like 'transport=resend;%'
        and o.first_attempt_at is not null and o.first_attempt_at <= claimed_at
        and o.first_attempt_at > claimed_at - interval '23 hours'
        and o.claim_token is not null
        and ((o.status = 'pending' and o.lease_until is null)
          or (o.status = 'sending' and o.lease_until is not null and o.lease_until <= claimed_at)))
    )
  returning o.* into d;
  if not found then return null; end if;
  return to_jsonb(d); -- owner/id primary-key predicate permits at most one row.
end $$;
revoke all on function public.claim_delivery_digest(uuid,uuid,text,text,uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_delivery_digest(uuid,uuid,text,text,uuid,timestamptz,timestamptz) to service_role;
commit;
