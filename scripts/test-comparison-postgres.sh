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
 e jsonb:='{}';
begin
 -- The legacy test correctly left Groq halted after a mock 429.
 if public.urenavi_capacity_comparison_resume_v2(repeat('a',64),t,e) then
   raise exception 'resumed without reconciled windows';
 end if;
 update public.urenavi_capacity_window_v2 set ends_at=t where provider='groq';
 for w in select distinct cw.tenant,cw.period from public.urenavi_capacity_window_v2 cw where provider='groq' and cw.tenant is not null loop
  if not public.urenavi_capacity_confirm_window_v2('groq',w.tenant,w.period,t,t+interval '35 seconds',t,4,8000,0,0)
   then raise exception 'trusted tenant window denied'; end if;
 end loop;
 for w in select * from (values ('rpm','minute','requests',32,4),('rpd','day','requests',55,4),
    ('tpm','minute','tokens',38,8000),('tpd','day','tokens',65,8000)) axes(axis,period,dim,seconds,cap)
 loop
  if not public.urenavi_capacity_confirm_window_v2('groq',null,w.period,t,t+make_interval(secs=>w.seconds),t,
   case when w.dim='requests' then w.cap else 0 end,case when w.dim='tokens' then w.cap else 0 end,0,0,w.dim)
   then raise exception 'trusted split window denied %',w.axis; end if;
  e:=e||jsonb_build_object(w.axis, jsonb_build_object('limit',w.cap,'remaining',w.cap,'resetAt',t+make_interval(secs=>w.seconds)));
 end loop;
 if public.urenavi_capacity_comparison_resume_v2(repeat('a',64),t,e-'tpd') then
  raise exception 'partial evidence opened capacity';
 end if;
 if not public.urenavi_capacity_comparison_resume_v2(repeat('a',64),t,e) then
   raise exception 'fresh reconciled evidence did not reopen capacity';
 end if;
 if (select count(*) from public.urenavi_capacity_resume_audit_v2)<>1 then raise exception 'no immutable audit'; end if;
 if not public.urenavi_capacity_reserve_v2(id,'groq',tenant,1000) then raise exception 'reserve denied'; end if;
 if public.urenavi_capacity_comparison_intent_v2(id,tenant,t-interval '1 second',e,repeat('c',64))
    or public.urenavi_capacity_comparison_intent_v2(id,tenant,t,jsonb_set(e,'{rpm,resetAt}',e->'tpm'->'resetAt'),repeat('c',64))
    or public.urenavi_capacity_comparison_intent_v2(id,tenant,t,jsonb_set(e,'{tpm,remaining}','2000'),repeat('c',64))
  then raise exception 'unbound or overstated capacity accepted'; end if;
 if not public.urenavi_capacity_comparison_intent_v2(id,tenant,t,e,repeat('c',64))
  then raise exception 'confirmed independent evidence denied'; end if;
 if public.urenavi_capacity_comparison_intent_v2(id,tenant,t,e,repeat('c',64))
  then raise exception 'duplicate send intent'; end if;
 if (select count(*) from public.urenavi_capacity_comparison_evidence_v2 where attempt_id=id)<>1
  then raise exception 'evidence not durably bound'; end if;
 if not public.urenavi_capacity_complete_v2(id,tenant,'unknown',null) then raise exception 'unknown result not stopped'; end if;
 if public.urenavi_capacity_comparison_resume_v2(repeat('b',64),t,e) then raise exception 'open hold released'; end if;
 if has_function_privilege('authenticated','public.urenavi_capacity_comparison_resume_v2(text,timestamptz,jsonb)','EXECUTE')
  then raise exception 'client recovery permission'; end if;
end $$;
SQL

# Reuse this disposable DB for cross-tenant contention on the split RPM axis.
psql -v ON_ERROR_STOP=1 <<'SQL'
truncate public.urenavi_capacity_comparison_evidence_v2,public.urenavi_capacity_attempt_v2,public.urenavi_capacity_window_v2;
update public.urenavi_capacity_provider_v2 set halted=false where provider='groq';
insert into public.urenavi_capacity_window_v2(provider,tenant,period,dimension,starts_at,ends_at,verified_at,request_limit,token_limit)
select 'groq',tenant,period,dimension,now()-interval '1 second',now()+make_interval(secs=>seconds),now(),r,t
from (values ('minute','requests',30,1,0),('day','requests',60,8,0),
 ('minute','tokens',35,0,8000),('day','tokens',70,0,8000)) w(period,dimension,seconds,r,t)
cross join (values (null::uuid)) u(tenant)
union all
select 'groq',tenant,period,'both',now()-interval '1 second',now()+interval '40 seconds',now(),4,8000
from (values ('minute'),('day')) w(period)
cross join (values ('11111111-1111-4111-8111-111111111111'::uuid),('22222222-2222-4222-8222-222222222222'::uuid)) u(tenant);
SQL
out=$(mktemp -d)
trap 'rm -rf -- "$out"' EXIT
pids=()
for i in 1 2; do
  if [[ "$i" == 1 ]]; then tenant=11111111-1111-4111-8111-111111111111; else tenant=22222222-2222-4222-8222-222222222222; fi
  psql -XAt -v ON_ERROR_STOP=1 -c "select public.urenavi_capacity_reserve_v2('40000000-0000-4000-8000-00000000000$i','groq','$tenant',1000)" > "$out/$i" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(cat "$out/1" "$out/2" | sort | tr -d '\n') == ft ]]
psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare a public.urenavi_capacity_attempt_v2%rowtype;
begin
 select * into strict a from public.urenavi_capacity_attempt_v2;
 if cardinality(a.windows)<>6 then raise exception 'reservation did not pin all windows'; end if;
 -- Move only the RPM boundary across the clock between reserve and intent.
 update public.urenavi_capacity_window_v2 set ends_at=clock_timestamp()
 where provider='groq' and tenant is null and period='minute' and dimension='requests';
 if public.urenavi_capacity_intent_v2(a.id,a.tenant) then raise exception 'cross-boundary dispatch'; end if;
 if exists(select 1 from public.urenavi_capacity_window_v2 where reserved_requests<>0 or reserved_tokens<>0)
  then raise exception 'expiry failed to release reserves'; end if;
 if (select outcome from public.urenavi_capacity_attempt_v2 where id=a.id)<>'expired'
  then raise exception 'expiry did not preserve attempt identity'; end if;
end $$;
SQL
