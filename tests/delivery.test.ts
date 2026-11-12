import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverNextDigest } from '../worker/delivery';
import type { sendDigest } from '../worker/outbox';
import { readFileSync } from 'node:fs';

const owner='fixture-owner', recipient='owner@example.invalid';
const now=Date.parse('2026-11-12T12:00:00Z');
const gmail={ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'gmail',GMAIL_USER:'sender@example.invalid',GMAIL_APP_PASSWORD:'abcdefghijklmnop'};
const resend={ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'resend',RESEND_API_KEY:'fixture-key',EMAIL_FROM:'sender@example.invalid'};
interface TestDigest {
  id:string;owner_id:string;status:string;payload:unknown[];created_at:string;
  first_attempt_at:string|null;lease_until:string|null;claim_token:string|null;last_error:string|null;sent_at:string|null;
}
function pending(patch:Record<string,unknown>={}): TestDigest {
  return {id:'fixture-digest',owner_id:owner,status:'pending',payload:[],first_attempt_at:null,lease_until:null,claim_token:null,last_error:null,sent_at:null,created_at:new Date(now).toISOString(),...patch};
}
function attempted(transport='gmail',status='sending',age=11*60*1000) {
  return pending({status,first_attempt_at:new Date(now-age).toISOString(),lease_until:status==='sending'?new Date(now-1).toISOString():null,claim_token:'old-token',last_error:`transport=${transport}; claimed`});
}

/** In-memory PostgREST boundary: every guarded write is evaluated atomically.
 * No client credentials, network, SMTP session or actual database is involved. */
function fixture(rows=[pending()], options:{profile?:boolean;failFinish?:boolean;badClaimResult?:boolean;missingClaim?:boolean;authPending?:Promise<void>;onAuth?:()=>void}={}) {
  const state={rows:structuredClone(rows),enabled:options.profile!==false,calls:0,auth:0,claimCalls:0,claims:0,finishes:0,updates:[] as Array<{filters:Array<[string,unknown]>;patch:Record<string,unknown>}>};
  class Query {
    filters:Array<[string,unknown]>=[];patch:Record<string,unknown>|undefined;one=false;statuses:string[]|undefined;max=Infinity;
    constructor(public table:string){}
    select(_columns:string){return this;}
    update(patch:Record<string,unknown>){this.patch=patch;return this;}
    eq(field:string,value:unknown){this.filters.push([field,value]);return this;}
    is(field:string,value:unknown){return this.eq(field,value);}
    in(_field:string,values:string[]){this.statuses=values;return this;}
    order(_field:string,_options:unknown){return this;}
    limit(value:number){this.max=value;return this;}
    single(){this.one=true;return this;}
    then(resolve:any,reject:any){return Promise.resolve().then(()=>{
      assert.ok(this.filters.some(([key,value])=>key==='owner_id'&&value===owner),'every database access must be owner scoped');
      if(this.table==='profiles')return{data:{config:{emailEnabled:state.enabled}},error:null};
      assert.equal(this.table,'outbox');
      const matches=state.rows.filter(row=>this.filters.every(([key,value])=>(row as any)[key]===value)&&(!this.statuses||this.statuses.includes(row.status))).slice(0,this.max);
      if(this.patch){
        for(const key of ['owner_id','id','status','claim_token','first_attempt_at','lease_until'])assert.ok(this.filters.some(([field])=>field===key),`write must match ${key}`);
        state.updates.push({filters:structuredClone(this.filters),patch:structuredClone(this.patch)});
        matches.forEach(row=>Object.assign(row,this.patch));
        return{data:matches.map(row=>({id:row.id})),error:null};
      }
      return{data:structuredClone(matches),error:null};
    }).then(resolve,reject);}
  }
  const db={
    from(table:string){state.calls++;return new Query(table);},
    auth:{admin:{async getUserById(id:string){state.auth++;assert.equal(id,owner);options.onAuth?.();await options.authPending;return{data:{user:{email:recipient}},error:null};}}},
    async rpc(name:string,args:any){
      if(name==='claim_delivery_digest'){
        state.claimCalls++;assert.equal(args.p_owner,owner);assert.ok(['gmail','resend'].includes(args.p_transport));
        for(const key of ['p_expected_status','p_expected_token','p_expected_first_attempt_at','p_expected_lease_until'])assert.ok(key in args);
        if(options.missingClaim)return{data:null,error:{message:'RPC not installed'}};
        // Models the SQL transaction's profile lock/current opt-in plus guarded
        // row update. SQL lock/permission/eligibility assertions below supplement
        // this mock; it is not evidence of executing PostgreSQL concurrency.
        if(!state.enabled)return{data:null,error:null};
        const row=state.rows.find(row=>row.owner_id===args.p_owner&&row.id===args.p_id&&row.status===args.p_expected_status&&row.claim_token===args.p_expected_token&&row.first_attempt_at===args.p_expected_first_attempt_at&&row.lease_until===args.p_expected_lease_until);
        if(!row||row.sent_at!==null)return{data:null,error:null};
        const pristine=row.status==='pending'&&row.first_attempt_at===null&&row.claim_token===null&&row.lease_until===null&&row.last_error===null;
        const first=Date.parse(row.first_attempt_at??''),lease=Date.parse(row.lease_until??'');
        const retry=args.p_transport==='resend'&&row.last_error?.startsWith('transport=resend;')&&row.claim_token!==null&&Number.isFinite(first)&&first<=now&&first>now-23*60*60*1000&&((row.status==='pending'&&row.lease_until===null)||(row.status==='sending'&&Number.isFinite(lease)&&lease<=now));
        if(!pristine&&!retry)return{data:null,error:null};
        if(options.badClaimResult)return{data:[{id:'a'},{id:'b'}],error:null};
        state.claims++;Object.assign(row,{status:'sending',claim_token:`claim-${state.claimCalls}`,first_attempt_at:row.first_attempt_at??new Date(now).toISOString(),lease_until:new Date(now+10*60*1000).toISOString(),last_error:`transport=${args.p_transport}; claimed; delivery not yet confirmed`});
        return{data:structuredClone(row),error:null};
      }
      state.finishes++;assert.equal(name,'finish_digest');assert.equal(args.p_owner,owner);
      if(options.failFinish)return{error:{message:'private backend detail must never escape'}};
      const row=state.rows.find(row=>row.owner_id===args.p_owner&&row.id===args.p_id&&row.status==='sending'&&row.claim_token===args.p_token);
      if(!row)return{error:{message:'lease lost'}};
      Object.assign(row,{status:args.p_error===null?'sent':'pending',sent_at:args.p_error===null?new Date(now).toISOString():null,last_error:args.p_error,lease_until:null});
      return{error:null};
    },
  } as unknown as SupabaseClient;
  return{db,state};
}

