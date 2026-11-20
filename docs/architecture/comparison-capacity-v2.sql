-- Install only with the isolated v2 capacity ledger. No Production migration.
create table public.urenavi_capacity_comparison_evidence_v2 (
 evidence_hash text primary key check(evidence_hash ~ '^[a-f0-9]{64}$'),
 attempt_id uuid not null unique references public.urenavi_capacity_attempt_v2(id),
 verified_at timestamptz not null
);
alter table public.urenavi_capacity_comparison_evidence_v2 enable row level security;
revoke all on public.urenavi_capacity_comparison_evidence_v2 from public,anon,authenticated;
grant select,insert on public.urenavi_capacity_comparison_evidence_v2 to service_role;

-- Match each signed limit, remaining count and reset to the exact DB row.
-- The DB may be stricter, but it cannot admit more work than the evidence.
create function public.urenavi_capacity_comparison_windows_match_v2(
 p_counters jsonb,p_verified_at timestamptz,p_now timestamptz,p_windows bigint[],p_estimate bigint)
returns boolean language sql set search_path='' as $$
 select count(*)=4 and count(distinct (w.period,w.dimension))=4
 from public.urenavi_capacity_window_v2 w
 join (values ('minute','requests','rpm'),('day','requests','rpd'),
              ('minute','tokens','tpm'),('day','tokens','tpd')) d(period,dimension,axis)
  on w.period=d.period and w.dimension=d.dimension
 cross join lateral (select p_counters->d.axis as c) signed
 cross join lateral (
  select case w.dimension when 'requests' then w.request_limit else w.token_limit end as configured,
   case w.dimension
    when 'requests' then w.request_limit-w.external_requests-w.requests-w.reserved_requests
    else w.token_limit-w.external_tokens-w.tokens-w.reserved_tokens
   end as available,
   case w.dimension when 'requests' then 1 else p_estimate end as needed
 ) ledger
 where w.provider='groq' and w.tenant is null and (p_windows is null or w.id=any(p_windows))
  and w.verified_at=p_verified_at and w.starts_at<=p_now and w.ends_at>p_now+interval '10 seconds'
  and w.ends_at=(signed.c->>'resetAt')::timestamptz
  and ledger.configured<=(signed.c->>'limit')::bigint
  and (signed.c->>'remaining')::bigint between greatest(ledger.needed,1) and (signed.c->>'limit')::bigint
  and ledger.available>=case when p_windows is null then 1 else 0 end
  and ledger.available+case when p_windows is null then 0 else ledger.needed end<=(signed.c->>'remaining')::bigint
$$;
revoke all on function public.urenavi_capacity_comparison_windows_match_v2(jsonb,timestamptz,timestamptz,bigint[],bigint) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_comparison_windows_match_v2(jsonb,timestamptz,timestamptz,bigint[],bigint) to service_role;

create function public.urenavi_capacity_comparison_intent_v2(
 p_id uuid,p_tenant uuid,p_verified_at timestamptz,p_counters jsonb,p_evidence_hash text)
returns boolean language plpgsql set search_path='' as $$
declare a public.urenavi_capacity_attempt_v2%rowtype;
 t timestamptz;
begin
 perform 1 from public.urenavi_capacity_provider_v2 where provider='groq' for update;
 if not found then return false; end if;
 t:=clock_timestamp();
 if p_evidence_hash is null or p_evidence_hash !~ '^[a-f0-9]{64}$'
   or p_verified_at is null or p_verified_at not between t-interval '60 seconds' and t
   or p_counters is null then return false; end if;
 select * into a from public.urenavi_capacity_attempt_v2 where id=p_id and tenant=p_tenant and provider='groq';
 if not found then return false; end if;
 if cardinality(a.windows)<>6 or not public.urenavi_capacity_comparison_windows_match_v2(
    p_counters,p_verified_at,t,a.windows,a.estimate)
   or exists(select 1 from public.urenavi_capacity_window_v2 where id=any(a.windows) and ends_at<=t+interval '10 seconds')
   then return false; end if;
 if exists(select 1 from public.urenavi_capacity_comparison_evidence_v2 where evidence_hash=p_evidence_hash)
    or not public.urenavi_capacity_intent_v2(p_id,p_tenant) then return false; end if;
 insert into public.urenavi_capacity_comparison_evidence_v2(evidence_hash,attempt_id,verified_at)
 values(p_evidence_hash,p_id,p_verified_at);
 return true;
end $$;

create table public.urenavi_capacity_resume_audit_v2 (
 evidence_hash text primary key check(evidence_hash ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null,
 resumed_at timestamptz not null default clock_timestamp()
);
alter table public.urenavi_capacity_resume_audit_v2 enable row level security;
revoke all on public.urenavi_capacity_resume_audit_v2 from public,anon,authenticated;
grant select,insert on public.urenavi_capacity_resume_audit_v2 to service_role;

-- Reconcile any still-sent attempt first. Unknown charges keep their
-- original holds; restore admission only after those windows have expired
-- and the operator has independently confirmed the new provider counters.
create function public.urenavi_capacity_comparison_resume_v2(p_evidence_hash text,p_verified_at timestamptz,p_counters jsonb)
returns boolean language plpgsql set search_path='' as $$
declare t timestamptz;
begin
 perform 1 from public.urenavi_capacity_provider_v2 where provider='groq' and halted for update;
 if not found then return false; end if;
 t:=clock_timestamp();
 if p_evidence_hash is null or p_evidence_hash !~ '^[a-f0-9]{64}$'
  or p_verified_at is null or p_verified_at not between t-interval '60 seconds' and t then return false; end if;
 if exists(select 1 from public.urenavi_capacity_attempt_v2
   where provider='groq' and outcome='sent') then return false; end if;
 if exists(select 1 from public.urenavi_capacity_attempt_v2 a
  join public.urenavi_capacity_window_v2 w on w.id=any(a.windows)
  where a.provider='groq' and w.ends_at>t and
   (a.outcome in ('unknown','rate_limited') or (a.outcome='spent' and a.actual_tokens>a.estimate))) then return false; end if;
 if not public.urenavi_capacity_comparison_windows_match_v2(p_counters,p_verified_at,t,null,1)
   then return false; end if;
 insert into public.urenavi_capacity_resume_audit_v2(evidence_hash,verified_at)
 values(p_evidence_hash,p_verified_at) on conflict(evidence_hash) do nothing;
 if not found then return false; end if;
 update public.urenavi_capacity_provider_v2 set halted=false where provider='groq';
 return true;
end $$;
revoke all on function public.urenavi_capacity_comparison_intent_v2(uuid,uuid,timestamptz,jsonb,text),
 public.urenavi_capacity_comparison_resume_v2(text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_comparison_intent_v2(uuid,uuid,timestamptz,jsonb,text),
 public.urenavi_capacity_comparison_resume_v2(text,timestamptz,jsonb) to service_role;
