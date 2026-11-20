-- Disposable PostgreSQL only. Server-confirmed windows and observed provider
-- usage are supplied by service_role. There is no inferred provider reset.
create table public.urenavi_capacity_provider_v2 (
 provider text primary key check (provider in ('groq','gemini')),
 halted boolean not null default false
);
create table public.urenavi_capacity_window_v2 (
 id bigint generated always as identity primary key,
 provider text not null references public.urenavi_capacity_provider_v2,
 tenant uuid,
 period text not null check (period in ('minute','day')),
 dimension text not null default 'both' check (dimension in ('both','requests','tokens')),
 check (dimension='both' or (provider='groq' and tenant is null)),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 verified_at timestamptz not null,
 request_limit bigint not null check (request_limit between 0 and 1000000000),
 token_limit bigint not null check (token_limit between 0 and 1000000000),
 external_requests bigint not null default 0 check (external_requests>=0),
 external_tokens bigint not null default 0 check (external_tokens>=0),
 requests bigint not null default 0 check (requests>=0),
 tokens bigint not null default 0 check (tokens>=0),
 reserved_requests bigint not null default 0 check (reserved_requests>=0),
 reserved_tokens bigint not null default 0 check (reserved_tokens>=0),
 check (ends_at>starts_at),
 unique nulls not distinct (provider,tenant,period,dimension,starts_at)
);
create table public.urenavi_capacity_attempt_v2 (
 id uuid primary key,
 provider text not null references public.urenavi_capacity_provider_v2,
 tenant uuid not null,
 windows bigint[] not null check(cardinality(windows) in (4,6)),
 estimate bigint not null check(estimate between 1 and 1000000000),
 outcome text not null default 'reserved' check(outcome in ('reserved','sent','spent','rate_limited','unknown','expired')),
 actual_tokens bigint
);
alter table public.urenavi_capacity_provider_v2 enable row level security;
alter table public.urenavi_capacity_window_v2 enable row level security;
alter table public.urenavi_capacity_attempt_v2 enable row level security;
revoke all on public.urenavi_capacity_provider_v2,public.urenavi_capacity_window_v2,public.urenavi_capacity_attempt_v2 from public,anon,authenticated;
grant select,insert,update on public.urenavi_capacity_provider_v2,public.urenavi_capacity_window_v2,public.urenavi_capacity_attempt_v2 to service_role;

-- External counters exclude local reservations/settlements. The caller must
-- prove that split; never pass a provider aggregate as an external-only count.
create function public.urenavi_capacity_confirm_window_v2(
 p_provider text,p_tenant uuid,p_period text,p_start timestamptz,p_end timestamptz,p_verified timestamptz,
 p_request_limit bigint,p_token_limit bigint,p_external_requests bigint,p_external_tokens bigint,
 p_dimension text default 'both')
returns boolean language plpgsql set search_path='' as $$
declare t timestamptz;
begin
 perform 1 from public.urenavi_capacity_provider_v2 where provider=p_provider for update;
 if not found then return false; end if;
 t:=clock_timestamp();
 if p_start is null or p_end is null or p_verified is null or p_period is null
    or p_period not in ('minute','day')
    or p_dimension is null or p_dimension not in ('both','requests','tokens')
    or (p_dimension<>'both' and (p_provider<>'groq' or p_tenant is not null))
    or (p_dimension='requests' and (p_token_limit<>0 or p_external_tokens<>0))
    or (p_dimension='tokens' and (p_request_limit<>0 or p_external_requests<>0)) or p_start>t or p_end<=t
    or p_end-p_start>(case when p_period='minute' then interval '1 minute' else interval '1 day' end)
    or p_verified not between t-interval '5 minutes' and t
    or p_request_limit is null or p_token_limit is null or p_external_requests is null or p_external_tokens is null
    or p_request_limit not between 0 and 1000000000 or p_token_limit not between 0 and 1000000000
    or p_external_requests not between 0 and 1000000000 or p_external_tokens not between 0 and 1000000000
    then return false; end if;
 if exists(select 1 from public.urenavi_capacity_window_v2
   where provider=p_provider and tenant is not distinct from p_tenant and period=p_period
    and (dimension=p_dimension or dimension='both' or p_dimension='both')
    and starts_at<p_end and ends_at>p_start
    and (dimension<>p_dimension or starts_at<>p_start or ends_at<>p_end)) then return false; end if;
 insert into public.urenavi_capacity_window_v2(provider,tenant,period,dimension,starts_at,ends_at,verified_at,
   request_limit,token_limit,external_requests,external_tokens)
 values(p_provider,p_tenant,p_period,p_dimension,p_start,p_end,p_verified,p_request_limit,p_token_limit,p_external_requests,p_external_tokens)
 on conflict(provider,tenant,period,dimension,starts_at) do update set
   verified_at=excluded.verified_at,request_limit=excluded.request_limit,token_limit=excluded.token_limit,
   external_requests=excluded.external_requests,external_tokens=excluded.external_tokens
 where urenavi_capacity_window_v2.verified_at<excluded.verified_at
 and urenavi_capacity_window_v2.external_requests<=excluded.external_requests
 and urenavi_capacity_window_v2.external_tokens<=excluded.external_tokens;
 return found;
