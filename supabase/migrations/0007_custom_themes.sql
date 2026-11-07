-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0007 – Custom AI themes (see docs/CUSTOM_THEMES.md)
-- Players describe a vibe; the `generate-theme` Edge Function asks the AI for a
-- ThemeSpec, validates/repairs it and saves it here.
--   • custom_themes      – saved themes. Owner can read, rename, delete. No client inserts.
--   • theme_generations  – one row per generation attempt. Owner can read. No client writes.
--   • get_theme_quota()  – what the app shows ("1 of 2 left, resets 1 Dec").
-- Months are counted in Asia/Kolkata (reset at 00:00 IST on the 1st).
-- Only the Edge Function (service_role) writes, through the service-only functions
-- begin_theme_generation / finish_theme_generation, which hold a per-player lock
-- so parallel requests cannot go over the quota.
--
-- LIMITS: change them in ONE place, public.theme_limit() below, then re-run this file.
-- Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Limits (the one place to change them) ───────────────────────────────────
create or replace function public.theme_limit(p_key text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_key
    when 'monthly'        then 2   -- successful generations per player per IST month
    when 'saved'          then 6   -- saved custom themes per player
    when 'failed_per_day' then 10  -- failed/rejected attempts per rolling 24 h (cost guard)
  end;
$$;

-- ── custom_themes ───────────────────────────────────────────────────────────
create table if not exists public.custom_themes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 2 and 24 and char_length(name) <= 24),
  prompt      text not null check (char_length(btrim(prompt)) between 3 and 300 and char_length(prompt) <= 300),
  spec        jsonb not null check (jsonb_typeof(spec) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists custom_themes_owner_created_idx on public.custom_themes (owner_id, created_at desc);

-- ── theme_generations ───────────────────────────────────────────────────────
create table if not exists public.theme_generations (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null check (status in ('succeeded','failed','rejected')),
  error       text check (error is null or char_length(error) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists theme_generations_profile_created_idx
  on public.theme_generations (profile_id, created_at desc);

-- ── In-flight lock (service only; one generation at a time per player) ─────
create table if not exists public.theme_generation_inflight (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  locked_until  timestamptz not null
);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.handle_custom_theme_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists custom_themes_before_update on public.custom_themes;
create trigger custom_themes_before_update
  before update on public.custom_themes
  for each row execute function public.handle_custom_theme_updated();

revoke all on function public.handle_custom_theme_updated() from public, anon, authenticated;

-- ── RLS + privileges ────────────────────────────────────────────────────────
alter table public.custom_themes             enable row level security;
alter table public.theme_generations         enable row level security;
alter table public.theme_generation_inflight enable row level security;

revoke all on table
  public.custom_themes, public.theme_generations, public.theme_generation_inflight
from anon, authenticated;

grant select, delete   on public.custom_themes     to authenticated;
grant update (name)    on public.custom_themes     to authenticated;
grant select           on public.theme_generations to authenticated;
-- theme_generation_inflight: no client access at all.

grant all on table
  public.custom_themes, public.theme_generations, public.theme_generation_inflight
to service_role;

drop policy if exists custom_themes_select_own on public.custom_themes;
create policy custom_themes_select_own on public.custom_themes
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists custom_themes_update_own on public.custom_themes;
create policy custom_themes_update_own on public.custom_themes
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists custom_themes_delete_own on public.custom_themes;
create policy custom_themes_delete_own on public.custom_themes
  for delete to authenticated using (owner_id = auth.uid());
-- No insert policy: only the Edge Function (service_role, bypasses RLS) inserts.

drop policy if exists theme_generations_select_own on public.theme_generations;
create policy theme_generations_select_own on public.theme_generations
  for select to authenticated using (profile_id = auth.uid());

-- ── Quota ───────────────────────────────────────────────────────────────────

-- Internal: quota for any player. Only callable by service_role and by the
-- SECURITY DEFINER wrappers below.
-- → { used, limit, remaining, resets_at, saved, saved_limit }
create or replace function public.theme_quota_for(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_next_month  timestamptz := (date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month')
                               at time zone 'Asia/Kolkata';
  v_limit       integer := public.theme_limit('monthly');
  v_saved_limit integer := public.theme_limit('saved');
  v_used        integer;
  v_saved       integer;
begin
  select count(*) into v_used
  from public.theme_generations g
  where g.profile_id = p_profile_id
    and g.status = 'succeeded'
    and g.created_at >= v_month_start
    and g.created_at <  v_next_month;

  select count(*) into v_saved
  from public.custom_themes t
  where t.owner_id = p_profile_id;

  return jsonb_build_object(
    'used',        v_used,
    'limit',       v_limit,
    'remaining',   greatest(v_limit - v_used, 0),
    'resets_at',   to_char(v_next_month at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'saved',       v_saved,
    'saved_limit', v_saved_limit
  );
end;
$$;

-- get_theme_quota() → the caller's quota (same jsonb as above).
create or replace function public.get_theme_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public.theme_quota_for(auth.uid());
end;
$$;

-- ── Service-only: start / finish a generation ───────────────────────────────

-- begin_theme_generation(p_profile_id) → jsonb
--   { ok: true, quota }                       – go ahead (lock taken for 90 s)
--   { ok: false, error: 'no_profile' }
--   { ok: false, error: 'quota', quota }
--   { ok: false, error: 'storage_full', quota }
--   { ok: false, error: 'too_many_attempts', quota }
--   { ok: false, error: 'busy' }              – another generation is running
create or replace function public.begin_theme_generation(p_profile_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quota  jsonb;
  v_failed integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('theme_gen:' || p_profile_id::text, 0));

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  v_quota := public.theme_quota_for(p_profile_id);
  if (v_quota->>'remaining')::int <= 0 then
    return jsonb_build_object('ok', false, 'error', 'quota', 'quota', v_quota);
  end if;
  if (v_quota->>'saved')::int >= (v_quota->>'saved_limit')::int then
    return jsonb_build_object('ok', false, 'error', 'storage_full', 'quota', v_quota);
  end if;

  select count(*) into v_failed
  from public.theme_generations g
  where g.profile_id = p_profile_id
    and g.status <> 'succeeded'
    and g.created_at > now() - interval '24 hours';
  if v_failed >= public.theme_limit('failed_per_day') then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts', 'quota', v_quota);
  end if;

  if exists (select 1 from public.theme_generation_inflight
             where profile_id = p_profile_id and locked_until > now()) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into public.theme_generation_inflight (profile_id, locked_until)
  values (p_profile_id, now() + interval '90 seconds')
  on conflict (profile_id) do update set locked_until = excluded.locked_until;

  return jsonb_build_object('ok', true, 'quota', v_quota);
end;
$$;

-- finish_theme_generation(...) → jsonb. Always releases the lock.
--   status 'failed' | 'rejected' → logs the attempt, returns { ok: true }
--   status 'succeeded'           → re-checks limits, inserts the theme + log row, returns
--                                  { ok: true, theme: { id, name, spec, created_at }, quota }
--                                  or { ok: false, error: 'quota' | 'storage_full', quota }
create or replace function public.finish_theme_generation(
  p_profile_id uuid,
  p_status     text,
  p_error      text  default null,
  p_name       text  default null,
  p_prompt     text  default null,
  p_spec       jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quota jsonb;
  v_theme public.custom_themes;
begin
  perform pg_advisory_xact_lock(hashtextextended('theme_gen:' || p_profile_id::text, 0));
  delete from public.theme_generation_inflight where profile_id = p_profile_id;

  if p_status not in ('succeeded','failed','rejected') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;

  if p_status <> 'succeeded' then
    insert into public.theme_generations (profile_id, status, error)
    values (p_profile_id, p_status, left(p_error, 200));
    return jsonb_build_object('ok', true);
  end if;

  v_quota := public.theme_quota_for(p_profile_id);
  if (v_quota->>'remaining')::int <= 0 then
    return jsonb_build_object('ok', false, 'error', 'quota', 'quota', v_quota);
  end if;
  if (v_quota->>'saved')::int >= (v_quota->>'saved_limit')::int then
    return jsonb_build_object('ok', false, 'error', 'storage_full', 'quota', v_quota);
  end if;

  insert into public.custom_themes (owner_id, name, prompt, spec)
  values (p_profile_id, btrim(p_name), btrim(p_prompt), p_spec)
  returning * into v_theme;

  insert into public.theme_generations (profile_id, status)
  values (p_profile_id, 'succeeded');

  return jsonb_build_object(
    'ok', true,
    'theme', jsonb_build_object(
      'id', v_theme.id, 'name', v_theme.name, 'spec', v_theme.spec, 'created_at', v_theme.created_at),
    'quota', public.theme_quota_for(p_profile_id)
  );
end;
$$;

revoke all on function public.theme_limit(text)                                           from public, anon, authenticated;
revoke all on function public.theme_quota_for(uuid)                                       from public, anon, authenticated;
revoke all on function public.get_theme_quota()                                           from public, anon;
revoke all on function public.begin_theme_generation(uuid)                                from public, anon, authenticated;
revoke all on function public.finish_theme_generation(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.get_theme_quota()                                           to authenticated;
grant execute on function public.theme_limit(text)                                           to service_role;
grant execute on function public.theme_quota_for(uuid)                                       to service_role;
grant execute on function public.begin_theme_generation(uuid)                                to service_role;
grant execute on function public.finish_theme_generation(uuid, text, text, text, text, jsonb) to service_role;
