#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres
unset PGHOSTADDR PGSERVICE
psql -v ON_ERROR_STOP=1 -f docs/architecture/comparison-capacity-v2.sql
psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
 t timestamptz:=clock_timestamp();
 tenant uuid:='11111111-1111-4111-8111-111111111111';
 id uuid:='30000000-0000-4000-8000-000000000001';
 w record;
begin
 -- The previous test correctly left Groq halted after a mock 429.
 if public.urenavi_capacity_comparison_resume_v2(repeat('a',64),t) then
   raise exception 'resumed without reconciled windows';
 end if;
 update public.urenavi_capacity_window_v2 set ends_at=t where provider='groq';
 for w in select cw.tenant,cw.period from public.urenavi_capacity_window_v2 cw where provider='groq' loop
  if not public.urenavi_capacity_confirm_window_v2('groq',w.tenant,w.period,t,t+interval '30 seconds',t,4,8000,0,0)
   then raise exception 'trusted new window denied'; end if;
 end loop;
 if not public.urenavi_capacity_comparison_resume_v2(repeat('a',64),t) then
   raise exception 'fresh reconciled evidence did not reopen capacity';
 end if;
 if (select count(*) from public.urenavi_capacity_resume_audit_v2)<>1 then raise exception 'no immutable audit'; end if;
 if not public.urenavi_capacity_reserve_v2(id,'groq',tenant,1000) then raise exception 'reserve denied'; end if;
 if public.urenavi_capacity_comparison_intent_v2(id,tenant,t-interval '1 second',t+interval '30 seconds',t+interval '30 seconds',repeat('c',64))
  then raise exception 'unbound evidence accepted'; end if;
 if not public.urenavi_capacity_comparison_intent_v2(id,tenant,t,t+interval '30 seconds',t+interval '30 seconds',repeat('c',64))
  then raise exception 'confirmed evidence denied'; end if;
 if public.urenavi_capacity_comparison_intent_v2(id,tenant,t,t+interval '30 seconds',t+interval '30 seconds',repeat('c',64))
  then raise exception 'duplicate send intent'; end if;
 if (select count(*) from public.urenavi_capacity_comparison_evidence_v2 where attempt_id=id)<>1
  then raise exception 'evidence not durably bound'; end if;
 if not public.urenavi_capacity_complete_v2(id,tenant,'unknown',null) then raise exception 'unknown result not stopped'; end if;
 if public.urenavi_capacity_comparison_resume_v2(repeat('b',64),t) then raise exception 'open hold released'; end if;
 if has_function_privilege('authenticated','public.urenavi_capacity_comparison_resume_v2(text,timestamptz)','EXECUTE')
  then raise exception 'client recovery permission'; end if;
end $$;
SQL
