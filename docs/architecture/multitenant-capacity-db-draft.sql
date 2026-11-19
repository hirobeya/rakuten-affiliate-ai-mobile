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

-- BLOCKED pending isolated DB verification and a durable send-intent/state transition.
-- The request must NOT call any AI merely because this reservation RPC succeeded.
-- Reconciliation, window rollover and subscription lifecycle remain separate work.
