drop policy if exists "users_can_select_own_urenavi_search_sessions" on public.urenavi_search_sessions;
drop policy if exists "users_can_insert_own_urenavi_search_sessions" on public.urenavi_search_sessions;
drop policy if exists "users_can_update_own_urenavi_search_sessions" on public.urenavi_search_sessions;
drop policy if exists "users_can_delete_own_urenavi_search_sessions" on public.urenavi_search_sessions;

drop index if exists public.urenavi_one_active_search_per_user;
drop index if exists public.urenavi_search_sessions_user_updated_idx;

alter table public.urenavi_search_sessions drop column if exists user_id;
alter table public.urenavi_search_sessions add column if not exists email text not null;

create unique index if not exists urenavi_one_active_search_per_email
  on public.urenavi_search_sessions(lower(email))
  where status = 'active';

create index if not exists urenavi_search_sessions_email_updated_idx
  on public.urenavi_search_sessions(lower(email), updated_at desc);

revoke all on public.urenavi_search_sessions from anon, authenticated;
alter table public.urenavi_search_sessions enable row level security;
