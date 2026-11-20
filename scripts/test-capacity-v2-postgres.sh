#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres
unset PGHOSTADDR PGSERVICE
psql -v ON_ERROR_STOP=1 -f docs/architecture/multitenant-capacity-v2.sql
psql -v ON_ERROR_STOP=1 <<'SQL'
insert into public.urenavi_capacity_provider_v2(provider) values('groq'),('gemini');
insert into public.urenavi_capacity_window_v2(provider,tenant,period,starts_at,ends_at,verified_at,request_limit,token_limit)
 select provider,tenant,period,now()-interval '1 second',now()+interval '30 seconds',now(),
   case when period='minute' and tenant is null then 2 else 20 end,10000
 from (values('groq'),('gemini')) p(provider)
 cross join (values (null::uuid),('11111111-1111-4111-8111-111111111111'::uuid),('22222222-2222-4222-8222-222222222222'::uuid)) u(tenant)
 cross join (values ('minute'),('day')) w(period);
SQL
out=$(mktemp -d)
trap 'rm -r "$out"' EXIT
tenant=11111111-1111-4111-8111-111111111111
other=22222222-2222-4222-8222-222222222222
pids=()
for i in {1..8}; do
  index=$(( (i+1)/2 ))
  attempt=$(printf '10000000-0000-4000-8000-%012d' "$index")
  psql -At -v ON_ERROR_STOP=1 -c "select public.urenavi_capacity_reserve_v2('$attempt','groq','$tenant',1000)" > "$out/$i" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(grep -l '^t$' "$out" | wc -l) -eq 2 ]]
psql -v ON_ERROR_STOP=1 <<SQL
do \$test\$
declare first_id uuid; second_id uuid;
begin
 select min(id::text)::uuid,max(id::text)::uuid into first_id,second_id from public.urenavi_capacity_attempt_v2 where provider='groq';
 if (select count(*) from public.urenavi_capacity_attempt_v2 where provider='groq')<>2 then raise exception 'reservation count'; end if;
 if not public.urenavi_capacity_intent_v2(first_id,'$tenant') then raise exception 'first intent'; end if;
 if public.urenavi_capacity_intent_v2(first_id,'$tenant') then raise exception 'duplicate intent'; end if;
 if public.urenavi_capacity_intent_v2(second_id,'$tenant') then raise exception 'overlapping provider dispatch'; end if;
 if not public.urenavi_capacity_complete_v2(first_id,'$tenant','rate_limited',null) then raise exception '429 settlement'; end if;
 if public.urenavi_capacity_intent_v2(second_id,'$tenant') then raise exception '429 must block pending tenant'; end if;
 if public.urenavi_capacity_reserve_v2('10000000-0000-4000-8000-000000000010','groq','$other',1) then raise exception '429 must block other tenant'; end if;
 if (select count(*) from public.urenavi_capacity_window_v2 where provider='groq' and reserved_tokens=2000)<>4 then raise exception 'rate limit must retain reservation'; end if;
end
\$test\$;
do \$test\$
declare a uuid:='20000000-0000-4000-8000-000000000001';
 b uuid:='20000000-0000-4000-8000-000000000002'; now_value timestamptz; w record;
begin
 update public.urenavi_capacity_window_v2 set token_limit=900 where provider='gemini' and period='day' and tenant='$tenant';
 if public.urenavi_capacity_reserve_v2(a,'gemini','$tenant',1000) then raise exception 'tenant daily token cap'; end if;
 update public.urenavi_capacity_window_v2 set token_limit=10000 where provider='gemini';
 if not public.urenavi_capacity_reserve_v2(a,'gemini','$tenant',1000) then raise exception 'reserve'; end if;
 if not public.urenavi_capacity_intent_v2(a,'$tenant') then raise exception 'send'; end if;
 now_value:=clock_timestamp();
 update public.urenavi_capacity_window_v2 set ends_at=now_value where provider='gemini';
 if public.urenavi_capacity_reserve_v2(b,'gemini','$tenant',1000) then raise exception 'no inferred rollover'; end if;
 for w in select tenant,period from public.urenavi_capacity_window_v2 where provider='gemini' loop
   if not public.urenavi_capacity_confirm_window_v2('gemini',w.tenant,w.period,now_value,now_value+interval '30 seconds',now_value,5,10000,0,0)
    then raise exception 'trusted window did not roll over'; end if;
 end loop;
 if not public.urenavi_capacity_complete_v2(a,'$tenant','spent',500) then raise exception 'settle after rollover'; end if;
 if (select count(*) from public.urenavi_capacity_window_v2 where provider='gemini' and ends_at=now_value and tokens=500 and reserved_tokens=0)<>4
    or exists(select 1 from public.urenavi_capacity_window_v2 where provider='gemini' and starts_at=now_value and tokens<>0)
   then raise exception 'settlement changed wrong windows'; end if;
 if public.urenavi_capacity_complete_v2(a,'$tenant','spent',500) then raise exception 'duplicate settlement'; end if;
 if public.urenavi_capacity_reserve_v2(b,'gemini','$tenant',1000) then raise exception 'unattributed cross-window spend must halt'; end if;
 -- Simulate independent verified reconciliation in this disposable fixture.
 update public.urenavi_capacity_provider_v2 set halted=false where provider='gemini';
 if not public.urenavi_capacity_reserve_v2(b,'gemini','$tenant',1000) then raise exception 'new window reservation'; end if;
 if not public.urenavi_capacity_intent_v2(b,'$tenant') then raise exception 'send'; end if;
 if not public.urenavi_capacity_complete_v2(b,'$tenant','unknown',null) then raise exception 'unknown settlement'; end if;
 if public.urenavi_capacity_reserve_v2('20000000-0000-4000-8000-000000000003','gemini','$other',1) then raise exception 'unknown must block other tenants'; end if;
 if has_function_privilege('authenticated','public.urenavi_capacity_reserve_v2(uuid,text,uuid,bigint)','EXECUTE') then raise exception 'client permission'; end if;
end
\$test\$;
SQL
