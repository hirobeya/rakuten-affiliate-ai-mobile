-- Additive only. Apply separately to the authorized database after review.
-- Daily ceilings are in tokens at the most expensive configured tariff.
create or replace function public.urenavi_capacity_reserve_paid_v2(
 p_id uuid,p_tenant uuid,p_provider text,p_estimate bigint,
 p_org_token_ceiling bigint,p_tenant_token_ceiling bigint
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
 t timestamptz;
 org_windows bigint;
 tenant_windows bigint;
 org_limit bigint;
 tenant_limit bigint;
begin
 if p_provider is distinct from 'groq' or p_id is null or p_tenant is null
  or p_estimate is null or p_estimate < 1
  or p_org_token_ceiling is null or p_tenant_token_ceiling is null
  or p_tenant_token_ceiling < p_estimate or p_org_token_ceiling < p_tenant_token_ceiling
  or p_org_token_ceiling > 1000000000 then return false; end if;
 perform 1 from public.urenavi_capacity_provider_v2 where provider=p_provider for update;
 if not found then return false; end if;
 t:=clock_timestamp();
 select count(*) filter(where tenant is null), count(*) filter(where tenant=p_tenant),
  max(token_limit) filter(where tenant is null),max(token_limit) filter(where tenant=p_tenant)
 into org_windows,tenant_windows,org_limit,tenant_limit
 from public.urenavi_capacity_window_v2
 where provider=p_provider and period='day' and dimension in ('tokens','both')
  and (tenant is null or tenant=p_tenant) and starts_at<=t and ends_at>t;
 if org_windows<>1 or tenant_windows<>1 or org_limit>p_org_token_ceiling
  or tenant_limit>p_tenant_token_ceiling then return false; end if;
 -- Existing v2 routine holds the same provider lock, checks official
 -- windows and balances, and persists a single atomic reservation.
 return public.urenavi_capacity_reserve_v2(p_id,p_provider,p_tenant,p_estimate);
end;
$$;
revoke all on function public.urenavi_capacity_reserve_paid_v2(uuid,uuid,text,bigint,bigint,bigint)
 from public,anon,authenticated;
grant execute on function public.urenavi_capacity_reserve_paid_v2(uuid,uuid,text,bigint,bigint,bigint)
 to service_role;
