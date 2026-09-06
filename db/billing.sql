-- Additive: legacy production entitlements remain intact; TEST and LIVE have separate rows.
create table if not exists public.urenavi_entitlements_v2 (
  email text not null check (email = lower(email)),
  livemode boolean not null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null,
  active boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null,
  primary key (livemode, stripe_subscription_id)
);
create index if not exists urenavi_entitlements_v2_email on public.urenavi_entitlements_v2 (email,livemode);
alter table public.urenavi_entitlements_v2 enable row level security;
revoke all on public.urenavi_entitlements_v2 from anon, authenticated;
grant select,insert,update on public.urenavi_entitlements_v2 to service_role;
create or replace function public.urenavi_sync_entitlement(p_row jsonb) returns void
language sql security invoker set search_path = '' as $$
  insert into public.urenavi_entitlements_v2
  select x.* from jsonb_populate_record(null::public.urenavi_entitlements_v2,p_row) x
  on conflict (livemode,stripe_subscription_id) do update set
    status=excluded.status, active=excluded.active,
    current_period_end=excluded.current_period_end, updated_at=excluded.updated_at
  where public.urenavi_entitlements_v2.updated_at <= excluded.updated_at;
$$;
revoke all on function public.urenavi_sync_entitlement(jsonb) from public,anon,authenticated;
grant execute on function public.urenavi_sync_entitlement(jsonb) to service_role;
-- Auth schema is private. Expose only a boolean to the service role, never session data.
create or replace function public.urenavi_session_valid(p_session_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id
    and created_at > now()-interval '30 days' and created_at <= now()
    and (not_after is null or not_after > now()));
$$;
revoke all on function public.urenavi_session_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.urenavi_session_valid(uuid,uuid) to service_role;
