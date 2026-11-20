-- Isolated experiment only. This does not replace the verified official-capacity
-- v2 admission path or authorize Groq transport. Install on disposable DB only.
-- Self budgets count OUR confirmed reservations conservatively, NOT provider
-- remaining limits. External organization use is unknown and may cause 429.
create table public.urenavi_self_budget_policy_v2 (
 provider text primary key references public.urenavi_capacity_provider_v2(provider),
 enabled boolean not null default false,
 max_minute_requests integer not null check(max_minute_requests between 1 and 1000000),
 max_minute_tokens bigint not null check(max_minute_tokens between 1 and 1000000000),
 max_day_requests integer not null check(max_day_requests between 1 and 1000000),
 max_day_tokens bigint not null check(max_day_tokens between 1 and 1000000000),
 max_tenant_day_requests integer not null check(max_tenant_day_requests between 1 and 1000000),
 check(max_tenant_day_requests<=max_day_requests)
);
create table public.urenavi_self_budget_attempt_v2 (
 id uuid primary key,
 provider text not null references public.urenavi_capacity_provider_v2(provider),
 tenant uuid not null,
 reserved_at timestamptz not null default clock_timestamp(),
 estimated_tokens bigint not null check(estimated_tokens between 1 and 1000000000),
 outcome text not null default 'reserved' check(outcome in ('reserved','sent','spent','unknown','rate_limited')),
 actual_tokens bigint check(actual_tokens between 0 and 1000000000),
 check((outcome='spent' and actual_tokens is not null) or
       (outcome<>'spent' and actual_tokens is null))
);
create index urenavi_self_budget_attempt_provider_time_v2
 on public.urenavi_self_budget_attempt_v2(provider,reserved_at);
create index urenavi_self_budget_attempt_tenant_time_v2
 on public.urenavi_self_budget_attempt_v2(provider,tenant,reserved_at);
alter table public.urenavi_self_budget_policy_v2 enable row level security;
alter table public.urenavi_self_budget_attempt_v2 enable row level security;
revoke all on public.urenavi_self_budget_policy_v2,public.urenavi_self_budget_attempt_v2
 from public,anon,authenticated;
grant select,insert,update on public.urenavi_self_budget_policy_v2,
 public.urenavi_self_budget_attempt_v2 to service_role;

-- The provider lock is shared with the already-tested v2 reservation/stop path.
-- Every attempt (including unknown, failed and pre-intent) consumes its maximum
-- estimated capacity for the entire owning window. No inferred refunds.
create function public.urenavi_self_budget_reserve_v2(
 p_id uuid,p_tenant uuid,p_estimate bigint)
returns boolean language plpgsql set search_path='' as $$
declare policy public.urenavi_self_budget_policy_v2%rowtype;
 t timestamptz; minute_start timestamptz; day_start timestamptz;
 minute_calls bigint; minute_tokens bigint; day_calls bigint;
 day_tokens bigint; tenant_calls bigint;
begin
 if p_id is null or p_tenant is null or p_estimate is null
   or p_estimate not between 1 and 1000000000 then return false; end if;
 perform 1 from public.urenavi_capacity_provider_v2
   where provider='groq' and not halted for update;
 if not found then return false; end if;
 select * into policy from public.urenavi_self_budget_policy_v2
   where provider='groq' and enabled;
 if not found then return false; end if;
 if exists(select 1 from public.urenavi_self_budget_attempt_v2
   where id=p_id or (provider='groq' and outcome='sent')) then return false; end if;
 t:=clock_timestamp();
 minute_start:=date_trunc('minute',t at time zone 'UTC') at time zone 'UTC';
 day_start:=date_trunc('day',t at time zone 'UTC') at time zone 'UTC';
 select count(*),coalesce(sum(estimated_tokens),0) into minute_calls,minute_tokens
 from public.urenavi_self_budget_attempt_v2 where provider='groq'
   and reserved_at>=minute_start and reserved_at<t+interval '1 second';
 select count(*),coalesce(sum(estimated_tokens),0),
   count(*) filter(where tenant=p_tenant)
 into day_calls,day_tokens,tenant_calls
 from public.urenavi_self_budget_attempt_v2 where provider='groq'
   and reserved_at>=day_start and reserved_at<t+interval '1 second';
 if minute_calls+1>policy.max_minute_requests
   or minute_tokens+p_estimate>policy.max_minute_tokens
   or day_calls+1>policy.max_day_requests
   or day_tokens+p_estimate>policy.max_day_tokens
   or tenant_calls+1>policy.max_tenant_day_requests then return false; end if;
 insert into public.urenavi_self_budget_attempt_v2
   (id,provider,tenant,reserved_at,estimated_tokens)
 values(p_id,'groq',p_tenant,t,p_estimate);
 return true;