test('Disabled email and incomplete configuration never contact database, owner lookup or transport', async()=>{
  const{db,state}=fixture();let sent=0;const send:typeof sendDigest=async()=>{sent++;};
  assert.equal((await deliverNextDigest(db,owner,{}, {send})).status,'disabled');
  await assert.rejects(deliverNextDigest(db,owner,{ENABLE_EMAIL:'true'}, {send}),/EMAIL_TRANSPORT/);
  await assert.rejects(deliverNextDigest(db,owner,{ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'gmail'}, {send}),/GMAIL_APP_PASSWORD/);
  assert.equal(state.calls,0);assert.equal(state.auth,0);assert.equal(sent,0);
  const optedOut=fixture(undefined,{profile:false});assert.equal((await deliverNextDigest(optedOut.db,owner,gmail,{send})).status,'disabled');assert.equal(optedOut.state.auth,0);assert.equal(sent,0);
});
test('One provisioned owner recipient and one digest only; conditional owner/id/token writes', async()=>{
  const{db,state}=fixture([pending(),pending({id:'second'}),pending({id:'foreign',owner_id:'other-owner'})]);const delivered:any[]=[];
  const result=await deliverNextDigest(db,owner,{...gmail,EMAIL_TO:'ignored@example.invalid'},{now,send:async(id,events,to)=>{delivered.push({id,events,to});}});
  assert.equal(result.status,'sent');assert.deepEqual(delivered,[{id:'fixture-digest',events:[],to:recipient}]);assert.equal(state.rows[0].status,'sent');assert.equal(state.rows[1].status,'pending');assert.equal(state.rows[2].status,'pending');assert.equal(state.finishes,1);
});
test('Ambiguous DATA, authentication, connect and unclassified SMTP failures all stop for review', async()=>{
  for(const command of ['DATA','AUTH','CONN','unknown']){
    const{db,state}=fixture();let sent=0;
    await assert.rejects(deliverNextDigest(db,owner,gmail,{now,send:async()=>{sent++;throw Object.assign(Error('private SMTP response'),{command});}}),/review/);
    assert.equal(state.rows[0].status,'review');assert.equal(state.finishes,0);assert.doesNotMatch(state.rows[0].last_error!,/private/);
    assert.equal((await deliverNextDigest(db,owner,gmail,{now:now+11*60*1000,send:async()=>{sent++;}})).status,'empty');assert.equal(sent,1);
  }
});
test('SMTP accepted plus failed DB acknowledgement leaves sending, then review without duplicate send', async()=>{
  const{db,state}=fixture(undefined,{failFinish:true});let sent=0;const send:typeof sendDigest=async()=>{sent++;};
  await assert.rejects(deliverNextDigest(db,owner,gmail,{now,send}),error=>error instanceof Error&&/acknowledgement/.test(error.message)&&!/private/.test(error.message));assert.equal(state.rows[0].status,'sending');
  await deliverNextDigest(db,owner,gmail,{now:now+9*60*1000,send});assert.equal(state.rows[0].status,'sending');
  await deliverNextDigest(db,owner,gmail,{now:now+11*60*1000,send});assert.equal(state.rows[0].status,'review');assert.equal(sent,1);
});
test('Expired Gmail sending and unmarked legacy attempts are review-only under either provider', async()=>{
  for(const env of [gmail,resend])for(const row of [attempted('gmail'),attempted('legacy'),attempted('legacy','pending')]){
    const{db,state}=fixture([row]);let sent=0;await deliverNextDigest(db,owner,env,{now,send:async()=>{sent++;}});assert.equal(sent,0);assert.equal(state.rows[0].status,'review');
  }
});
test('Cross-provider attempted pending rows cannot be sent with the new transport', async()=>{
  for(const [env,prior]of [[gmail,'resend'],[resend,'gmail']] as const){const{db,state}=fixture([attempted(prior,'pending')]);let sent=0;await deliverNextDigest(db,owner,env,{now,send:async()=>{sent++;}});assert.equal(sent,0);assert.equal(state.rows[0].status,'review');}
});
test('Competing claims yield one send; zero/multiple returned rows never establish ownership', async()=>{
  const{db,state}=fixture();let sent=0;const send:typeof sendDigest=async()=>{sent++;};
  await Promise.all([deliverNextDigest(db,owner,gmail,{now,send}),deliverNextDigest(db,owner,gmail,{now,send})]);assert.equal(sent,1);assert.equal(state.rows[0].status,'sent');
  const bad=fixture(undefined,{badClaimResult:true});await assert.rejects(deliverNextDigest(bad.db,owner,gmail,{now,send}),/invalid ownership/);assert.equal(sent,1);
});
test('Completed opt-out during pending Auth prevents a new atomic claim/send for either transport', async()=>{
  for(const env of [gmail,resend]){
    let started!:()=>void,release!:()=>void;
    const authStarted=new Promise<void>(resolve=>{started=resolve;}),authPending=new Promise<void>(resolve=>{release=resolve;});
    const{db,state}=fixture(undefined,{onAuth:started,authPending});let sent=0;
    const delivery=deliverNextDigest(db,owner,env,{now,send:async()=>{sent++;}});
    await authStarted;state.enabled=false;release(); // A committed save_profile before the claim transaction.
    assert.equal((await delivery).status,'empty');assert.equal(state.claimCalls,1);assert.equal(state.claims,0);assert.equal(sent,0);assert.equal(state.updates.length,0);assert.equal(state.finishes,0);assert.equal(state.rows[0].status,'pending');assert.equal(state.rows[0].first_attempt_at,null);
  }
});
test('Missing atomic claim RPC fails closed without a direct-update or legacy-claim fallback', async()=>{
  const{db,state}=fixture(undefined,{missingClaim:true});let sent=0;
  await assert.rejects(deliverNextDigest(db,owner,gmail,{now,send:async()=>{sent++;}}),/install supabase\/migrations/);
  assert.equal(sent,0);assert.equal(state.claims,0);assert.equal(state.updates.length,0);assert.equal(state.rows[0].status,'pending');
});
test('Fresh and migration SQL share profile-first atomic opt-in/eligibility guards and service-only ACL',()=>{
  const fresh=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../supabase/migrations/20261112_atomic_delivery_claim.sql',import.meta.url),'utf8');
  const block=(sql:string)=>sql.slice(sql.indexOf('create or replace function public.claim_delivery_digest('),sql.indexOf('commit;',sql.indexOf('create or replace function public.claim_delivery_digest(')));
  assert.equal(block(fresh),block(migration));const sql=block(migration);
  const lock="select config into cfg from public.profiles where owner_id = p_owner for update;",gate="if not found or cfg->'emailEnabled' is distinct from 'true'::jsonb then return null; end if;";
  assert.ok(sql.indexOf(lock)>0&&sql.indexOf(lock)<sql.indexOf(gate)&&sql.indexOf(gate)<sql.indexOf('update public.outbox as o set'));
  assert.match(fresh,/update public\.profiles set config = p_config, version = version \+ 1 where owner_id = auth\.uid\(\)/); // save_profile acquires that same row's write lock.
  for(const guard of ['o.owner_id = p_owner and o.id = p_id and o.status = p_expected_status','o.claim_token is not distinct from p_expected_token','o.first_attempt_at is not distinct from p_expected_first_attempt_at','o.lease_until is not distinct from p_expected_lease_until','o.sent_at is null',"o.status = 'pending' and o.first_attempt_at is null and o.claim_token is null","p_transport = 'resend' and o.last_error like 'transport=resend;%'","o.first_attempt_at > claimed_at - interval '23 hours'","o.status = 'sending' and o.lease_until is not null and o.lease_until <= claimed_at",'claimed_at := clock_timestamp();'])assert.ok(sql.includes(guard),guard);
  assert.match(sql,/security definer set search_path = ''/);assert.match(sql,/revoke all on function public\.claim_delivery_digest\([^;]+\) from public, anon, authenticated;/);assert.match(sql,/grant execute on function public\.claim_delivery_digest\([^;]+\) to service_role;/);
  assert.doesNotMatch(sql,/p_now|grant execute[^;]+to authenticated/i);
  const worker=readFileSync(new URL('../worker/delivery.ts',import.meta.url),'utf8');assert.doesNotMatch(worker,/rpc\('claim_digest'/);assert.doesNotMatch(worker,/randomUUID/);
});
test('Lost claim token cannot acknowledge or move another attempt to review', async()=>{
  const{db,state}=fixture();await assert.rejects(deliverNextDigest(db,owner,gmail,{now,send:async()=>{state.rows[0].claim_token='replacement-token';throw Error('timeout');}}),/lease lost/);assert.equal(state.rows[0].status,'sending');assert.equal(state.rows[0].claim_token,'replacement-token');assert.equal(state.finishes,0);
});
test('Same-provider Resend retries preserve digest ID inside 23h; expired attempts stop', async()=>{
  const{db,state}=fixture();const ids:string[]=[];
  await assert.rejects(deliverNextDigest(db,owner,resend,{now,send:async id=>{ids.push(id);throw Error('mock HTTP 503');}}),/Resend/);assert.equal(state.rows[0].status,'pending');assert.match(state.rows[0].last_error!,/^transport=resend;/);
  await deliverNextDigest(db,owner,resend,{now:now+60000,send:async id=>{ids.push(id);}});assert.deepEqual(ids,['fixture-digest','fixture-digest']);assert.equal(state.rows[0].status,'sent');
  const expired=fixture([attempted('resend','sending',24*60*60*1000)]);let sent=0;await deliverNextDigest(expired.db,owner,resend,{now,send:async()=>{sent++;}});assert.equal(expired.state.rows[0].status,'review');assert.equal(sent,0);
  const leased=fixture([attempted('resend')]);await deliverNextDigest(leased.db,owner,resend,{now,send:async()=>{sent++;}});assert.equal(leased.state.rows[0].status,'sent');assert.equal(sent,1);
});