end $$;

create function public.urenavi_capacity_reserve_v2(p_id uuid,p_provider text,p_tenant uuid,p_estimate bigint)
returns boolean language plpgsql set search_path='' as $$
declare locked public.urenavi_capacity_provider_v2%rowtype;
 active_ids bigint[];
 t timestamptz;
 tenant_count integer;
 combined_count integer;
 split_count integer;
begin
 if p_id is null or p_tenant is null or p_estimate is null or p_estimate not between 1 and 1000000000 then return false; end if;
 select * into locked from public.urenavi_capacity_provider_v2 where provider=p_provider for update;
 if not found or locked.halted then return false; end if;
 t:=clock_timestamp();
 -- A pre-intent reservation cannot have dispatched. On the next admission,
 -- release it from every pinned window once any of those windows has ended.
 -- Sent, unknown and rate-limited holds are never expired here.
 with expired as (
  update public.urenavi_capacity_attempt_v2 a set outcome='expired'
  where a.provider=p_provider and a.outcome='reserved' and exists(
   select 1 from public.urenavi_capacity_window_v2 w where w.id=any(a.windows) and w.ends_at<=t
  ) returning a.windows,a.estimate
 ), holds as (
  select detached.window_id as id, count(*) as unused_requests, sum(estimate) as unused_tokens
  from (select unnest(windows) as window_id, estimate from expired) detached
  group by detached.window_id
 )
 update public.urenavi_capacity_window_v2 w
 set reserved_requests=w.reserved_requests-case when w.dimension<>'tokens' then holds.unused_requests else 0 end,
     reserved_tokens=w.reserved_tokens-case when w.dimension<>'requests' then holds.unused_tokens else 0 end
 from holds where w.id=holds.id;
 select array_agg(id order by id),
  count(distinct period) filter (where tenant is not null and dimension='both'),
  count(distinct period) filter (where tenant is null and dimension='both'),
  count(distinct (period,dimension)) filter (where tenant is null and dimension<>'both')
 into active_ids,tenant_count,combined_count,split_count
 from public.urenavi_capacity_window_v2
 where provider=p_provider and (tenant is null or tenant=p_tenant)
 and starts_at<=t and ends_at>t;
 if tenant_count<>2 or not (
   (combined_count=2 and split_count=0 and cardinality(active_ids)=4)
   or (combined_count=0 and split_count=4 and cardinality(active_ids)=6)
 ) then return false; end if;
 if exists(select 1 from public.urenavi_capacity_window_v2 where id=any(active_ids)
   and (verified_at>t or verified_at<t-interval '5 minutes' or (dimension<>'tokens' and external_requests+requests+reserved_requests>=request_limit)
    or (dimension<>'requests' and external_tokens+tokens+reserved_tokens>token_limit-p_estimate))) then return false; end if;
 insert into public.urenavi_capacity_attempt_v2(id,provider,tenant,windows,estimate)
 values(p_id,p_provider,p_tenant,active_ids,p_estimate) on conflict(id) do nothing;
 if not found then return false; end if;
 update public.urenavi_capacity_window_v2 set reserved_requests=reserved_requests+case when dimension<>'tokens' then 1 else 0 end,
  reserved_tokens=reserved_tokens+case when dimension<>'requests' then p_estimate else 0 end
 where id=any(active_ids);
 return true;
end $$;

create function public.urenavi_capacity_intent_v2(p_id uuid,p_tenant uuid)
returns boolean language plpgsql set search_path='' as $$
declare a public.urenavi_capacity_attempt_v2%rowtype;
 locked public.urenavi_capacity_provider_v2%rowtype;
 t timestamptz;
