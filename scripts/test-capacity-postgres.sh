#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres
psql -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
SQL
psql -v ON_ERROR_STOP=1 -f docs/architecture/multitenant-capacity-db-draft.sql
psql -v ON_ERROR_STOP=1 <<'SQL'
insert into public.urenavi_provider_capacity_v1
 (provider,window_end,verified_at,external_usage_known,request_limit,request_used,request_reserved,token_limit,token_used,token_reserved)
 values ('gemini',now()+interval '1 hour',now(),true,2,0,0,5000,0,0);
insert into public.urenavi_tenant_capacity_v1
 (user_id,provider,window_end,request_limit,request_used,request_reserved)
 select x.id,'gemini',p.window_end,2,0,0
 from (values ('11111111-1111-4111-8111-111111111111'::uuid),
 ('22222222-2222-4222-8222-222222222222'::uuid)) x(id)
 cross join public.urenavi_provider_capacity_v1 p where p.provider='gemini';
do $$
begin
 if has_table_privilege('anon','public.urenavi_capacity_attempts_v1','SELECT') or
    has_table_privilege('authenticated','public.urenavi_provider_capacity_v1','INSERT') or
    has_function_privilege('authenticated','public.urenavi_capacity_reserve_v1(uuid,uuid,text,bigint,timestamptz)','EXECUTE') then
    raise exception 'client can access reserved capacity resources';
 end if;
end $$;
SQL
window_end="$(psql -At -c "select window_end from public.urenavi_provider_capacity_v1 where provider='gemini'")"
attempts=()
for i in $(seq 1 8); do
  aid="$(printf '00000000-0000-4000-8000-%012d' "$i")"
  user='11111111-1111-4111-8111-111111111111'
  if (( i % 2 == 0 )); then user='22222222-2222-4222-8222-222222222222'; fi
  psql -At -v ON_ERROR_STOP=1 -c "select public.urenavi_capacity_reserve_v1('$aid','$user','gemini',1000,'$window_end')" >"/tmp/cap-result-$i" 2>"/tmp/cap-error-$i" &
  attempts+=("$!")
done
for pid in "${attempts[@]}"; do wait "$pid"; done
success=0
for i in $(seq 1 8); do
  if grep -q '"reserved": true' "/tmp/cap-result-$i"; then success=$((success+1)); fi
done
if [[ "$success" -ne 2 ]]; then echo "expected exactly two atomic reservations, got $success"; exit 1; fi
psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare p record; t record; attempts integer;
begin
 select * into p from public.urenavi_provider_capacity_v1 where provider='gemini';
 select count(*) into attempts from public.urenavi_capacity_attempts_v1;
 if p.request_reserved<>2 or p.token_reserved<>2000 or attempts<>2 then
  raise exception 'global atomic accounting mismatch';
 end if;
 if exists(select 1 from public.urenavi_tenant_capacity_v1 where request_reserved>request_limit) then
  raise exception 'tenant capacity overdraw';
 end if;
end $$;
SQL
first_id="$(psql -At -c 'select attempt_id from public.urenavi_capacity_attempts_v1 order by attempt_id limit 1')"
replayed="$(psql -At -c "select public.urenavi_capacity_reserve_v1('$first_id','11111111-1111-4111-8111-111111111111','gemini',1000,'$window_end')")"
if [[ "$replayed" != *'"reserved": false'* ]]; then echo 'duplicate reservation was accepted'; exit 1; fi
psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r jsonb;
begin
 select public.urenavi_capacity_reserve_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111','gemini',1000,
 (select window_end from public.urenavi_provider_capacity_v1 where provider='gemini')) into r;
 if r->>'reason'<>'provider_exhausted' then raise exception 'exhausted budget accepted'; end if;
 update public.urenavi_provider_capacity_v1 set external_usage_known=false where provider='gemini';
 select public.urenavi_capacity_reserve_v1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111','gemini',1000,
 (select window_end from public.urenavi_provider_capacity_v1 where provider='gemini')) into r;
 if r->>'reason'<>'fresh_verified_capacity_unavailable' then raise exception 'unknown usage accepted'; end if;
end $$;
SQL
echo 'PASS: Postgres atomic reservation / concurrency / duplicate / exhaustion / unknown usage / client privilege'
