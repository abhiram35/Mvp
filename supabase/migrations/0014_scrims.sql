-- ─────────────────────────────────────────────────────────────────────────────
-- 0014 – Scrims (Phase 1: free scrims). Contract: docs/SCRIMS.md.
--
--   • games.scrims_enabled          – which games support scrims (valorant, cs2)
--   • teams / team_members / team_invites
--   • scrims / scrim_requests / scrim_lobby / scrim_reports
--   • notifications: new types team_invite, scrim_request, scrim_update
--
-- Every table is readable per the rules in docs/SCRIMS.md; ALL writes go through the
-- SECURITY DEFINER RPCs at the bottom of this file (clients have no insert/update/delete).
-- Error messages raised here are shown to players as-is.
--
-- Requires 0001–0013. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.games add column if not exists scrims_enabled boolean not null default false;
-- Only on the first run (create_team doesn't exist yet), so a re-run never undoes your own
-- changes to the game list.
do $$
begin
  if to_regprocedure('public.create_team(text, text, text, text)') is null then
    update public.games set scrims_enabled = true where id in ('valorant', 'cs2');
  end if;
end;
$$;

-- ── teams ───────────────────────────────────────────────────────────────────
-- captain_id is nullable only so that deleting the captain's account never fails;
-- the team_members trigger below immediately hands captaincy to the next member.
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  game_id     text not null references public.games (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 3 and 32 and char_length(name) <= 32),
  tag         text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  region      text not null check (region in (
                'india_north','india_south','india_east','india_west','south_asia',
                'middle_east','southeast_asia','europe','north_america','other')),
  captain_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists teams_game_name_key on public.teams (game_id, lower(name));
create unique index if not exists teams_game_tag_key  on public.teams (game_id, upper(tag));
create index if not exists teams_captain_id_idx on public.teams (captain_id);

-- ── team_members ────────────────────────────────────────────────────────────
create table if not exists public.team_members (
  team_id     uuid not null references public.teams (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (id) on delete cascade,
  role        text not null default 'player' check (role in ('captain','player','sub')),
  joined_at   timestamptz not null default now(),
  primary key (team_id, profile_id),
  constraint team_members_profile_game_key unique (profile_id, game_id)  -- one team per game
);
-- (profile_id, game_id) unique index above also serves "members by profile".

-- ── team_invites ────────────────────────────────────────────────────────────
create table if not exists public.team_invites (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  invited_by  uuid references public.profiles (id) on delete set null,
  status      text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at  timestamptz not null default now()
);
create unique index if not exists team_invites_one_pending_key
  on public.team_invites (team_id, profile_id) where status = 'pending';
create index if not exists team_invites_profile_status_idx on public.team_invites (profile_id, status);
create index if not exists team_invites_team_status_idx    on public.team_invites (team_id, status);

-- ── scrims ──────────────────────────────────────────────────────────────────
-- Team FKs are declared inline so their names are the defaults the app embeds with:
-- scrims_host_team_id_fkey, scrims_opponent_team_id_fkey. They are "on delete set null"
-- so a disbanded team's past scrims (and the other team's stats) survive.
create table if not exists public.scrims (
  id                    uuid primary key default gen_random_uuid(),
  game_id               text not null references public.games (id) on delete cascade,
  host_team_id          uuid references public.teams (id) on delete set null,
  opponent_team_id      uuid references public.teams (id) on delete set null,
  region                text not null check (region in (
                          'india_north','india_south','india_east','india_west','south_asia',
                          'middle_east','southeast_asia','europe','north_america','other')),
  scheduled_at          timestamptz not null,
  format                text not null default 'bo1' check (format in ('bo1','bo3','bo5')),
  rank_min              text check (rank_min is null or char_length(rank_min) <= 40),
  rank_max              text check (rank_max is null or char_length(rank_max) <= 40),
  notes                 text check (notes is null or char_length(notes) <= 200),
  status                text not null default 'open'
                          check (status in ('open','booked','completed','disputed','cancelled','no_show')),
  host_checked_in_at    timestamptz,
  opp_checked_in_at     timestamptz,
  host_score            integer check (host_score is null or host_score between 0 and 3),
  opp_score             integer check (opp_score is null or opp_score between 0 and 3),
  no_show_team_id       uuid references public.teams (id) on delete set null,
  cancelled_by_team_id  uuid references public.teams (id) on delete set null,
  late_cancel           boolean not null default false,
  conversation_id       uuid references public.conversations (id) on delete set null,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint scrims_distinct_teams check (host_team_id is distinct from opponent_team_id or host_team_id is null)
);
create index if not exists scrims_game_status_scheduled_idx on public.scrims (game_id, status, scheduled_at);
create index if not exists scrims_host_team_idx     on public.scrims (host_team_id, scheduled_at desc);
create index if not exists scrims_opponent_team_idx on public.scrims (opponent_team_id, scheduled_at desc)
  where opponent_team_id is not null;

-- ── scrim_requests ──────────────────────────────────────────────────────────
create table if not exists public.scrim_requests (
  id          uuid primary key default gen_random_uuid(),
  scrim_id    uuid not null references public.scrims (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade,
  message     text check (message is null or char_length(message) <= 140),
  status      text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint scrim_requests_scrim_team_key unique (scrim_id, team_id)
);
create index if not exists scrim_requests_scrim_status_idx on public.scrim_requests (scrim_id, status);
create index if not exists scrim_requests_team_idx         on public.scrim_requests (team_id, status);

-- ── scrim_lobby (party code / server details) ───────────────────────────────
create table if not exists public.scrim_lobby (
  scrim_id    uuid primary key references public.scrims (id) on delete cascade,
  info        text check (info is null or char_length(info) <= 300),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ── scrim_reports ───────────────────────────────────────────────────────────
create table if not exists public.scrim_reports (
  scrim_id        uuid not null references public.scrims (id) on delete cascade,
  team_id         uuid not null references public.teams (id) on delete cascade,
  host_score      integer not null check (host_score between 0 and 3),
  opp_score       integer not null check (opp_score between 0 and 3),
  screenshot_url  text check (screenshot_url is null
                              or (screenshot_url ~ '^https://' and char_length(screenshot_url) <= 1000)),
  reported_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (scrim_id, team_id)
);
create index if not exists scrim_reports_team_idx on public.scrim_reports (team_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Notifications: new types
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  c record;
begin
  -- Drop whatever CHECK constraint(s) currently restrict notifications.type …
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.notifications'::regclass
      and con.contype = 'c'
      and a.attname = 'type'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
  -- … and add the full list back under the standard name.
  alter table public.notifications add constraint notifications_type_check check (type in (
    'lfg_request','lfg_accepted','message','friend_request','friend_accepted',
    'community_reply','community_solution','rating_received','moderation',
    'team_invite','scrim_request','scrim_update'));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Helpers (internal unless granted below)
-- ═════════════════════════════════════════════════════════════════════════════

-- Is the caller on this team? (used by RLS)
create or replace function public.gg_is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.profile_id = auth.uid());
$$;

-- Is the caller on the host or the opponent team of this scrim? (used by RLS)
create or replace function public.gg_is_scrim_member(p_scrim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.scrims s
    join public.team_members tm
      on tm.team_id in (s.host_team_id, s.opponent_team_id) and tm.profile_id = auth.uid()
    where s.id = p_scrim_id);
$$;

revoke all on function public.gg_is_team_member(uuid)  from public, anon;
revoke all on function public.gg_is_scrim_member(uuid) from public, anon;
grant execute on function public.gg_is_team_member(uuid)  to authenticated;
grant execute on function public.gg_is_scrim_member(uuid) to authenticated;

-- Signed in, has a profile, and (unless p_allow_banned) not paused. Returns auth.uid().
create or replace function public.gg_scrim_actor(p_allow_banned boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_until timestamptz;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select p.banned_until into v_until from public.profiles p where p.id = me;
  if not found then
    raise exception 'Finish setting up your profile first' using errcode = '42501';
  end if;
  if not p_allow_banned and v_until > now() then
    raise exception 'Your account is paused, so you can''t do this right now' using errcode = '42501';
  end if;
  return me;
end;
$$;

-- Valid final score for a format: winner reaches the target, loser is below it.
create or replace function public.gg_scrim_score_ok(p_format text, p_host integer, p_opp integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_host is not null and p_opp is not null and p_host >= 0 and p_opp >= 0
     and (case p_format when 'bo1' then 1 when 'bo3' then 2 when 'bo5' then 3 end) is not null
     and greatest(p_host, p_opp) = (case p_format when 'bo1' then 1 when 'bo3' then 2 when 'bo5' then 3 end)
     and least(p_host, p_opp)    < (case p_format when 'bo1' then 1 when 'bo3' then 2 when 'bo5' then 3 end);
$$;

create or replace function public.gg_scrim_score_hint(p_format text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_format
           when 'bo1' then 'That score isn''t possible in a BO1 (use 1–0)'
           when 'bo3' then 'That score isn''t possible in a BO3 (use 2–0 or 2–1)'
           else 'That score isn''t possible in a BO5 (use 3–0, 3–1 or 3–2)' end;
$$;

-- "Sat 14 Nov, 21:30 IST" in the scrim region's main time zone; UTC where a region spans
-- many zones (Europe, North America, other). The app always shows the player's local time.
drop function if exists public.gg_scrim_when(timestamptz);
create or replace function public.gg_scrim_when(p_at timestamptz, p_region text)
returns text
language sql
stable
set search_path = public
as $$
  select to_char(p_at at time zone z.tz, 'Dy DD Mon, HH24:MI') || ' ' || z.label
  from (select case
                 when p_region in ('india_north','india_south','india_east','india_west','south_asia') then 'Asia/Kolkata'
                 when p_region = 'middle_east'    then 'Asia/Dubai'
                 when p_region = 'southeast_asia' then 'Asia/Singapore'
                 else 'UTC' end as tz,
               case
                 when p_region in ('india_north','india_south','india_east','india_west','south_asia') then 'IST'
                 when p_region = 'middle_east'    then 'GST'
                 when p_region = 'southeast_asia' then 'SGT'
                 else 'UTC' end as label) z;
$$;

create or replace function public.gg_team_label(p_team_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select t.tag from public.teams t where t.id = p_team_id), 'A team');
$$;

-- Notify every member of a team (optionally only the captain), except p_actor.
create or replace function public.gg_notify_team(
  p_team_id       uuid,
  p_type          text,
  p_title         text,
  p_body          text,
  p_route         jsonb,
  p_actor         uuid,
  p_extra         jsonb   default '{}'::jsonb,
  p_captain_only  boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_team_id is null then
    return;
  end if;
  for r in
    select tm.profile_id from public.team_members tm
    where tm.team_id = p_team_id
      and (not p_captain_only or tm.role = 'captain')
  loop
    perform public.gg_notify(r.profile_id, p_type, p_title, p_body, p_route, p_actor, p_extra);
  end loop;
end;
$$;

revoke all on function public.gg_scrim_actor(boolean)                   from public, anon, authenticated;
revoke all on function public.gg_scrim_score_ok(text, integer, integer) from public, anon, authenticated;
revoke all on function public.gg_scrim_score_hint(text)                 from public, anon, authenticated;
revoke all on function public.gg_scrim_when(timestamptz, text)          from public, anon, authenticated;
revoke all on function public.gg_team_label(uuid)                       from public, anon, authenticated;
revoke all on function public.gg_notify_team(uuid, text, text, text, jsonb, uuid, jsonb, boolean)
  from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Triggers
-- ═════════════════════════════════════════════════════════════════════════════

-- scrims.updated_at
create or replace function public.handle_scrims_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.handle_scrims_touch() from public, anon, authenticated;

drop trigger if exists scrims_before_update_touch on public.scrims;
create trigger scrims_before_update_touch
  before update on public.scrims
  for each row execute function public.handle_scrims_touch();

-- A member left / was removed / deleted their account:
--   last member gone → delete the team; captain gone → longest-serving member becomes captain.
-- Skipped when the team row itself is being deleted (cascade).
create or replace function public.handle_team_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_next uuid;
begin
  select * into v_team from public.teams where id = old.team_id for update;
  if not found then
    return null;
  end if;

  if not exists (select 1 from public.team_members where team_id = old.team_id) then
    delete from public.teams where id = old.team_id;
    return null;
  end if;

  if v_team.captain_id is null or v_team.captain_id = old.profile_id
     or not exists (select 1 from public.team_members
                    where team_id = old.team_id and profile_id = v_team.captain_id) then
    select tm.profile_id into v_next
    from public.team_members tm
    where tm.team_id = old.team_id
    order by tm.joined_at, tm.profile_id
    limit 1;
    update public.team_members set role = 'captain'
     where team_id = old.team_id and profile_id = v_next;
    update public.teams set captain_id = v_next where id = old.team_id;
    perform public.gg_notify(
      v_next, 'team_invite', 'You''re now captain of ' || v_team.name,
      'The previous captain left the team.',
      public.gg_route('/teams/[id]', old.team_id), null,
      jsonb_build_object('team_id', old.team_id));
  end if;
  return null;
end;
$$;
revoke all on function public.handle_team_member_removed() from public, anon, authenticated;

drop trigger if exists team_members_after_delete on public.team_members;
create trigger team_members_after_delete
  after delete on public.team_members
  for each row execute function public.handle_team_member_removed();

-- A team is being deleted (last member left): cancel its upcoming open / booked scrims and
-- tell the other team. Pending requests and invites go with the team (cascade).
create or replace function public.handle_team_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_other uuid;
begin
  for s in
    select * from public.scrims
    where status in ('open','booked')
      and (host_team_id = old.id or opponent_team_id = old.id)
    for update
  loop
    v_other := case when s.host_team_id = old.id then s.opponent_team_id else s.host_team_id end;
    update public.scrims
       set status = 'cancelled',
           cancelled_by_team_id = old.id,
           late_cancel = (s.status = 'booked' and s.scheduled_at > now()
                          and s.scheduled_at < now() + interval '2 hours')
     where id = s.id;
    update public.scrim_requests set status = 'declined'
     where scrim_id = s.id and status = 'pending';
    if s.status = 'booked' and v_other is not null then
      perform public.gg_notify_team(
        v_other, 'scrim_update', 'Scrim cancelled: ' || old.tag || ' disbanded',
        public.gg_scrim_when(s.scheduled_at, s.region),
        public.gg_route('/scrims/[id]', s.id), null,
        jsonb_build_object('scrim_id', s.id), true);
    end if;
  end loop;
  return old;
end;
$$;
revoke all on function public.handle_team_deleted() from public, anon, authenticated;

drop trigger if exists teams_before_delete on public.teams;
create trigger teams_before_delete
  before delete on public.teams
  for each row execute function public.handle_team_deleted();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Row level security & privileges
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.teams          enable row level security;
alter table public.team_members   enable row level security;
alter table public.team_invites   enable row level security;
alter table public.scrims         enable row level security;
alter table public.scrim_requests enable row level security;
alter table public.scrim_lobby    enable row level security;
alter table public.scrim_reports  enable row level security;

revoke all on table
  public.teams, public.team_members, public.team_invites, public.scrims,
  public.scrim_requests, public.scrim_lobby, public.scrim_reports
from anon, authenticated;
grant select on table
  public.teams, public.team_members, public.team_invites, public.scrims,
  public.scrim_requests, public.scrim_lobby, public.scrim_reports
to authenticated;
grant all on table
  public.teams, public.team_members, public.team_invites, public.scrims,
  public.scrim_requests, public.scrim_lobby, public.scrim_reports
to service_role;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (true);

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (true);

drop policy if exists scrims_select on public.scrims;
create policy scrims_select on public.scrims
  for select to authenticated using (true);

drop policy if exists team_invites_select on public.team_invites;
create policy team_invites_select on public.team_invites
  for select to authenticated
  using (profile_id = auth.uid() or public.gg_is_team_member(team_id));

drop policy if exists scrim_requests_select on public.scrim_requests;
create policy scrim_requests_select on public.scrim_requests
  for select to authenticated
  using (
    public.gg_is_team_member(team_id)
    or exists (select 1 from public.scrims s
               where s.id = scrim_requests.scrim_id and public.gg_is_team_member(s.host_team_id))
  );

drop policy if exists scrim_lobby_select on public.scrim_lobby;
create policy scrim_lobby_select on public.scrim_lobby
  for select to authenticated using (public.gg_is_scrim_member(scrim_id));

drop policy if exists scrim_reports_select on public.scrim_reports;
create policy scrim_reports_select on public.scrim_reports
  for select to authenticated
  using (public.gg_is_scrim_member(scrim_id) or public.is_moderator(auth.uid()));

-- Realtime (RLS still applies): scrim boards, requests and invites update live.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['scrims', 'scrim_requests', 'team_invites'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. RPCs – teams
-- ═════════════════════════════════════════════════════════════════════════════

-- ── create_team(p_game_id, p_name, p_tag, p_region) → uuid ──────────────────
create or replace function public.create_team(p_game_id text, p_name text, p_tag text, p_region text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor();
  v_game  public.games%rowtype;
  v_name  text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag   text := upper(btrim(coalesce(p_tag, '')));
  v_id    uuid;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  if not v_game.scrims_enabled then
    raise exception 'Scrims aren''t available for % yet', v_game.name using errcode = '22023';
  end if;
  if char_length(v_name) not between 3 and 32 then
    raise exception 'Team name must be 3–32 characters' using errcode = '22023';
  end if;
  if v_tag !~ '^[A-Z0-9]{2,5}$' then
    raise exception 'Tag must be 2–5 letters or numbers' using errcode = '22023';
  end if;
  if p_region is null or p_region not in ('india_north','india_south','india_east','india_west','south_asia',
                                          'middle_east','southeast_asia','europe','north_america','other') then
    raise exception 'Choose a region' using errcode = '22023';
  end if;
  if public.gg_clean_text(v_name) is distinct from v_name then
    raise exception 'Pick a different team name' using errcode = '22023';
  end if;
  if public.gg_clean_text(lower(v_tag)) is distinct from lower(v_tag) then
    raise exception 'Pick a different tag' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_members where profile_id = me and game_id = p_game_id) then
    raise exception 'You''re already on a team for %', v_game.name using errcode = '22023';
  end if;
  if exists (select 1 from public.teams where game_id = p_game_id and lower(name) = lower(v_name)) then
    raise exception 'That team name is taken' using errcode = '22023';
  end if;
  if exists (select 1 from public.teams where game_id = p_game_id and upper(tag) = v_tag) then
    raise exception 'That tag is taken' using errcode = '22023';
  end if;

  begin
    insert into public.teams (game_id, name, tag, region, captain_id)
    values (p_game_id, v_name, v_tag, p_region, me)
    returning id into v_id;
    insert into public.team_members (team_id, profile_id, game_id, role)
    values (v_id, me, p_game_id, 'captain');
  exception when unique_violation then
    -- Lost a race with another create_team call.
    if exists (select 1 from public.team_members where profile_id = me and game_id = p_game_id) then
      raise exception 'You''re already on a team for %', v_game.name using errcode = '22023';
    end if;
    raise exception 'That team name or tag is taken' using errcode = '22023';
  end;

  -- Any invites I had for this game are moot now.
  update public.team_invites i set status = 'cancelled'
   where i.profile_id = me and i.status = 'pending'
     and exists (select 1 from public.teams t where t.id = i.team_id and t.game_id = p_game_id);
  return v_id;
end;
$$;

-- ── invite_to_team(p_team_id, p_profile_id) → uuid ──────────────────────────
create or replace function public.invite_to_team(p_team_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor();
  v_team  public.teams%rowtype;
  v_game  text;
  v_me    text;
  v_id    uuid;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_team.captain_id is distinct from me then
    raise exception 'Only the team captain can invite players' using errcode = '42501';
  end if;
  if p_profile_id is null or p_profile_id = me then
    raise exception 'You can''t invite yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.blocks
             where (blocker_id = me and blocked_id = p_profile_id)
                or (blocker_id = p_profile_id and blocked_id = me)) then
    raise exception 'You can''t invite this player' using errcode = '42501';
  end if;
  select name into v_game from public.games where id = v_team.game_id;
  if exists (select 1 from public.team_members where profile_id = p_profile_id and game_id = v_team.game_id) then
    raise exception 'This player is already on a team for %', v_game using errcode = '22023';
  end if;
  if (select count(*) from public.team_members where team_id = p_team_id) >= 7 then
    raise exception 'Your team is full (7 players max)' using errcode = '22023';
  end if;

  select id into v_id from public.team_invites
   where team_id = p_team_id and profile_id = p_profile_id and status = 'pending';
  if v_id is not null then
    return v_id; -- already invited
  end if;

  insert into public.team_invites (team_id, profile_id, invited_by)
  values (p_team_id, p_profile_id, me)
  returning id into v_id;

  select display_name into v_me from public.profiles where id = me;
  perform public.gg_notify(
    p_profile_id, 'team_invite',
    coalesce(v_me, 'A captain') || ' invited you to ' || v_team.name,
    '[' || v_team.tag || '] · ' || coalesce(v_game, 'Scrims') || ' team',
    public.gg_route('/teams/[id]', p_team_id), me,
    jsonb_build_object('team_id', p_team_id, 'invite_id', v_id));
  return v_id;
end;
$$;

-- ── respond_team_invite(p_invite_id, p_accept) → void ───────────────────────
create or replace function public.respond_team_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor(not coalesce(p_accept, false));
  v_inv   public.team_invites%rowtype;
  v_team  public.teams%rowtype;
  v_game  text;
  v_me    text;
begin
  select * into v_inv from public.team_invites where id = p_invite_id for update;
  if not found or v_inv.profile_id <> me then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    if v_inv.status = 'accepted' and coalesce(p_accept, false) then
      return; -- idempotent
    end if;
    raise exception 'This invite is no longer active' using errcode = '22023';
  end if;

  if not coalesce(p_accept, false) then
    update public.team_invites set status = 'declined' where id = v_inv.id;
    return;
  end if;

  select * into v_team from public.teams where id = v_inv.team_id for update;
  if not found then
    raise exception 'This team no longer exists' using errcode = 'P0002';
  end if;
  select name into v_game from public.games where id = v_team.game_id;
  if exists (select 1 from public.team_members where profile_id = me and game_id = v_team.game_id) then
    raise exception 'You''re already on a team for %. Leave it first.', v_game using errcode = '22023';
  end if;
  if (select count(*) from public.team_members where team_id = v_team.id) >= 7 then
    raise exception 'This team is full (7 players max)' using errcode = '22023';
  end if;
  if v_team.captain_id is not null and exists (
       select 1 from public.blocks
       where (blocker_id = me and blocked_id = v_team.captain_id)
          or (blocker_id = v_team.captain_id and blocked_id = me)) then
    raise exception 'You can''t join this team' using errcode = '42501';
  end if;

  begin
    insert into public.team_members (team_id, profile_id, game_id, role)
    values (v_team.id, me, v_team.game_id, 'player');
  exception when unique_violation then
    raise exception 'You''re already on a team for %. Leave it first.', v_game using errcode = '22023';
  end;
  update public.team_invites set status = 'accepted' where id = v_inv.id;
  -- Other pending invites for the same game are moot now.
  update public.team_invites i set status = 'cancelled'
   where i.profile_id = me and i.status = 'pending' and i.id <> v_inv.id
     and exists (select 1 from public.teams t where t.id = i.team_id and t.game_id = v_team.game_id);

  select display_name into v_me from public.profiles where id = me;
  perform public.gg_notify(
    v_team.captain_id, 'team_invite',
    coalesce(v_me, 'A player') || ' joined ' || v_team.name, null,
    public.gg_route('/teams/[id]', v_team.id), me,
    jsonb_build_object('team_id', v_team.id));
end;
$$;

-- ── remove_team_member(p_team_id, p_profile_id) → void ──────────────────────
create or replace function public.remove_team_member(p_team_id uuid, p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor(true);
  v_team  public.teams%rowtype;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_team.captain_id is distinct from me then
    raise exception 'Only the team captain can remove players' using errcode = '42501';
  end if;
  if p_profile_id = me then
    raise exception 'You can''t remove yourself. Use Leave team instead.' using errcode = '22023';
  end if;
  delete from public.team_members where team_id = p_team_id and profile_id = p_profile_id;
  if not found then
    raise exception 'That player isn''t on this team' using errcode = 'P0002';
  end if;
  perform public.gg_notify(
    p_profile_id, 'team_invite', 'You were removed from ' || v_team.name, null,
    public.gg_route('/teams/[id]', p_team_id), me,
    jsonb_build_object('team_id', p_team_id), false);
end;
$$;

-- ── leave_team(p_team_id) → void ────────────────────────────────────────────
-- Captaincy hand-over and deleting an empty team happen in the team_members trigger.
create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.gg_scrim_actor(true);
begin
  perform 1 from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  delete from public.team_members where team_id = p_team_id and profile_id = me;
  if not found then
    raise exception 'You''re not on this team' using errcode = '22023';
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. RPCs – scrims
-- ═════════════════════════════════════════════════════════════════════════════

-- ── post_scrim(...) → uuid ──────────────────────────────────────────────────
create or replace function public.post_scrim(
  p_team_id       uuid,
  p_scheduled_at  timestamptz,
  p_format        text,
  p_rank_min      text,
  p_rank_max      text,
  p_notes         text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_team   public.teams%rowtype;
  v_game   public.games%rowtype;
  v_min    text := nullif(btrim(coalesce(p_rank_min, '')), '');
  v_max    text := nullif(btrim(coalesce(p_rank_max, '')), '');
  v_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
  v_imin   integer;
  v_imax   integer;
  v_id     uuid;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_team.captain_id is distinct from me then
    raise exception 'Only the team captain can post scrims' using errcode = '42501';
  end if;
  select * into v_game from public.games where id = v_team.game_id;
  if not v_game.scrims_enabled then
    raise exception 'Scrims aren''t available for % yet', v_game.name using errcode = '22023';
  end if;
  if (select count(*) from public.team_members where team_id = p_team_id) < 5 then
    raise exception 'Your team needs at least 5 players to post a scrim' using errcode = '22023';
  end if;
  if p_format is null or p_format not in ('bo1','bo3','bo5') then
    raise exception 'Choose a format (BO1, BO3 or BO5)' using errcode = '22023';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() + interval '15 minutes' then
    raise exception 'Pick a time at least 15 minutes from now' using errcode = '22023';
  end if;
  if p_scheduled_at > now() + interval '14 days' then
    raise exception 'Scrims can be posted at most 14 days ahead' using errcode = '22023';
  end if;
  if char_length(v_min) > 40 or char_length(v_max) > 40 then
    raise exception 'Pick a rank from the list' using errcode = '22023';
  end if;
  if cardinality(v_game.ranks) > 0 then
    v_imin := array_position(v_game.ranks, v_min);
    v_imax := array_position(v_game.ranks, v_max);
    if (v_min is not null and v_imin is null) or (v_max is not null and v_imax is null) then
      raise exception 'Pick a rank from the list' using errcode = '22023';
    end if;
    if v_imin is not null and v_imax is not null and v_imin > v_imax then
      raise exception 'The minimum rank must be below the maximum rank' using errcode = '22023';
    end if;
  end if;
  if char_length(v_notes) > 200 then
    raise exception 'Notes can be at most 200 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.scrims s
      where (s.host_team_id = p_team_id or s.opponent_team_id = p_team_id)
        and s.status in ('open','booked') and s.scheduled_at > now()) >= 5 then
    raise exception 'Your team already has 5 upcoming scrims. Cancel one first.' using errcode = '22023';
  end if;

  insert into public.scrims (game_id, host_team_id, region, scheduled_at, format,
                             rank_min, rank_max, notes, created_by)
  values (v_team.game_id, p_team_id, v_team.region, p_scheduled_at, p_format,
          v_min, v_max, public.gg_clean_text(v_notes), me)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── request_scrim(p_scrim_id, p_team_id, p_message) → uuid ──────────────────
create or replace function public.request_scrim(p_scrim_id uuid, p_team_id uuid, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_scrim  public.scrims%rowtype;
  v_team   public.teams%rowtype;
  v_host   public.teams%rowtype;
  v_msg    text := nullif(btrim(coalesce(p_message, '')), '');
  v_req    public.scrim_requests%rowtype;
  v_id     uuid;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_team.captain_id is distinct from me then
    raise exception 'Only your team captain can request scrims' using errcode = '42501';
  end if;
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if v_scrim.game_id <> v_team.game_id then
    raise exception 'Your team plays a different game' using errcode = '22023';
  end if;
  if v_scrim.host_team_id = p_team_id then
    raise exception 'You can''t request your own scrim' using errcode = '22023';
  end if;
  if v_scrim.status <> 'open' or v_scrim.scheduled_at <= now() then
    raise exception 'This scrim is no longer open' using errcode = '22023';
  end if;
  if (select count(*) from public.team_members where team_id = p_team_id) < 5 then
    raise exception 'Your team needs at least 5 players to request a scrim' using errcode = '22023';
  end if;
  select * into v_host from public.teams where id = v_scrim.host_team_id;
  if v_host.captain_id is not null and exists (
       select 1 from public.blocks
       where (blocker_id = me and blocked_id = v_host.captain_id)
          or (blocker_id = v_host.captain_id and blocked_id = me)) then
    raise exception 'You can''t request a scrim from this team' using errcode = '42501';
  end if;
  if char_length(v_msg) > 140 then
    raise exception 'Message can be at most 140 characters' using errcode = '22023';
  end if;
  v_msg := public.gg_clean_text(v_msg);

  select * into v_req from public.scrim_requests
   where scrim_id = p_scrim_id and team_id = p_team_id for update;
  if found then
    if v_req.status = 'pending' then
      return v_req.id; -- already requested
    elsif v_req.status = 'declined' then
      raise exception 'The host already declined your request for this scrim' using errcode = '22023';
    elsif v_req.status = 'accepted' then
      return v_req.id;
    end if;
    -- withdrawn → request again
    update public.scrim_requests
       set status = 'pending', message = v_msg, created_by = me, created_at = now()
     where id = v_req.id;
    v_id := v_req.id;
  else
    insert into public.scrim_requests (scrim_id, team_id, message, created_by)
    values (p_scrim_id, p_team_id, v_msg, me)
    returning id into v_id;
  end if;

  perform public.gg_notify(
    v_host.captain_id, 'scrim_request',
    v_team.name || ' [' || v_team.tag || '] wants your scrim',
    coalesce(public.gg_preview(v_msg, 158), public.gg_scrim_when(v_scrim.scheduled_at, v_scrim.region)),
    public.gg_route('/scrims/[id]', p_scrim_id), me,
    jsonb_build_object('scrim_id', p_scrim_id, 'request_id', v_id, 'team_id', p_team_id));
  return v_id;
end;
$$;

-- ── withdraw_scrim_request(p_request_id) → void ─────────────────────────────
create or replace function public.withdraw_scrim_request(p_request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := public.gg_scrim_actor(true);
  v_req  public.scrim_requests%rowtype;
begin
  select * into v_req from public.scrim_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  -- Same lock order as respond_scrim_request (scrim, then request).
  perform 1 from public.scrims where id = v_req.scrim_id for update;
  select * into v_req from public.scrim_requests where id = p_request_id for update;
  if not exists (select 1 from public.teams where id = v_req.team_id and captain_id = me) then
    raise exception 'Only your team captain can withdraw this request' using errcode = '42501';
  end if;
  if v_req.status = 'withdrawn' then
    return;
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request has already been answered' using errcode = '22023';
  end if;
  update public.scrim_requests set status = 'withdrawn' where id = p_request_id;
end;
$$;

-- ── respond_scrim_request(p_request_id, p_accept) → uuid (conversation id on accept) ─
create or replace function public.respond_scrim_request(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(not coalesce(p_accept, false));
  v_req    public.scrim_requests%rowtype;
  v_scrim  public.scrims%rowtype;
  v_host   public.teams%rowtype;
  v_opp    public.teams%rowtype;
  v_cid    uuid;
  v_when   text;
  r        record;
begin
  select * into v_req from public.scrim_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  -- Lock the scrim first: two accepts on the same scrim are serialised here.
  select * into v_scrim from public.scrims where id = v_req.scrim_id for update;
  select * into v_req from public.scrim_requests where id = p_request_id for update;
  select * into v_host from public.teams where id = v_scrim.host_team_id;
  if v_host.id is null or v_host.captain_id is distinct from me then
    raise exception 'Only the host captain can answer requests' using errcode = '42501';
  end if;

  if v_req.status = 'accepted' and coalesce(p_accept, false) then
    return v_scrim.conversation_id; -- idempotent
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request is no longer pending' using errcode = '22023';
  end if;

  select * into v_opp from public.teams where id = v_req.team_id;
  v_when := public.gg_scrim_when(v_scrim.scheduled_at, v_scrim.region);

  if not coalesce(p_accept, false) then
    update public.scrim_requests set status = 'declined' where id = v_req.id;
    perform public.gg_notify_team(
      v_opp.id, 'scrim_update', v_host.tag || ' declined your scrim request', v_when,
      public.gg_route('/scrims/[id]', v_scrim.id), me,
      jsonb_build_object('scrim_id', v_scrim.id), true);
    return null;
  end if;

  if v_scrim.status <> 'open' then
    raise exception 'This scrim is already booked or closed' using errcode = '22023';
  end if;
  if v_scrim.scheduled_at <= now() then
    raise exception 'This scrim''s start time has passed' using errcode = '22023';
  end if;
  if (select count(*) from public.team_members where team_id = v_opp.id) < 5 then
    raise exception '% no longer has 5 players', v_opp.name using errcode = '22023';
  end if;
  if v_opp.captain_id is not null and exists (
       select 1 from public.blocks
       where (blocker_id = me and blocked_id = v_opp.captain_id)
          or (blocker_id = v_opp.captain_id and blocked_id = me)) then
    raise exception 'You can''t accept this team' using errcode = '42501';
  end if;

  -- Group chat with both rosters (members who join later aren't added).
  insert into public.conversations (is_group, title)
  values (true, left(v_host.tag || ' vs ' || v_opp.tag || ' · Scrim', 120))
  returning id into v_cid;
  insert into public.conversation_members (conversation_id, profile_id)
  select v_cid, tm.profile_id from public.team_members tm
  where tm.team_id in (v_host.id, v_opp.id)
  on conflict (conversation_id, profile_id) do nothing;

  update public.scrims
     set status = 'booked', opponent_team_id = v_opp.id, conversation_id = v_cid
   where id = v_scrim.id;
  update public.scrim_requests set status = 'accepted' where id = v_req.id;
  insert into public.scrim_lobby (scrim_id, updated_by) values (v_scrim.id, me)
  on conflict (scrim_id) do nothing;

  -- Everyone else who asked gets a "slot taken".
  for r in
    select sr.id, sr.team_id from public.scrim_requests sr
    where sr.scrim_id = v_scrim.id and sr.status = 'pending' and sr.id <> v_req.id
    for update
  loop
    update public.scrim_requests set status = 'declined' where id = r.id;
    perform public.gg_notify_team(
      r.team_id, 'scrim_update', v_host.tag || '''s scrim was booked by another team', v_when,
      public.gg_route('/scrims/[id]', v_scrim.id), me,
      jsonb_build_object('scrim_id', v_scrim.id), true);
  end loop;

  -- Both rosters: "Scrim booked".
  perform public.gg_notify_team(
    v_opp.id, 'scrim_update', 'Scrim booked: ' || v_host.tag || ' vs ' || v_opp.tag, v_when,
    public.gg_route('/scrims/[id]', v_scrim.id), me,
    jsonb_build_object('scrim_id', v_scrim.id, 'conversation_id', v_cid));
  perform public.gg_notify_team(
    v_host.id, 'scrim_update', 'Scrim booked: ' || v_host.tag || ' vs ' || v_opp.tag, v_when,
    public.gg_route('/scrims/[id]', v_scrim.id), me,
    jsonb_build_object('scrim_id', v_scrim.id, 'conversation_id', v_cid));
  return v_cid;
end;
$$;

-- ── cancel_scrim(p_scrim_id) → void ─────────────────────────────────────────
create or replace function public.cancel_scrim(p_scrim_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_scrim  public.scrims%rowtype;
  v_mine   uuid;
  v_other  uuid;
  v_late   boolean;
  r        record;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    v_mine := v_scrim.host_team_id;  v_other := v_scrim.opponent_team_id;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.teams where id = v_scrim.opponent_team_id and captain_id = me) then
    v_mine := v_scrim.opponent_team_id;  v_other := v_scrim.host_team_id;
  else
    raise exception 'Only a team captain can cancel this scrim' using errcode = '42501';
  end if;

  if v_scrim.status = 'cancelled' then
    return;
  end if;
  if v_scrim.status = 'open' and v_mine <> v_scrim.host_team_id then
    raise exception 'Only the host captain can cancel this scrim' using errcode = '42501';
  end if;
  if v_scrim.status not in ('open','booked') then
    raise exception 'This scrim can''t be cancelled any more' using errcode = '22023';
  end if;
  if v_scrim.status = 'booked' and v_scrim.scheduled_at <= now() then
    raise exception 'This scrim has already started. Report the result or claim a no-show instead.'
      using errcode = '22023';
  end if;

  v_late := v_scrim.status = 'booked' and v_scrim.scheduled_at < now() + interval '2 hours';
  update public.scrims
     set status = 'cancelled', cancelled_by_team_id = v_mine, late_cancel = v_late
   where id = p_scrim_id;

  for r in
    select sr.id, sr.team_id from public.scrim_requests sr
    where sr.scrim_id = p_scrim_id and sr.status = 'pending'
    for update
  loop
    update public.scrim_requests set status = 'declined' where id = r.id;
    perform public.gg_notify_team(
      r.team_id, 'scrim_update', public.gg_team_label(v_mine) || ' cancelled their scrim',
      public.gg_scrim_when(v_scrim.scheduled_at, v_scrim.region),
      public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id), true);
  end loop;

  if v_scrim.status = 'booked' then
    perform public.gg_notify_team(
      v_other, 'scrim_update',
      public.gg_team_label(v_mine) || ' cancelled the scrim' || case when v_late then ' (late)' else '' end,
      public.gg_scrim_when(v_scrim.scheduled_at, v_scrim.region),
      public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id), true);
  end if;
end;
$$;

-- ── check_in_scrim(p_scrim_id) → void ───────────────────────────────────────
create or replace function public.check_in_scrim(p_scrim_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_scrim  public.scrims%rowtype;
  v_host   boolean;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.team_members where team_id = v_scrim.host_team_id and profile_id = me) then
    v_host := true;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.team_members
                    where team_id = v_scrim.opponent_team_id and profile_id = me) then
    v_host := false;
  else
    raise exception 'Only players on these two teams can check in' using errcode = '42501';
  end if;
  if v_scrim.status <> 'booked' then
    raise exception 'Only booked scrims can be checked in to' using errcode = '22023';
  end if;
  if now() < v_scrim.scheduled_at - interval '30 minutes' then
    raise exception 'Check-in opens 30 minutes before the start' using errcode = '22023';
  end if;
  if now() > v_scrim.scheduled_at + interval '15 minutes' then
    raise exception 'Check-in closed 15 minutes after the start' using errcode = '22023';
  end if;

  if v_host then
    update public.scrims set host_checked_in_at = now()
     where id = p_scrim_id and host_checked_in_at is null;
  else
    update public.scrims set opp_checked_in_at = now()
     where id = p_scrim_id and opp_checked_in_at is null;
  end if;
end;
$$;

-- ── set_scrim_lobby(p_scrim_id, p_info) → void ──────────────────────────────
create or replace function public.set_scrim_lobby(p_scrim_id uuid, p_info text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_scrim  public.scrims%rowtype;
  v_mine   uuid;
  v_other  uuid;
  v_info   text := nullif(btrim(coalesce(p_info, '')), '');
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    v_mine := v_scrim.host_team_id;  v_other := v_scrim.opponent_team_id;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.teams where id = v_scrim.opponent_team_id and captain_id = me) then
    v_mine := v_scrim.opponent_team_id;  v_other := v_scrim.host_team_id;
  else
    raise exception 'Only a team captain can set the lobby details' using errcode = '42501';
  end if;
  if v_scrim.status <> 'booked' then
    raise exception 'Lobby details can only be set for a booked scrim' using errcode = '22023';
  end if;
  if char_length(v_info) > 300 then
    raise exception 'Lobby details can be at most 300 characters' using errcode = '22023';
  end if;
  v_info := public.gg_clean_text(v_info);

  if exists (select 1 from public.scrim_lobby where scrim_id = p_scrim_id and info is not distinct from v_info) then
    return; -- unchanged
  end if;
  insert into public.scrim_lobby (scrim_id, info, updated_by, updated_at)
  values (p_scrim_id, v_info, me, now())
  on conflict (scrim_id) do update
    set info = excluded.info, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  if v_info is not null then
    perform public.gg_notify_team(
      v_other, 'scrim_update', 'Lobby details posted: ' || public.gg_team_label(v_scrim.host_team_id)
        || ' vs ' || public.gg_team_label(v_scrim.opponent_team_id),
      public.gg_scrim_when(v_scrim.scheduled_at, v_scrim.region),
      public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id));
    perform public.gg_notify_team(
      v_mine, 'scrim_update', 'Lobby details posted: ' || public.gg_team_label(v_scrim.host_team_id)
        || ' vs ' || public.gg_team_label(v_scrim.opponent_team_id),
      public.gg_scrim_when(v_scrim.scheduled_at, v_scrim.region),
      public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id));
  end if;
end;
$$;

-- ── report_scrim_result(p_scrim_id, p_host_score, p_opp_score, p_screenshot_url) → text ─
-- Returns the scrim's status afterwards: 'booked' (waiting for the other captain),
-- 'completed' (both agree) or 'disputed'. A captain may correct their report while the
-- scrim is booked or disputed; matching reports complete it.
create or replace function public.report_scrim_result(
  p_scrim_id        uuid,
  p_host_score      integer,
  p_opp_score       integer,
  p_screenshot_url  text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_scrim  public.scrims%rowtype;
  v_mine   uuid;
  v_other  uuid;
  v_url    text := nullif(btrim(coalesce(p_screenshot_url, '')), '');
  v_a      public.scrim_reports%rowtype;
  v_b      public.scrim_reports%rowtype;
  v_status text;
  v_label  text;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    v_mine := v_scrim.host_team_id;  v_other := v_scrim.opponent_team_id;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.teams where id = v_scrim.opponent_team_id and captain_id = me) then
    v_mine := v_scrim.opponent_team_id;  v_other := v_scrim.host_team_id;
  else
    raise exception 'Only a team captain can report the result' using errcode = '42501';
  end if;
  if v_scrim.status = 'completed' then
    raise exception 'The result is already confirmed' using errcode = '22023';
  end if;
  if v_scrim.status not in ('booked','disputed') then
    raise exception 'Only booked scrims can have a result' using errcode = '22023';
  end if;
  if now() < v_scrim.scheduled_at then
    raise exception 'You can report the result once the scrim has started' using errcode = '22023';
  end if;
  if not public.gg_scrim_score_ok(v_scrim.format, p_host_score, p_opp_score) then
    raise exception '%', public.gg_scrim_score_hint(v_scrim.format) using errcode = '22023';
  end if;
  if v_url is not null and (v_url !~ '^https://' or char_length(v_url) > 1000) then
    raise exception 'Screenshot must be an https link' using errcode = '22023';
  end if;

  insert into public.scrim_reports (scrim_id, team_id, host_score, opp_score, screenshot_url, reported_by, created_at)
  values (p_scrim_id, v_mine, p_host_score, p_opp_score, v_url, me, now())
  on conflict (scrim_id, team_id) do update
    set host_score = excluded.host_score, opp_score = excluded.opp_score,
        screenshot_url = excluded.screenshot_url, reported_by = excluded.reported_by,
        created_at = excluded.created_at;

  select * into v_a from public.scrim_reports where scrim_id = p_scrim_id and team_id = v_scrim.host_team_id;
  select * into v_b from public.scrim_reports where scrim_id = p_scrim_id and team_id = v_scrim.opponent_team_id;
  v_label := public.gg_team_label(v_scrim.host_team_id) || ' vs ' || public.gg_team_label(v_scrim.opponent_team_id);

  if v_a.scrim_id is null or v_b.scrim_id is null then
    -- Waiting for the other captain.
    perform public.gg_notify_team(
      v_other, 'scrim_update', public.gg_team_label(v_mine) || ' reported ' || p_host_score || '–' || p_opp_score
        || '. Report your result.', v_label,
      public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id), true);
    return v_scrim.status;
  end if;

  if v_a.host_score = v_b.host_score and v_a.opp_score = v_b.opp_score then
    update public.scrims
       set status = 'completed', host_score = v_a.host_score, opp_score = v_a.opp_score
     where id = p_scrim_id;
    v_status := 'completed';
    perform public.gg_notify_team(
      v_other, 'scrim_update', 'Result confirmed: ' || v_label || ' ' || v_a.host_score || '–' || v_a.opp_score,
      null, public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id), true);
  else
    update public.scrims set status = 'disputed', host_score = null, opp_score = null where id = p_scrim_id;
    v_status := 'disputed';
    if v_scrim.status <> 'disputed' then
      perform public.gg_notify_team(
        v_other, 'scrim_update', 'Result disputed: ' || v_label,
        'The two reported scores don''t match. A moderator will review it.',
        public.gg_route('/scrims/[id]', p_scrim_id), me,
        jsonb_build_object('scrim_id', p_scrim_id), true);
    end if;
  end if;
  return v_status;
end;
$$;

-- ── claim_scrim_no_show(p_scrim_id) → void ──────────────────────────────────
create or replace function public.claim_scrim_no_show(p_scrim_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me        uuid := public.gg_scrim_actor(true);
  v_scrim   public.scrims%rowtype;
  v_mine    uuid;
  v_other   uuid;
  v_my_in   timestamptz;
  v_oth_in  timestamptz;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    v_mine := v_scrim.host_team_id;  v_other := v_scrim.opponent_team_id;
    v_my_in := v_scrim.host_checked_in_at;  v_oth_in := v_scrim.opp_checked_in_at;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.teams where id = v_scrim.opponent_team_id and captain_id = me) then
    v_mine := v_scrim.opponent_team_id;  v_other := v_scrim.host_team_id;
    v_my_in := v_scrim.opp_checked_in_at;  v_oth_in := v_scrim.host_checked_in_at;
  else
    raise exception 'Only a team captain can claim a no-show' using errcode = '42501';
  end if;
  if v_scrim.status <> 'booked' then
    raise exception 'Only booked scrims can have a no-show' using errcode = '22023';
  end if;
  if now() < v_scrim.scheduled_at + interval '15 minutes' then
    raise exception 'You can claim a no-show 15 minutes after the start' using errcode = '22023';
  end if;
  if v_my_in is null then
    raise exception 'Your team didn''t check in, so you can''t claim a no-show' using errcode = '22023';
  end if;
  if v_oth_in is not null then
    raise exception 'The other team checked in' using errcode = '22023';
  end if;

  update public.scrims set status = 'no_show', no_show_team_id = v_other where id = p_scrim_id;
  perform public.gg_notify_team(
    v_other, 'scrim_update', 'No-show recorded: ' || public.gg_team_label(v_scrim.host_team_id)
      || ' vs ' || public.gg_team_label(v_scrim.opponent_team_id),
    'Your team didn''t check in. This affects your reliability.',
    public.gg_route('/scrims/[id]', p_scrim_id), me,
    jsonb_build_object('scrim_id', p_scrim_id), true);
end;
$$;

-- ── escalate_scrim(p_scrim_id) → void ───────────────────────────────────────────
-- Escape hatch for a booked scrim nobody can finish (e.g. a captain never reports):
-- 2 hours after the start either captain can send it to the moderators as disputed.
create or replace function public.escalate_scrim(p_scrim_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_scrim  public.scrims%rowtype;
  v_other  uuid;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    v_other := v_scrim.opponent_team_id;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.teams where id = v_scrim.opponent_team_id and captain_id = me) then
    v_other := v_scrim.host_team_id;
  else
    raise exception 'Only a team captain can ask a moderator' using errcode = '42501';
  end if;
  if v_scrim.status <> 'booked' then
    raise exception 'Only a booked scrim can be sent to a moderator' using errcode = '22023';
  end if;
  if now() < v_scrim.scheduled_at + interval '2 hours' then
    raise exception 'You can ask a moderator 2 hours after the start' using errcode = '22023';
  end if;

  update public.scrims set status = 'disputed' where id = p_scrim_id;
  perform public.gg_notify_team(
    v_other, 'scrim_update', 'Sent to a moderator: ' || public.gg_team_label(v_scrim.host_team_id)
      || ' vs ' || public.gg_team_label(v_scrim.opponent_team_id),
    'The result wasn''t confirmed, so a moderator will set it.',
    public.gg_route('/scrims/[id]', p_scrim_id), me,
    jsonb_build_object('scrim_id', p_scrim_id), true);
end;
$$;

-- ── resolve_scrim_dispute(p_scrim_id, p_host_score, p_opp_score) → void (moderators) ─
create or replace function public.resolve_scrim_dispute(p_scrim_id uuid, p_host_score integer, p_opp_score integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_require_moderator();
  v_scrim  public.scrims%rowtype;
  v_label  text;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if v_scrim.status <> 'disputed' then
    raise exception 'This scrim isn''t disputed' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_members m
             where m.profile_id = me and m.team_id in (v_scrim.host_team_id, v_scrim.opponent_team_id)) then
    raise exception 'Another moderator must resolve a scrim your own team played' using errcode = '42501';
  end if;
  if not public.gg_scrim_score_ok(v_scrim.format, p_host_score, p_opp_score) then
    raise exception '%', public.gg_scrim_score_hint(v_scrim.format) using errcode = '22023';
  end if;

  update public.scrims
     set status = 'completed', host_score = p_host_score, opp_score = p_opp_score
   where id = p_scrim_id;

  v_label := public.gg_team_label(v_scrim.host_team_id) || ' vs ' || public.gg_team_label(v_scrim.opponent_team_id);
  perform public.gg_notify(t.captain_id, 'scrim_update',
                           'Dispute resolved: ' || v_label || ' ' || p_host_score || '–' || p_opp_score,
                           'A moderator confirmed the result.',
                           public.gg_route('/scrims/[id]', p_scrim_id), me,
                           jsonb_build_object('scrim_id', p_scrim_id), false, false)
  from public.teams t
  where t.id in (v_scrim.host_team_id, v_scrim.opponent_team_id);
end;
$$;

-- ── get_team_stats(p_team_id) → jsonb ───────────────────────────────────────
create or replace function public.get_team_stats(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_played  integer;
  v_wins    integer;
  v_noshow  integer;
  v_late    integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  select count(*)::integer,
         count(*) filter (where (s.host_team_id = p_team_id and s.host_score > s.opp_score)
                             or (s.opponent_team_id = p_team_id and s.opp_score > s.host_score))::integer
    into v_played, v_wins
  from public.scrims s
  where s.status = 'completed'
    and (s.host_team_id = p_team_id or s.opponent_team_id = p_team_id);

  select count(*)::integer into v_noshow
  from public.scrims s where s.status = 'no_show' and s.no_show_team_id = p_team_id;

  select count(*)::integer into v_late
  from public.scrims s
  where s.status = 'cancelled' and s.late_cancel and s.cancelled_by_team_id = p_team_id;

  return jsonb_build_object(
    'played', v_played,
    'wins', v_wins,
    'losses', v_played - v_wins,
    'no_shows', v_noshow,
    'late_cancels', v_late,
    'reliability', case when v_played + v_noshow + v_late = 0 then null
                        else round(100.0 * v_played / (v_played + v_noshow + v_late))::integer end);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Function privileges
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_team(text, text, text, text)',
    'public.invite_to_team(uuid, uuid)',
    'public.respond_team_invite(uuid, boolean)',
    'public.remove_team_member(uuid, uuid)',
    'public.leave_team(uuid)',
    'public.post_scrim(uuid, timestamptz, text, text, text, text)',
    'public.request_scrim(uuid, uuid, text)',
    'public.withdraw_scrim_request(uuid)',
    'public.respond_scrim_request(uuid, boolean)',
    'public.cancel_scrim(uuid)',
    'public.check_in_scrim(uuid)',
    'public.set_scrim_lobby(uuid, text)',
    'public.report_scrim_result(uuid, integer, integer, text)',
    'public.claim_scrim_no_show(uuid)',
    'public.escalate_scrim(uuid)',
    'public.resolve_scrim_dispute(uuid, integer, integer)',
    'public.get_team_stats(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
