-- Apply only to the existing isolated Preview Supabase project.
create table public.urenavi_mode_a_preview_attempts (
  slot integer primary key check (slot between 1 and 4),
  created_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending','ready','shortfall'))
);
alter table public.urenavi_mode_a_preview_attempts enable row level security;
revoke all on public.urenavi_mode_a_preview_attempts from public, anon, authenticated;

create function public.urenavi_claim_mode_a_preview(p_slot integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(261122, 4);
  if p_slot is null or p_slot not between 1 and 4
    or exists(select 1 from public.urenavi_mode_a_preview_attempts where state='pending')
    or exists(select 1 from public.urenavi_mode_a_preview_attempts where slot=p_slot)
    or (p_slot>2 and not exists(
      select 1 from public.urenavi_mode_a_preview_attempts
      where slot=p_slot-2 and state='shortfall'
    )) then return false;
  end if;
  insert into public.urenavi_mode_a_preview_attempts(slot) values (p_slot);
  return true;
end;
$$;

create function public.urenavi_finish_mode_a_preview(p_slot integer,p_has_three boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(261122, 4);
  if p_has_three is null then return false; end if;
  update public.urenavi_mode_a_preview_attempts
    set state=case when p_has_three then 'ready' else 'shortfall' end
    where slot=p_slot and state='pending';
  return found;
end;
$$;

revoke all on function public.urenavi_claim_mode_a_preview(integer) from public, anon, authenticated;
revoke all on function public.urenavi_finish_mode_a_preview(integer,boolean) from public, anon, authenticated;
grant execute on function public.urenavi_claim_mode_a_preview(integer) to service_role;
grant execute on function public.urenavi_finish_mode_a_preview(integer,boolean) to service_role;
