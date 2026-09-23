-- Preview AI gate cache schema proposal. Do not apply to production without explicit approval.
create table if not exists public.urenavi_ai_room_cache (
  input_hash text primary key,
  item_code text not null default '',
  item_name text not null,
  image_url text not null default '',
  model text not null,
  prompt_version text not null,
  validation_rule_version text not null,
  raw_ai_json jsonb not null,
  image_available boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists urenavi_ai_room_cache_created_at_idx
  on public.urenavi_ai_room_cache (created_at);

alter table public.urenavi_ai_room_cache enable row level security;
revoke all on public.urenavi_ai_room_cache from anon, authenticated;

comment on table public.urenavi_ai_room_cache is
  'Server-side Groq fact-extraction cache. Application only reuses rows newer than 90 days.';
