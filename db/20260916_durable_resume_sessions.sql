create table if not exists public.urenavi_search_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed')),
  search_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(search_fields) = 'object'),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  item_statuses jsonb not null default '{}'::jsonb check (jsonb_typeof(item_statuses) = 'object'),
  platforms jsonb not null default '[]'::jsonb check (jsonb_typeof(platforms) = 'array'),
  current_index integer not null default 0 check (current_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists urenavi_one_active_search_per_user
  on public.urenavi_search_sessions(user_id)
  where status = 'active';

create index if not exists urenavi_search_sessions_user_updated_idx
  on public.urenavi_search_sessions(user_id, updated_at desc);

alter table public.urenavi_search_sessions enable row level security;

drop policy if exists "users_can_select_own_urenavi_search_sessions" on public.urenavi_search_sessions;
create policy "users_can_select_own_urenavi_search_sessions"
  on public.urenavi_search_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_urenavi_search_sessions" on public.urenavi_search_sessions;
create policy "users_can_insert_own_urenavi_search_sessions"
  on public.urenavi_search_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_urenavi_search_sessions" on public.urenavi_search_sessions;
create policy "users_can_update_own_urenavi_search_sessions"
  on public.urenavi_search_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_can_delete_own_urenavi_search_sessions" on public.urenavi_search_sessions;
create policy "users_can_delete_own_urenavi_search_sessions"
  on public.urenavi_search_sessions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.urenavi_search_sessions to authenticated;
