-- DRAFT ONLY: not deployed. Review against actual DB and apply only on an isolated test project.
-- All functions/tables are service-role only; no client Data API permission.
-- This is an append-only reservation baseline: reservations are NOT refunded automatically.
create table if not exists public.urenavi_provider_capacity_v1 (
 provider text primary key check (provider in ('gemini','groq')),
 window_end timestamptz not null,
 verified_at timestamptz not null,
 external_usage_known boolean not null default false,
 request_limit bigint not null check(request_limit>=0),
 request_used bigint not null check(request_used>=0),
 request_reserved bigint not null default 0 check(request_reserved>=0),
 token_limit bigint not null check(token_limit>=0),
 token_used bigint not null check(token_used>=0),
 token_reserved bigint not null default 0 check(token_reserved>=0)
);
create table if not exists public.urenavi_tenant_capacity_v1 (
 user_id uuid not null,
 provider text not null references public.urenavi_provider_capacity_v1(provider),
 window_end timestamptz not null,
 request_limit bigint not null check(request_limit>=0),
 request_used bigint not null default 0 check(request_used>=0),
 request_reserved bigint not null default 0 check(request_reserved>=0),
 primary key(user_id,provider)
);
create table if not exists public.urenavi_capacity_attempts_v1 (
 attempt_id uuid primary key,
 user_id uuid not null,
 provider text not null,
 estimated_tokens bigint not null check(estimated_tokens>0),
 window_end timestamptz not null,
 status text not null default 'reserved' check(status in ('reserved','send_intent','spent','outcome_unknown')),
 created_at timestamptz not null default now()
);
alter table public.urenavi_provider_capacity_v1 enable row level security;
alter table public.urenavi_tenant_capacity_v1 enable row level security;
alter table public.urenavi_capacity_attempts_v1 enable row level security;
revoke all on public.urenavi_provider_capacity_v1,public.urenavi_tenant_capacity_v1,public.urenavi_capacity_attempts_v1 from public,anon,authenticated;
grant select,insert,update on public.urenavi_provider_capacity_v1,public.urenavi_tenant_capacity_v1,public.urenavi_capacity_attempts_v1 to service_role;

