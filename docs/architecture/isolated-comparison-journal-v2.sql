-- Isolation-only durable comparison journal. No Production migration.
-- The database is the sole source of truth; an interrupted execution-lock is
-- intentionally not released by time or process restart (manual recovery).
create table public.urenavi_comparison_journal_v2 (
 key text primary key check (key ~ '^[a-z0-9-]{1,100}$'),
 value_text text not null check (octet_length(value_text) between 1 and 1048576),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.urenavi_comparison_journal_v2 enable row level security;
revoke all on public.urenavi_comparison_journal_v2 from public,anon,authenticated;
grant select,insert,delete on public.urenavi_comparison_journal_v2 to service_role;

create function public.urenavi_comparison_journal_create_v2(p_key text,p_value text)
returns boolean language plpgsql set search_path='' as $$
begin
 if p_key is null or p_key !~ '^[a-z0-9-]{1,100}$'
  or p_key='execution-lock' or p_value is null
  or octet_length(p_value) not between 1 and 1048576
  or not (p_value is json) then return false; end if;
 insert into public.urenavi_comparison_journal_v2(key,value_text)
 values(p_key,p_value) on conflict do nothing;
 return found;
end $$;

create function public.urenavi_comparison_journal_read_v2(p_key text)
returns text language sql stable set search_path='' as $$
 select j.value_text from public.urenavi_comparison_journal_v2 j
 where j.key=p_key and p_key~'^[a-z0-9-]{1,100}$'
$$;

create function public.urenavi_comparison_journal_lock_v2(p_token text)
returns boolean language plpgsql set search_path='' as $$
begin
 if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f-]{27,28}$' then return false; end if;
 insert into public.urenavi_comparison_journal_v2(key,value_text)
 values('execution-lock',p_token) on conflict do nothing;
 return found;
end $$;

create function public.urenavi_comparison_journal_unlock_v2(p_token text)
returns boolean language plpgsql set search_path='' as $$
begin
 if p_token is null then return false; end if;
 delete from public.urenavi_comparison_journal_v2
 where key='execution-lock' and value_text=p_token;
 return found;
end $$;

revoke all on function public.urenavi_comparison_journal_create_v2(text,text),
 public.urenavi_comparison_journal_read_v2(text),
 public.urenavi_comparison_journal_lock_v2(text),
 public.urenavi_comparison_journal_unlock_v2(text)
 from public,anon,authenticated;
grant execute on function public.urenavi_comparison_journal_create_v2(text,text),
 public.urenavi_comparison_journal_read_v2(text),
 public.urenavi_comparison_journal_lock_v2(text),
 public.urenavi_comparison_journal_unlock_v2(text)
 to service_role;