end $$;

create function public.urenavi_self_budget_intent_v2(
 p_id uuid,p_tenant uuid)
returns boolean language plpgsql set search_path='' as $$
declare a public.urenavi_self_budget_attempt_v2%rowtype;
begin
 perform 1 from public.urenavi_capacity_provider_v2
  where provider='groq' and not halted for update;
 if not found then return false; end if;
 perform 1 from public.urenavi_self_budget_policy_v2
  where provider='groq' and enabled;
 if not found then return false; end if;
 select * into a from public.urenavi_self_budget_attempt_v2
  where id=p_id and tenant=p_tenant and provider='groq' for update;
 if not found or a.outcome<>'reserved'
   or a.reserved_at<clock_timestamp()-interval '30 seconds' then return false; end if;
 if exists(select 1 from public.urenavi_self_budget_attempt_v2
  where provider='groq' and outcome='sent' and id<>p_id)
  or exists(select 1 from public.urenavi_capacity_attempt_v2
  where provider='groq' and outcome='sent') then return false; end if;
 update public.urenavi_self_budget_attempt_v2 set outcome='sent' where id=p_id;
 -- Reserve the shared provider halt until this send settles. The original
 -- v2 dispatch gate reads this same flag, so the two modes cannot overlap.
 update public.urenavi_capacity_provider_v2 set halted=true where provider='groq';
 return true;
end $$;

create function public.urenavi_self_budget_complete_v2(
 p_id uuid,p_tenant uuid,p_outcome text,p_actual bigint)
returns boolean language plpgsql set search_path='' as $$
declare a public.urenavi_self_budget_attempt_v2%rowtype;
begin
 if p_outcome is null or p_outcome not in ('spent','unknown','rate_limited')
   or (p_outcome='spent' and (p_actual is null or p_actual not between 0 and 1000000000))
   or (p_outcome<>'spent' and p_actual is not null) then return false; end if;
 perform 1 from public.urenavi_capacity_provider_v2 where provider='groq' for update;
 if not found then return false; end if;
 select * into a from public.urenavi_self_budget_attempt_v2
   where id=p_id and tenant=p_tenant and provider='groq' for update;
 if not found or a.outcome<>'sent' then return false; end if;
 update public.urenavi_self_budget_attempt_v2
  set outcome=p_outcome, actual_tokens=p_actual where id=p_id;
 if p_outcome='spent' and p_actual<=a.estimated_tokens then
  update public.urenavi_capacity_provider_v2 set halted=false where provider='groq';
 else
  -- Unknown use, a 429, or overrun retains the shared provider halt.
  update public.urenavi_capacity_provider_v2 set halted=true where provider='groq';
 end if;
 return true;
end $$;
revoke all on function public.urenavi_self_budget_reserve_v2(uuid,uuid,bigint),
 public.urenavi_self_budget_intent_v2(uuid,uuid),
 public.urenavi_self_budget_complete_v2(uuid,uuid,text,bigint)
 from public,anon,authenticated;
grant execute on function public.urenavi_self_budget_reserve_v2(uuid,uuid,bigint),
 public.urenavi_self_budget_intent_v2(uuid,uuid),
 public.urenavi_self_budget_complete_v2(uuid,uuid,text,bigint)
 to service_role;