create or replace function public.urenavi_capacity_reserve_v1(
 p_attempt_id uuid,p_user_id uuid,p_provider text,
 p_estimated_tokens bigint,p_window_end timestamptz
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.urenavi_provider_capacity_v1%rowtype;
        t public.urenavi_tenant_capacity_v1%rowtype;
begin
 -- Never modify an existing attempt. No replay, not even if the first result was lost.
 if exists(select 1 from public.urenavi_capacity_attempts_v1 where attempt_id=p_attempt_id) then
   return jsonb_build_object('reserved',false,'reason','attempt_already_exists');
 end if;
 if p_user_id is null or p_attempt_id is null or p_estimated_tokens is null or p_estimated_tokens<=0
    or p_provider not in ('groq','gemini') or p_window_end is null then
   return jsonb_build_object('reserved',false,'reason','invalid_request');
 end if;
 -- Locks serialize all tenants of the same provider; prevents shared-limit overspend.
 select * into p from public.urenavi_provider_capacity_v1 where provider=p_provider for update;
 if not found then return jsonb_build_object('reserved',false,'reason','provider_missing'); end if;
 select * into t from public.urenavi_tenant_capacity_v1
   where user_id=p_user_id and provider=p_provider for update;
 if not found then return jsonb_build_object('reserved',false,'reason','tenant_missing'); end if;
 if p.window_end<=now() or t.window_end<>p.window_end or p.window_end<>p_window_end
    or p.verified_at < now()-interval '5 minutes' or not p.external_usage_known then
   return jsonb_build_object('reserved',false,'reason','fresh_verified_capacity_unavailable');
 end if;
 if p.request_used+p.request_reserved>=p.request_limit
    or p.token_used+p.token_reserved>p.token_limit-p_estimated_tokens then
   return jsonb_build_object('reserved',false,'reason','provider_exhausted');
 end if;
 if t.request_used+t.request_reserved>=t.request_limit then
   return jsonb_build_object('reserved',false,'reason','tenant_exhausted');
 end if;
 -- A unique violation from a concurrent duplicate aborts the transaction:
 -- it must never be silently retried by the caller.
 insert into public.urenavi_capacity_attempts_v1(attempt_id,user_id,provider,estimated_tokens,window_end)
 values(p_attempt_id,p_user_id,p_provider,p_estimated_tokens,p.window_end);
 update public.urenavi_provider_capacity_v1
   set request_reserved=request_reserved+1, token_reserved=token_reserved+p_estimated_tokens
   where provider=p_provider;
 update public.urenavi_tenant_capacity_v1
   set request_reserved=request_reserved+1 where user_id=p_user_id and provider=p_provider;
 return jsonb_build_object('reserved',true,'attemptId',p_attempt_id::text,'userId',p_user_id::text);
end $$;
revoke all on function public.urenavi_capacity_reserve_v1(uuid,uuid,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_reserve_v1(uuid,uuid,text,bigint,timestamptz) to service_role;

-- Reservation is not a dispatch permit. Send-intent and completion follow.

-- State transitions are separate from reservation. Reserving alone NEVER permits dispatch.
-- A successful send_intent receipt MUST be durably obtained before one provider request.
-- A lost send_intent receipt is a HOLD (not permission to retry).
create or replace function public.urenavi_capacity_send_intent_v1(
 p_attempt_id uuid,p_user_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.urenavi_capacity_attempts_v1%rowtype;
begin
 select * into a from public.urenavi_capacity_attempts_v1
   where attempt_id=p_attempt_id and user_id=p_user_id for update;
 if not found then
   return jsonb_build_object('accepted',false,'reason','attempt_missing');
 end if;
 if a.status<>'reserved' then
   return jsonb_build_object('accepted',false,'reason','already_transitioned');
 end if;
 -- One-way transition. No request replay after the first send intent.
 update public.urenavi_capacity_attempts_v1
   set status='send_intent' where attempt_id=p_attempt_id;
 return jsonb_build_object('accepted',true,'attemptId',p_attempt_id::text,'userId',p_user_id::text);
end $$;
revoke all on function public.urenavi_capacity_send_intent_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_send_intent_v1(uuid,uuid) to service_role;

-- A confirmed successful response moves the reservation to spent.
-- Unknown/failed/timeout outcomes keep the full reserved token amount: no automatic refund.
-- A second completion call does not mutate counters.
create or replace function public.urenavi_capacity_complete_v1(
 p_attempt_id uuid,p_user_id uuid,p_outcome text,p_actual_tokens bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.urenavi_capacity_attempts_v1%rowtype;
begin
 select * into a from public.urenavi_capacity_attempts_v1
   where attempt_id=p_attempt_id and user_id=p_user_id for update;
 if not found then return jsonb_build_object('accepted',false,'reason','attempt_missing'); end if;
 if a.status<>'send_intent' then
   return jsonb_build_object('accepted',false,'reason','invalid_transition');
 end if;
 if p_outcome='spent' then
   if p_actual_tokens is null or p_actual_tokens<0 then
     return jsonb_build_object('accepted',false,'reason','actual_usage_unknown');
   end if;
   -- Serialize counters with the same provider lock order used by reservation.
   perform 1 from public.urenavi_provider_capacity_v1 where provider=a.provider for update;
   perform 1 from public.urenavi_tenant_capacity_v1
     where user_id=a.user_id and provider=a.provider for update;
   -- Provider may consume more than the estimate even on HTTP 200.
   -- Record the REAL amount, and close future admissions until an operator
   -- obtains fresh authoritative quota evidence; never hide an overrun.
   update public.urenavi_provider_capacity_v1
     set request_reserved=request_reserved-1, request_used=request_used+1,
       token_reserved=token_reserved-a.estimated_tokens,
       token_used=token_used+p_actual_tokens,
       external_usage_known=external_usage_known and p_actual_tokens<=a.estimated_tokens
     where provider=a.provider and request_reserved>0 and token_reserved>=a.estimated_tokens;
   if not found then raise exception 'global_accounting_inconsistent'; end if;
   update public.urenavi_tenant_capacity_v1
     set request_reserved=request_reserved-1,request_used=request_used+1
     where user_id=a.user_id and provider=a.provider and request_reserved>0;
   if not found then raise exception 'tenant_accounting_inconsistent'; end if;
   update public.urenavi_capacity_attempts_v1 set status='spent' where attempt_id=a.attempt_id;
 elsif p_outcome='outcome_unknown' then
   if p_actual_tokens is not null then
     return jsonb_build_object('accepted',false,'reason','unknown_must_not_claim_known_tokens');
   end if;
   update public.urenavi_capacity_attempts_v1
     set status='outcome_unknown' where attempt_id=a.attempt_id;
 else
   return jsonb_build_object('accepted',false,'reason','invalid_outcome');
 end if;
 return jsonb_build_object('accepted',true,'status',p_outcome,'attemptId',p_attempt_id::text);
end $$;
revoke all on function public.urenavi_capacity_complete_v1(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_complete_v1(uuid,uuid,text,bigint) to service_role;

-- Explicitly OUT OF SCOPE: confirmed send_not_started release, window rollover,
-- true subscription quota derivation, human-reviewed unknown-usage reconciliation.
-- This SQL is a disposable-Postgres test draft, NOT a production migration.