begin
 select * into a from public.urenavi_capacity_attempt_v2 where id=p_id and tenant=p_tenant;
 if not found then return false; end if;
 select * into locked from public.urenavi_capacity_provider_v2 where provider=a.provider for update;
 if not found then return false; end if;
 select * into a from public.urenavi_capacity_attempt_v2 where id=p_id and tenant=p_tenant for update;
 if not found or a.outcome<>'reserved' then return false; end if;
 t:=clock_timestamp();
 if exists(select 1 from public.urenavi_capacity_window_v2 where id=any(a.windows) and ends_at<=t) then
   update public.urenavi_capacity_window_v2 set reserved_requests=reserved_requests-case when dimension<>'tokens' then 1 else 0 end,
    reserved_tokens=reserved_tokens-case when dimension<>'requests' then a.estimate else 0 end
   where id=any(a.windows);
   update public.urenavi_capacity_attempt_v2 set outcome='expired' where id=p_id;
   return false;
 end if;
 -- Serialize dispatch for this provider across all tenants, even across
 -- rollover. An intent with a lost response keeps the provider closed.
 if locked.halted or exists(select 1 from public.urenavi_capacity_attempt_v2 where provider=a.provider and outcome='sent')
  or (select count(*) from public.urenavi_capacity_window_v2 where id=any(a.windows)
   and starts_at<=t and ends_at>t and verified_at between t-interval '5 minutes' and t
   and (dimension='tokens' or external_requests+requests+reserved_requests<=request_limit)
   and (dimension='requests' or external_tokens+tokens+reserved_tokens<=token_limit))<>cardinality(a.windows) then return false; end if;
 update public.urenavi_capacity_attempt_v2 set outcome='sent' where id=p_id;
 return true;
end $$;

create function public.urenavi_capacity_complete_v2(p_id uuid,p_tenant uuid,p_outcome text,p_actual bigint)
returns boolean language plpgsql set search_path='' as $$
declare a public.urenavi_capacity_attempt_v2%rowtype;
begin
 if p_outcome is null or p_outcome not in ('spent','rate_limited','unknown') then return false; end if;
 if p_outcome='spent' and (p_actual is null or p_actual not between 0 and 1000000000) then return false; end if;
 if p_outcome<>'spent' and p_actual is not null then return false; end if;
 select * into a from public.urenavi_capacity_attempt_v2 where id=p_id and tenant=p_tenant;
 if not found then return false; end if;
 perform 1 from public.urenavi_capacity_provider_v2 where provider=a.provider for update;
 if not found then return false; end if;
 select * into a from public.urenavi_capacity_attempt_v2 where id=p_id and tenant=p_tenant for update;
 if not found or a.outcome<>'sent' then return false; end if;
 if p_outcome='spent' then
   update public.urenavi_capacity_window_v2 set
    reserved_requests=reserved_requests-case when dimension<>'tokens' then 1 else 0 end,
    reserved_tokens=reserved_tokens-case when dimension<>'requests' then a.estimate else 0 end,
    requests=requests+case when dimension<>'tokens' then 1 else 0 end,
    tokens=tokens+case when dimension<>'requests' then p_actual else 0 end
   where id=any(a.windows);
 end if;
 -- The pinned reservation can be reconciled after expiry, but a response
 -- alone cannot prove which provider window was actually charged.
 if p_outcome<>'spent' or p_actual>a.estimate or exists(
   select 1 from public.urenavi_capacity_window_v2 where id=any(a.windows) and ends_at<=clock_timestamp()
 ) then
   update public.urenavi_capacity_provider_v2 set halted=true where provider=a.provider;
 end if;
 update public.urenavi_capacity_attempt_v2 set outcome=p_outcome,actual_tokens=p_actual where id=p_id;
 return true;
end $$;
revoke all on function public.urenavi_capacity_confirm_window_v2(text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,bigint,bigint,bigint,text)
 from public,anon,authenticated;
grant execute on function public.urenavi_capacity_confirm_window_v2(text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,bigint,bigint,bigint,text)
 to service_role;
revoke all on function public.urenavi_capacity_reserve_v2(uuid,text,uuid,bigint),
 public.urenavi_capacity_intent_v2(uuid,uuid),public.urenavi_capacity_complete_v2(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_reserve_v2(uuid,text,uuid,bigint),
 public.urenavi_capacity_intent_v2(uuid,uuid),public.urenavi_capacity_complete_v2(uuid,uuid,text,bigint) to service_role;
