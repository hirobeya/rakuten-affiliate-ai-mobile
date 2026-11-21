-- Only for the isolated comparison project vyzpklomggsazwigxkfh.
-- Never execute on the production Supabase project.
begin;
create table if not exists public.urenavi_product_understanding_cache (
 cache_key text primary key,
 item_code text not null default '',
 source_hash text not null,
 item_name text not null,
 item_caption_normalized text not null default '',
 model text not null,
 prompt_version text not null default '',
 schema_version text not null default 'room_product_facts_v1',
 raw_ai_json jsonb,
 result_status text not null default 'ok' check (result_status in ('ok','unknown')),
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.urenavi_product_type_knowledge_cache (
 product_type_key text primary key,
 product_type text not null,
 model text not null,
 prompt_version text not null default '',
 schema_version text not null default 'product_type_knowledge_v1',
 raw_ai_json jsonb,
 validation_status text not null default 'pending' check (validation_status in ('pending','valid','invalid')),
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.urenavi_product_understanding_cache enable row level security;
alter table public.urenavi_product_type_knowledge_cache enable row level security;
revoke all on public.urenavi_product_understanding_cache from public, anon, authenticated;
revoke all on public.urenavi_product_type_knowledge_cache from public, anon, authenticated;
grant select,insert,update,delete on public.urenavi_product_understanding_cache to service_role;
grant select,insert,update,delete on public.urenavi_product_type_knowledge_cache to service_role;
create index if not exists urenavi_product_cache_expiry_idx
 on public.urenavi_product_understanding_cache (expires_at);
create index if not exists urenavi_type_cache_expiry_idx
 on public.urenavi_product_type_knowledge_cache (expires_at);
commit;
