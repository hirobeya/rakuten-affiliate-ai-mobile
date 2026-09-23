-- Preview AI daily quota. This is not a cache table.
create table if not exists public.urenavi_ai_daily_usage (
  usage_day date primary key,
  call_count integer not null default 0 check (call_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.urenavi_ai_daily_usage enable row level security;

create or replace function public.urenavi_consume_ai_daily_limit(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if p_limit is null or p_limit < 1 then
    return false;
  end if;

  insert into public.urenavi_ai_daily_usage(usage_day, call_count, updated_at)
  values ((now() at time zone 'Asia/Tokyo')::date, 1, now())
  on conflict (usage_day) do update
    set call_count = public.urenavi_ai_daily_usage.call_count + 1,
        updated_at = now()
    where public.urenavi_ai_daily_usage.call_count < p_limit
  returning call_count into new_count;

  return new_count is not null and new_count <= p_limit;
end;
$$;

revoke all on function public.urenavi_consume_ai_daily_limit(integer) from public, anon, authenticated;
grant execute on function public.urenavi_consume_ai_daily_limit(integer) to service_role;
