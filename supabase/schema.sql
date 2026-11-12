-- Run manually in your own Supabase SQL editor. No accounts are created here.
-- Fresh-project migration; browser writes are only via the two narrow RPCs below.
create table public.profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null,
  version bigint not null default 0
);
create table public.homes (
  owner_id uuid not null references public.profiles(owner_id) on delete cascade,
  key text not null, data jsonb not null,
  primary key(owner_id, key)
);
create table public.source_runs (
  owner_id uuid not null references public.profiles(owner_id) on delete cascade,
  source text not null check (source in ('gruno','solide','maxx')), data jsonb not null,
  primary key(owner_id, source)
);
create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(owner_id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','review')),
  created_at timestamptz not null default now(), first_attempt_at timestamptz,
  lease_until timestamptz, claim_token uuid, sent_at timestamptz, last_error text
);
create table public.events (
  owner_id uuid not null references public.profiles(owner_id) on delete cascade,
  id text not null, snapshot jsonb not null, notify boolean not null,
  digest_id uuid references public.outbox(id),
  primary key(owner_id, id)
);
alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.source_runs enable row level security;
alter table public.events enable row level security;
alter table public.outbox enable row level security;
create policy owner_read on public.profiles for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read on public.homes for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read on public.source_runs for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read on public.events for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read on public.outbox for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.profiles, public.homes, public.source_runs, public.events, public.outbox from anon, authenticated;
grant select on public.profiles, public.homes, public.source_runs, public.events, public.outbox to authenticated;
grant all on public.profiles, public.homes, public.source_runs, public.events, public.outbox to service_role;

create function public.save_profile(p_config jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'Invalid profile'; end if;
  -- No owner, revision, listings or worker state accepted from the browser.
  update public.profiles set config = p_config, version = version + 1 where owner_id = auth.uid();
  if not found then raise exception 'Owner not provisioned'; end if;
end $$;

create function public.set_decision(p_key text, p_decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb; cfg jsonb;
begin
  if auth.uid() is null or p_decision not in ('new','favourite','dismissed') then raise exception 'Invalid decision'; end if;
  -- Lock profile first in every writer: serialize browser decisions/profile and ingestion.
  select config into strict cfg from public.profiles where owner_id = auth.uid() for update;
  select data into strict d from public.homes where owner_id = auth.uid() and key = p_key for update;
  d := jsonb_set(d, '{decision}', to_jsonb(p_decision));
  -- Trusted acknowledgement baseline. The worker evaluates these exact stored
  -- facts against the profile applicable NOW, even if its last evaluation is stale.
  -- No profile, listing or evaluation is accepted as a browser RPC parameter.
  d := jsonb_set(d, '{decisionContext}', jsonb_build_object('listing', d->'listing', 'profile', cfg));
  if p_decision = 'dismissed' then
    -- Null is honest until the worker derives the evaluation from trusted inputs.
    d := jsonb_set(d, '{dismissal}', jsonb_build_object('listing', d->'listing', 'evaluation', null, 'profile', cfg, 'at', now()));
  end if;
  update public.homes set data = d where owner_id = auth.uid() and key = p_key;
  update public.profiles set version = version + 1 where owner_id = auth.uid();
end $$;

-- Privileged worker only. Optimistic revision prevents overwriting concurrent user choices.
-- State, immutable event snapshots and pending digest commit together, or not at all.
create function public.apply_batch(p_owner uuid, p_expected bigint, p_homes jsonb, p_events jsonb, p_runs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare current_version bigint; cfg jsonb; item jsonb; digest uuid;
begin
  select version, config into strict current_version, cfg from public.profiles where owner_id = p_owner for update;
  if current_version <> p_expected then raise exception 'Concurrent change; retry next run'; end if;
  for item in select value from jsonb_array_elements(p_homes) loop
    insert into public.homes(owner_id, key, data) values(p_owner, item->'listing'->>'key', item)
    on conflict(owner_id,key) do update set data = excluded.data;
  end loop;
  for item in select value from jsonb_array_elements(p_events) loop
    insert into public.events(owner_id,id,snapshot,notify) values(p_owner,item->>'id',item,coalesce((cfg->>'emailEnabled')::boolean,false))
    on conflict(owner_id,id) do nothing;
  end loop;
  for item in select value from jsonb_array_elements(p_runs) loop
    insert into public.source_runs(owner_id,source,data) values(p_owner,item->>'source',item)
    on conflict(owner_id,source) do update set data = excluded.data;
  end loop;
  if exists(select 1 from public.events where owner_id = p_owner and digest_id is null and notify) then
    insert into public.outbox(owner_id,payload)
    select p_owner, jsonb_agg(snapshot order by id) from public.events where owner_id = p_owner and digest_id is null and notify returning id into digest;
    update public.events set digest_id = digest where owner_id = p_owner and digest_id is null and notify;
  end if;
  update public.profiles set version = version + 1 where owner_id = p_owner;
end $$;

create function public.claim_digest(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.outbox%rowtype;
begin
  -- Resend's idempotency retention is bounded. Never auto-retry an ambiguous old send.
  update public.outbox set status = 'review', last_error = 'Retry window expired; inspect provider before manual resolution'
  where owner_id = p_owner and status in ('pending','sending') and first_attempt_at < now() - interval '23 hours';
  if not exists(select 1 from public.profiles where owner_id = p_owner and config->>'emailEnabled' = 'true') then return null; end if;
  select * into d from public.outbox where owner_id = p_owner
    and (status = 'pending' or (status = 'sending' and lease_until < now()))
    order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.outbox set status = 'sending', first_attempt_at = coalesce(first_attempt_at, now()),
    lease_until = now() + interval '10 minutes', claim_token = gen_random_uuid()
    where id = d.id returning * into d;
  return to_jsonb(d);
end $$;

create function public.finish_digest(p_owner uuid, p_id uuid, p_token uuid, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.outbox set status = case when p_error is null then 'sent' else 'pending' end,
    sent_at = case when p_error is null then now() else null end, last_error = left(p_error,500), lease_until = null
  where owner_id = p_owner and id = p_id and claim_token = p_token and status = 'sending';
  if not found then raise exception 'Digest lease lost'; end if;
end $$;
revoke all on function public.save_profile(jsonb), public.set_decision(text,text), public.apply_batch(uuid,bigint,jsonb,jsonb,jsonb), public.claim_digest(uuid), public.finish_digest(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.save_profile(jsonb), public.set_decision(text,text) to authenticated;
grant execute on function public.apply_batch(uuid,bigint,jsonb,jsonb,jsonb), public.claim_digest(uuid), public.finish_digest(uuid,uuid,uuid,text) to service_role;

-- Atomic delivery claim (also available separately for existing installations).
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

-- After disabling public signup and manually adding ONE Auth user, provision it:
-- insert into public.profiles(owner_id,config) values ('YOUR-AUTH-USER-UUID',
-- '{"city":"Groningen","minBudget":null,"maxBudget":null,"basis":"knownMonthly","minArea":null,"minBedrooms":null,"types":[],"income":null,"checkIncome":false,"includeUnknown":false,"emailEnabled":false}');
