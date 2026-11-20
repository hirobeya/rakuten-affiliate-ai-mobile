#!/usr/bin/env bash
set -euo pipefail
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -Xv ON_ERROR_STOP=1 -f docs/architecture/isolated-self-budget-v2.sql
psql -Xv ON_ERROR_STOP=1 <<'SQL'
insert into public.urenavi_self_budget_policy_v2
(provider,max_minute_requests,max_minute_tokens,max_day_requests,max_day_tokens,max_tenant_day_requests)
values('groq',1,2500,2,4500,2);
do $$
declare a uuid:='51000000-0000-4000-8000-000000000001';
 tenant uuid:='11111111-1111-4111-8111-111111111111';
begin
 update public.urenavi_capacity_provider_v2 set halted=false where provider='groq';
 if public.urenavi_self_budget_reserve_v2(a,tenant,1000) then
  raise exception 'default-disabled self budget issued a reservation'; end if;
 if has_function_privilege('authenticated','public.urenavi_self_budget_reserve_v2(uuid,uuid,bigint)','EXECUTE')
  or has_table_privilege('authenticated','public.urenavi_self_budget_attempt_v2','SELECT') then
  raise exception 'client can access protected self budget'; end if;
 update public.urenavi_self_budget_policy_v2 set enabled=true where provider='groq';
 if not public.urenavi_self_budget_reserve_v2(a,tenant,1000) then
  raise exception 'known self budget was not reserved'; end if;
 if public.urenavi_self_budget_reserve_v2(a,tenant,1000) then
  raise exception 'duplicate ID reserved twice'; end if;
 if public.urenavi_self_budget_reserve_v2('51000000-0000-4000-8000-000000000002',
 '22222222-2222-4222-8222-222222222222',1000) then
  raise exception 'organization minute quota bypassed'; end if;
 if public.urenavi_self_budget_intent_v2(a,'22222222-2222-4222-8222-222222222222') then
  raise exception 'other tenant claimed intent'; end if;
 if not public.urenavi_self_budget_intent_v2(a,tenant) then
  raise exception 'durable intent denied'; end if;
 if public.urenavi_self_budget_intent_v2(a,tenant) then
  raise exception 'duplicate send intent'; end if;
 if not public.urenavi_self_budget_complete_v2(a,tenant,'spent',800) then
  raise exception 'known usage not settled'; end if;
 if public.urenavi_self_budget_complete_v2(a,tenant,'spent',800) then
  raise exception 'double settlement'; end if;
 if (select estimated_tokens from public.urenavi_self_budget_attempt_v2 where id=a)<>1000
    or (select actual_tokens from public.urenavi_self_budget_attempt_v2 where id=a)<>800 then
  raise exception 'reservation and actual usage conflated'; end if;
end $$;
-- Remove only the artificial minute-window pressure by aging the test
-- reservation; keep its day-level record for subsequent conservative accounting.
update public.urenavi_self_budget_attempt_v2
set reserved_at=clock_timestamp()-interval '70 seconds'
where id='51000000-0000-4000-8000-000000000001';
do $$
declare tenant uuid:='11111111-1111-4111-8111-111111111111';
 id uuid:='51000000-0000-4000-8000-000000000003';
begin
 if not public.urenavi_self_budget_reserve_v2(id,tenant,2000) then
  raise exception 'second own minute reservation denied'; end if;
 if public.urenavi_self_budget_reserve_v2('51000000-0000-4000-8000-000000000004',tenant,1) then
  raise exception 'daily request cap bypassed'; end if;
 if not public.urenavi_self_budget_intent_v2(id,tenant) then
  raise exception 'second durable intent denied'; end if;
 if not public.urenavi_self_budget_complete_v2(id,tenant,'unknown',null) then
  raise exception 'unknown send not stored'; end if;
 if (select halted from public.urenavi_capacity_provider_v2 where provider='groq')<>true then
  raise exception 'unknown send did not halt shared provider'; end if;
 if public.urenavi_self_budget_reserve_v2('51000000-0000-4000-8000-000000000005',tenant,1) then
  raise exception 'halted provider admitted more work'; end if;
 if (select count(*) from public.urenavi_self_budget_attempt_v2 where provider='groq')<>2 then
  raise exception 'conservative reservations not retained'; end if;
end $$;
SQL
