#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres
psql -Xv ON_ERROR_STOP=1 -f docs/architecture/isolated-comparison-journal-v2.sql
psql -Xv ON_ERROR_STOP=1 <<'SQL'
begin;
do $$
declare
 owner_token text:='22222222-2222-4222-8222-222222222222';
 other_token text:='33333333-3333-4333-8333-333333333333';
begin
 if has_function_privilege('anon','public.urenavi_comparison_journal_create_v2(text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.urenavi_comparison_journal_lock_v2(text)','EXECUTE')
    or has_table_privilege('authenticated','public.urenavi_comparison_journal_v2','SELECT') then
  raise exception 'journal_exposed_to_clients'; end if;
 if not public.urenavi_comparison_journal_lock_v2(owner_token) then
  raise exception 'exclusive_lock_missing'; end if;
 if public.urenavi_comparison_journal_lock_v2(other_token) then
  raise exception 'second_lock_accepted'; end if;
 if public.urenavi_comparison_journal_unlock_v2(other_token) then
  raise exception 'lock_stolen'; end if;
 if not public.urenavi_comparison_journal_create_v2('send-intent',
  '{"text":"日本語の記録","usedTokens":800}') then
  raise exception 'journal_create_failed'; end if;
 if public.urenavi_comparison_journal_create_v2('send-intent',
  '{"text":"改ざん"}') then
  raise exception 'journal_overwrite'; end if;
 if public.urenavi_comparison_journal_create_v2('execution-lock','{"x":1}') then
  raise exception 'reserved_lock_key_accepted'; end if;
 if public.urenavi_comparison_journal_read_v2('send-intent')
   <> '{"text":"日本語の記録","usedTokens":800}' then
  raise exception 'payload_not_preserved'; end if;
 if public.urenavi_comparison_journal_read_v2('absent') is not null then
  raise exception 'missing_journal_record_not_null'; end if;
 if not public.urenavi_comparison_journal_unlock_v2(owner_token) then
  raise exception 'lock_release_failed'; end if;
 if public.urenavi_comparison_journal_unlock_v2(owner_token) then
  raise exception 'double_unlock_accepted'; end if;
end $$;
rollback;
SQL
