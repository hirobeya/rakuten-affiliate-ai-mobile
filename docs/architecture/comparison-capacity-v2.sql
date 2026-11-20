-- Install only with the isolated v2 capacity ledger. No Production migration.
create table public.urenavi_capacity_comparison_evidence_v2 (
 evidence_hash text primary key check(evidence_hash ~ '^[a-f0-9]{64}$'),
 attempt_id uuid not null unique references public.urenavi_capacity_attempt_v2(id),
 verified_at timestamptz not null
);
alter table public.urenavi_capacity_comparison_evidence_v2 enable row level security;
revoke all on public.urenavi_capacity_comparison_evidence_v2 from public,anon,authenticated;
grant select,insert on public.urenavi_capacity_comparison_evidence_v2 to service_role;

create function public.urenavi_capacity_comparison_intent_v2(
 p_id uuid,p_tenant uuid,p_verified_at timestamptz,p_minute_end timestamptz,p_day_end timestamptz,p_evidence_hash text)
returns boolean language plpgsql set search_path='' as $$
declare a public.urenavi_capacity_attempt_v2%rowtype;
 t timestamptz;
begin
 perform 1 from public.urenavi_capacity_provider_v2 where provider='groq' for update;
 if not found then return false; end if;
 t:=clock_timestamp();
 if p_evidence_hash is null or p_evidence_hash !~ '^[a-f0-9]{64}$'
   or p_verified_at is null or p_verified_at not between t-interval '60 seconds' and t
   or p_minute_end is null or p_day_end is null
   or least(p_minute_end,p_day_end)<=t+interval '10 seconds' then return false; end if;
 select * into a from public.urenavi_capacity_attempt_v2 where id=p_id and tenant=p_tenant and provider='groq';
 if not found then return false; end if;
 if (select count(*) from public.urenavi_capacity_window_v2
   where id=any(a.windows) and tenant is null and verified_at=p_verified_at
     and ends_at=(case period when 'minute' then p_minute_end else p_day_end end))<>2 then return false; end if;
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
create function public.urenavi_capacity_comparison_resume_v2(p_evidence_hash text,p_verified_at timestamptz)
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
 if (select count(distinct period) from public.urenavi_capacity_window_v2 where provider='groq'
   and tenant is null and starts_at<=t and ends_at>t and verified_at=p_verified_at
   and external_requests+requests+reserved_requests<request_limit
   and external_tokens+tokens+reserved_tokens<token_limit)<>2 then return false; end if;
 insert into public.urenavi_capacity_resume_audit_v2(evidence_hash,verified_at)
 values(p_evidence_hash,p_verified_at) on conflict(evidence_hash) do nothing;
 if not found then return false; end if;
 update public.urenavi_capacity_provider_v2 set halted=false where provider='groq';
 return true;
end $$;
revoke all on function public.urenavi_capacity_comparison_intent_v2(uuid,uuid,timestamptz,timestamptz,timestamptz,text),
 public.urenavi_capacity_comparison_resume_v2(text,timestamptz) from public,anon,authenticated;
grant execute on function public.urenavi_capacity_comparison_intent_v2(uuid,uuid,timestamptz,timestamptz,timestamptz,text),
 public.urenavi_capacity_comparison_resume_v2(text,timestamptz) to service_role;
