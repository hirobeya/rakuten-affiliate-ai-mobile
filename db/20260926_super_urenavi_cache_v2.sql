-- Super Urenavi cache v2
-- Splits reusable knowledge into product-understanding, image-understanding,
-- and product-type knowledge caches. Raw AI output is stored; validation is
-- intentionally rerun by application code with the latest validation rules.

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

create index if not exists urenavi_product_understanding_cache_item_code_idx
  on public.urenavi_product_understanding_cache (item_code);
create index if not exists urenavi_product_understanding_cache_expires_at_idx
  on public.urenavi_product_understanding_cache (expires_at);

create table if not exists public.urenavi_image_understanding_cache (
  image_key text primary key,
  normalized_image_url text not null,
  model text not null,
  prompt_version text not null default '',
  schema_version text not null default 'room_product_image_v1',
  raw_ai_json jsonb,
  result_status text not null default 'ok' check (result_status in ('ok','unknown')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists urenavi_image_understanding_cache_url_idx
  on public.urenavi_image_understanding_cache (normalized_image_url);
create index if not exists urenavi_image_understanding_cache_expires_at_idx
  on public.urenavi_image_understanding_cache (expires_at);

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

create index if not exists urenavi_product_type_knowledge_cache_expires_at_idx
  on public.urenavi_product_type_knowledge_cache (expires_at);

alter table public.urenavi_product_understanding_cache enable row level security;
alter table public.urenavi_image_understanding_cache enable row level security;
alter table public.urenavi_product_type_knowledge_cache enable row level security;

revoke all on public.urenavi_product_understanding_cache from anon, authenticated;
revoke all on public.urenavi_image_understanding_cache from anon, authenticated;
revoke all on public.urenavi_product_type_knowledge_cache from anon, authenticated;

comment on table public.urenavi_product_understanding_cache is
  'Raw product-understanding results keyed by itemCode + normalized title/caption hash. Prompt/validation versions are metadata, not key material.';
comment on table public.urenavi_image_understanding_cache is
  'Raw image-understanding results keyed by normalized image URL with Rakuten size parameters removed.';
comment on table public.urenavi_product_type_knowledge_cache is
  'Reusable product-type reader-situation knowledge. Generation is implemented separately; only validated type knowledge may be consumed.';
