-- ─────────────────────────────────────────────────────────────────────────────
-- 0016 – Tournaments (Phase 2: free, streamed, hosted by verified organisers).
-- Contract: docs/TOURNAMENTS.md.
--
--   • organiser_applications / organisers   – verified organiser badge (moderator reviewed)
--   • tournaments / tournament_teams / tournament_rosters
--   • tournament_matches / tournament_match_reports – single-elimination bracket
--   • notifications: new types tournament_update, organiser_application
--
-- Every table is readable per the rules in docs/TOURNAMENTS.md; ALL writes go through the
-- SECURITY DEFINER RPCs below (clients have no insert/update/delete).
-- tournament_matches.lobby_info is NOT selectable by clients (column privileges): select the
-- other columns by name and read the lobby with get_match_lobby(). `select *` on
-- tournament_matches fails with "permission denied".
-- Error messages raised here are shown to players as-is.
--
-- Requires 0001–0015. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═════════════════════════════════════════════════════════════════════════════

-- ── organiser_applications ──────────────────────────────────────────────────
create table if not exists public.organiser_applications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  org_name     text not null check (char_length(btrim(org_name)) between 2 and 60 and char_length(org_name) <= 60),
  discord      text check (discord is null or char_length(discord) <= 60),
  about        text not null check (char_length(btrim(about)) between 10 and 500 and char_length(about) <= 500),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note  text check (review_note is null or char_length(review_note) <= 300),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists organiser_applications_one_pending_key
  on public.organiser_applications (profile_id) where status = 'pending';
create index if not exists organiser_applications_profile_idx
  on public.organiser_applications (profile_id, created_at desc);
create index if not exists organiser_applications_status_idx
  on public.organiser_applications (status, created_at);

-- ── organisers (✓ badge) ────────────────────────────────────────────────────
create table if not exists public.organisers (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  org_name    text not null check (char_length(org_name) between 2 and 60),
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now()
);

-- ── tournaments ─────────────────────────────────────────────────────────────
-- organiser_id is nullable only so deleting the organiser's account never fails.
create table if not exists public.tournaments (
  id                      uuid primary key default gen_random_uuid(),
  organiser_id            uuid references public.profiles (id) on delete set null,
  game_id                 text not null references public.games (id) on delete cascade,
  name                    text not null check (char_length(btrim(name)) between 3 and 60 and char_length(name) <= 60),
  description             text check (description is null or char_length(description) <= 2000),
  prize                   text check (prize is null or char_length(prize) <= 200),
  region                  text check (region is null or region in (
                            'india_north','india_south','india_east','india_west','south_asia',
                            'middle_east','southeast_asia','europe','north_america','other')),
  max_teams               integer not null check (max_teams in (4, 8, 16, 32)),
  match_format            text not null default 'bo1' check (match_format in ('bo1','bo3')),
  final_format            text not null default 'bo3' check (final_format in ('bo1','bo3','bo5')),
  registration_closes_at  timestamptz not null,
  starts_at               timestamptz not null,
  stream_url              text not null check (
                            char_length(stream_url) <= 200
                            and stream_url ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be|twitch\.tv)/[^\s]+$'),
  status                  text not null default 'registration'
                            check (status in ('registration','live','completed','cancelled')),
  featured_match_id       uuid,  -- FK added below (tournament_matches doesn't exist yet)
  winner_team_id          uuid references public.teams (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists tournaments_status_starts_idx    on public.tournaments (status, starts_at);
create index if not exists tournaments_game_starts_idx      on public.tournaments (game_id, starts_at);
create index if not exists tournaments_organiser_status_idx on public.tournaments (organiser_id, status);

-- ── tournament_teams ────────────────────────────────────────────────────────
create table if not exists public.tournament_teams (
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  team_id        uuid not null references public.teams (id) on delete cascade,
  registered_by  uuid references public.profiles (id) on delete set null,
  registered_at  timestamptz not null default now(),
  checked_in_at  timestamptz,
  seed           integer check (seed is null or seed >= 1),
  status         text not null default 'registered' check (status in (
                   'registered','withdrawn','no_show','playing','eliminated','champion','disqualified')),
  primary key (tournament_id, team_id)
);
create index if not exists tournament_teams_team_idx on public.tournament_teams (team_id, status);

-- ── tournament_rosters (snapshot at start) ──────────────────────────────────
create table if not exists public.tournament_rosters (
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  team_id        uuid not null references public.teams (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  primary key (tournament_id, team_id, profile_id)
);
create index if not exists tournament_rosters_profile_idx on public.tournament_rosters (profile_id);

-- ── tournament_matches ──────────────────────────────────────────────────────
-- Team FKs inline so the names are the defaults the app embeds with:
-- tournament_matches_team_a_id_fkey, tournament_matches_team_b_id_fkey.
create table if not exists public.tournament_matches (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  round            integer not null check (round >= 1),
  slot             integer not null check (slot >= 0),
  team_a_id        uuid references public.teams (id) on delete set null,
  team_b_id        uuid references public.teams (id) on delete set null,
  format           text not null check (format in ('bo1','bo3','bo5')),
  status           text not null default 'pending' check (status in ('pending','ready','completed','disputed','bye')),
  a_score          integer check (a_score is null or a_score between 0 and 3),
  b_score          integer check (b_score is null or b_score between 0 and 3),
  winner_team_id   uuid references public.teams (id) on delete set null,
  next_match_id    uuid references public.tournament_matches (id) on delete set null,
  next_slot        text check (next_slot is null or next_slot in ('a','b')),
  lobby_info       text check (lobby_info is null or char_length(lobby_info) <= 300),
  conversation_id  uuid references public.conversations (id) on delete set null,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tournament_matches_round_slot_key unique (tournament_id, round, slot),
  constraint tournament_matches_distinct_teams check (team_a_id is distinct from team_b_id or team_a_id is null)
);
create index if not exists tournament_matches_team_a_idx on public.tournament_matches (team_a_id) where team_a_id is not null;
create index if not exists tournament_matches_team_b_idx on public.tournament_matches (team_b_id) where team_b_id is not null;
create index if not exists tournament_matches_next_idx   on public.tournament_matches (next_match_id) where next_match_id is not null;
create index if not exists tournament_matches_status_idx on public.tournament_matches (status) where status = 'disputed';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournaments_featured_match_id_fkey') then
    alter table public.tournaments
      add constraint tournaments_featured_match_id_fkey
      foreign key (featured_match_id) references public.tournament_matches (id) on delete set null;
  end if;
end;
$$;

-- ── tournament_match_reports ────────────────────────────────────────────────
create table if not exists public.tournament_match_reports (
  match_id     uuid not null references public.tournament_matches (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  a_score      integer not null check (a_score between 0 and 3),
  b_score      integer not null check (b_score between 0 and 3),
  reported_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (match_id, team_id)
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Notifications: new types
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  c record;
begin
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
  alter table public.notifications add constraint notifications_type_check check (type in (
    'lfg_request','lfg_accepted','message','friend_request','friend_accepted',
    'community_reply','community_solution','rating_received','moderation',
    'team_invite','scrim_request','scrim_update',
    'tournament_update','organiser_application'));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Helpers
-- ═════════════════════════════════════════════════════════════════════════════

-- Can the caller see this match's private bits (lobby, reports)? The two teams (current members
-- or the roster snapshot), the organiser and moderators. Used by RLS and get_match_lobby.
create or replace function public.gg_is_tournament_match_party(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.tournament_matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match_id
      and (t.organiser_id = auth.uid()
           or exists (select 1 from public.moderators mo where mo.profile_id = auth.uid())
           or exists (select 1 from public.team_members tm
                      where tm.profile_id = auth.uid() and tm.team_id in (m.team_a_id, m.team_b_id))
           or exists (select 1 from public.tournament_rosters r
                      where r.tournament_id = m.tournament_id and r.profile_id = auth.uid()
                        and r.team_id in (m.team_a_id, m.team_b_id))));
$$;
revoke all on function public.gg_is_tournament_match_party(uuid) from public, anon;
grant execute on function public.gg_is_tournament_match_party(uuid) to authenticated;

-- Organiser of the tournament or moderator. Returns the caller (null = SQL editor / server).
-- Raises for anyone else. Banned organisers/mods may still act (operational, no new content).
create or replace function public.gg_tournament_staff(p_organiser_id uuid, p_what text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return public.gg_require_moderator();  -- null for SQL editor, raises otherwise
  end if;
  me := public.gg_scrim_actor(true);
  if p_organiser_id is distinct from me
     and not exists (select 1 from public.moderators m where m.profile_id = me) then
    raise exception 'Only the organiser or a moderator can %', p_what using errcode = '42501';
  end if;
  return me;
end;
$$;

-- Is p_profile on either team of the match (now or in the start roster)?
create or replace function public.gg_tournament_match_member(p_match_id uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile is not null and exists (
    select 1 from public.tournament_matches m
    where m.id = p_match_id
      and (exists (select 1 from public.team_members tm
                   where tm.profile_id = p_profile and tm.team_id in (m.team_a_id, m.team_b_id))
           or exists (select 1 from public.tournament_rosters r
                      where r.tournament_id = m.tournament_id and r.profile_id = p_profile
                        and r.team_id in (m.team_a_id, m.team_b_id))));
$$;

-- Both teams of a match are known: status ready, group chat (both rosters + organiser), notify.
create or replace function public.gg_tournament_ready_match(p_match_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_m    public.tournament_matches%rowtype;
  v_t    public.tournaments%rowtype;
  v_cid  uuid;
  v_lbl  text;
  v_rnd  text;
  v_last integer;
begin
  select * into v_m from public.tournament_matches where id = p_match_id for update;
  select * into v_t from public.tournaments where id = v_m.tournament_id;
  if v_m.team_a_id is null or v_m.team_b_id is null or v_m.status <> 'pending' then
    return;
  end if;
  v_lbl := public.gg_team_label(v_m.team_a_id) || ' vs ' || public.gg_team_label(v_m.team_b_id);
  select max(round) into v_last from public.tournament_matches where tournament_id = v_t.id;
  v_rnd := case when v_m.round = v_last then 'Final'
                when v_m.round = v_last - 1 then 'Semi-final'
                else 'Round ' || v_m.round end;

  insert into public.conversations (is_group, title)
  values (true, left(v_lbl || ' · ' || v_t.name, 120))
  returning id into v_cid;
  insert into public.conversation_members (conversation_id, profile_id)
  select v_cid, r.profile_id from public.tournament_rosters r
  where r.tournament_id = v_t.id and r.team_id in (v_m.team_a_id, v_m.team_b_id)
  union
  select v_cid, v_t.organiser_id where v_t.organiser_id is not null
                                   and exists (select 1 from public.profiles where id = v_t.organiser_id)
  on conflict (conversation_id, profile_id) do nothing;

  update public.tournament_matches
     set status = 'ready', conversation_id = v_cid, started_at = now()
   where id = p_match_id;

  perform public.gg_notify_team(
    v_m.team_a_id, 'tournament_update', left(v_rnd || ' ready: ' || v_lbl, 80), v_t.name,
    public.gg_route('/tournaments/match/[id]', p_match_id), p_actor,
    jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id, 'conversation_id', v_cid));
  perform public.gg_notify_team(
    v_m.team_b_id, 'tournament_update', left(v_rnd || ' ready: ' || v_lbl, 80), v_t.name,
    public.gg_route('/tournaments/match/[id]', p_match_id), p_actor,
    jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id, 'conversation_id', v_cid));
end;
$$;

-- A match (completed or bye) has a winner: move it on. Final → tournament completed.
create or replace function public.gg_tournament_advance(p_match_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_m     public.tournament_matches%rowtype;
  v_next  public.tournament_matches%rowtype;
  v_t     public.tournaments%rowtype;
  r       record;
begin
  select * into v_m from public.tournament_matches where id = p_match_id;
  if v_m.winner_team_id is null then
    return;
  end if;

  if v_m.next_match_id is null then
    -- The final.
    select * into v_t from public.tournaments where id = v_m.tournament_id for update;
    update public.tournaments
       set status = 'completed', winner_team_id = v_m.winner_team_id
     where id = v_t.id;
    update public.tournament_teams set status = 'champion'
     where tournament_id = v_t.id and team_id = v_m.winner_team_id;
    for r in
      select tt.team_id from public.tournament_teams tt
      where tt.tournament_id = v_t.id and tt.status in ('playing','eliminated','champion')
    loop
      perform public.gg_notify_team(
        r.team_id, 'tournament_update',
        left(case when r.team_id = v_m.winner_team_id then 'You won ' || v_t.name || '!'
                  else public.gg_team_label(v_m.winner_team_id) || ' won ' || v_t.name end, 80),
        null, public.gg_route('/tournaments/[id]', v_t.id), p_actor,
        jsonb_build_object('tournament_id', v_t.id));
    end loop;
    perform public.gg_notify(
      v_t.organiser_id, 'tournament_update',
      left(v_t.name || ' finished: ' || public.gg_team_label(v_m.winner_team_id) || ' won', 80), null,
      public.gg_route('/tournaments/[id]', v_t.id), p_actor,
      jsonb_build_object('tournament_id', v_t.id));
    return;
  end if;

  select * into v_next from public.tournament_matches where id = v_m.next_match_id for update;
  if v_next.status in ('completed','bye') then
    raise exception 'The next match has already been played' using errcode = '22023';
  end if;
  if v_m.next_slot = 'a' then
    if v_next.team_a_id is not null and v_next.team_a_id <> v_m.winner_team_id then
      raise exception 'The next match already has a team in this slot' using errcode = '22023';
    end if;
    update public.tournament_matches set team_a_id = v_m.winner_team_id where id = v_next.id;
  else
    if v_next.team_b_id is not null and v_next.team_b_id <> v_m.winner_team_id then
      raise exception 'The next match already has a team in this slot' using errcode = '22023';
    end if;
    update public.tournament_matches set team_b_id = v_m.winner_team_id where id = v_next.id;
  end if;
  perform public.gg_tournament_ready_match(v_next.id, p_actor);
end;
$$;

-- Set the final score of a ready/disputed match, eliminate the loser, advance the winner.
create or replace function public.gg_tournament_finish_match(p_match_id uuid, p_a integer, p_b integer, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_m      public.tournament_matches%rowtype;
  v_win    uuid;
  v_lose   uuid;
begin
  select * into v_m from public.tournament_matches where id = p_match_id for update;
  if p_a > p_b then v_win := v_m.team_a_id; v_lose := v_m.team_b_id;
  else              v_win := v_m.team_b_id; v_lose := v_m.team_a_id; end if;
  if v_win is null then
    raise exception 'The winning team is no longer in the tournament' using errcode = '22023';
  end if;
  update public.tournament_matches
     set status = 'completed', a_score = p_a, b_score = p_b, winner_team_id = v_win, completed_at = now()
   where id = p_match_id;
  if v_lose is not null then
    update public.tournament_teams set status = 'eliminated'
     where tournament_id = v_m.tournament_id and team_id = v_lose and status = 'playing';
  end if;
  perform public.gg_tournament_advance(p_match_id, p_actor);
end;
$$;

revoke all on function public.gg_tournament_staff(uuid, text)                       from public, anon, authenticated;
revoke all on function public.gg_tournament_match_member(uuid, uuid)                from public, anon, authenticated;
revoke all on function public.gg_tournament_ready_match(uuid, uuid)                 from public, anon, authenticated;
revoke all on function public.gg_tournament_advance(uuid, uuid)                     from public, anon, authenticated;
revoke all on function public.gg_tournament_finish_match(uuid, integer, integer, uuid) from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Triggers (updated_at)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.handle_tournament_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.handle_tournament_touch() from public, anon, authenticated;

drop trigger if exists tournaments_before_update_touch on public.tournaments;
create trigger tournaments_before_update_touch
  before update on public.tournaments
  for each row execute function public.handle_tournament_touch();

drop trigger if exists tournament_matches_before_update_touch on public.tournament_matches;
create trigger tournament_matches_before_update_touch
  before update on public.tournament_matches
  for each row execute function public.handle_tournament_touch();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Row level security & privileges
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.organiser_applications    enable row level security;
alter table public.organisers                enable row level security;
alter table public.tournaments               enable row level security;
alter table public.tournament_teams          enable row level security;
alter table public.tournament_rosters        enable row level security;
alter table public.tournament_matches        enable row level security;
alter table public.tournament_match_reports  enable row level security;

revoke all on table
  public.organiser_applications, public.organisers, public.tournaments, public.tournament_teams,
  public.tournament_rosters, public.tournament_matches, public.tournament_match_reports
from anon, authenticated;
revoke select (lobby_info) on public.tournament_matches from anon, authenticated;
grant select on table
  public.organiser_applications, public.organisers, public.tournaments, public.tournament_teams,
  public.tournament_rosters, public.tournament_match_reports
to authenticated;
-- Every column except lobby_info (read it with get_match_lobby). Add new columns here.
grant select (id, tournament_id, round, slot, team_a_id, team_b_id, format, status, a_score, b_score,
              winner_team_id, next_match_id, next_slot, conversation_id, started_at, completed_at,
              created_at, updated_at)
  on public.tournament_matches to authenticated;
grant all on table
  public.organiser_applications, public.organisers, public.tournaments, public.tournament_teams,
  public.tournament_rosters, public.tournament_matches, public.tournament_match_reports
to service_role;

drop policy if exists organiser_applications_select on public.organiser_applications;
create policy organiser_applications_select on public.organiser_applications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_moderator(auth.uid()));

drop policy if exists organisers_select on public.organisers;
create policy organisers_select on public.organisers
  for select to authenticated using (true);

drop policy if exists tournaments_select on public.tournaments;
create policy tournaments_select on public.tournaments
  for select to authenticated using (true);

drop policy if exists tournament_teams_select on public.tournament_teams;
create policy tournament_teams_select on public.tournament_teams
  for select to authenticated using (true);

drop policy if exists tournament_rosters_select on public.tournament_rosters;
create policy tournament_rosters_select on public.tournament_rosters
  for select to authenticated using (true);

drop policy if exists tournament_matches_select on public.tournament_matches;
create policy tournament_matches_select on public.tournament_matches
  for select to authenticated using (true);

drop policy if exists tournament_match_reports_select on public.tournament_match_reports;
create policy tournament_match_reports_select on public.tournament_match_reports
  for select to authenticated using (public.gg_is_tournament_match_party(match_id));

-- Realtime (RLS and column privileges still apply): lists, registrations and brackets update live.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['tournaments', 'tournament_teams', 'tournament_matches'] loop
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
-- 6. RPCs – organisers
-- ═════════════════════════════════════════════════════════════════════════════

-- ── apply_to_organise(p_org_name, p_discord, p_about, p_accept_terms) → uuid ─
create or replace function public.apply_to_organise(
  p_org_name      text,
  p_discord       text,
  p_about         text,
  p_accept_terms  boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me         uuid := public.gg_scrim_actor();
  v_name     text := regexp_replace(btrim(coalesce(p_org_name, '')), '\s+', ' ', 'g');
  v_discord  text := nullif(btrim(coalesce(p_discord, '')), '');
  v_about    text := btrim(coalesce(p_about, ''));
  v_created  timestamptz;
  v_last     timestamptz;
  v_id       uuid;
  r          record;
begin
  if exists (select 1 from public.organisers where profile_id = me) then
    raise exception 'You''re already a verified organiser' using errcode = '22023';
  end if;
  select created_at into v_created from public.profiles where id = me;
  if v_created > now() - interval '30 days' then
    raise exception 'Your account must be at least 30 days old to apply' using errcode = '22023';
  end if;
  if exists (select 1 from public.organiser_applications where profile_id = me and status = 'pending') then
    raise exception 'You already have an application waiting for review' using errcode = '22023';
  end if;
  select max(coalesce(reviewed_at, created_at)) into v_last
  from public.organiser_applications where profile_id = me and status = 'rejected';
  if v_last > now() - interval '7 days' then
    raise exception 'You can apply again from %', to_char(v_last + interval '7 days', 'DD Mon YYYY')
      using errcode = '22023';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'Accept the organiser rules to apply' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Organisation name must be 2–60 characters' using errcode = '22023';
  end if;
  if public.gg_clean_text(v_name) is distinct from v_name then
    raise exception 'Pick a different organisation name' using errcode = '22023';
  end if;
  if char_length(v_discord) > 60 then
    raise exception 'Discord can be at most 60 characters' using errcode = '22023';
  end if;
  if char_length(v_about) not between 10 and 500 then
    raise exception 'Tell us about your events in 10–500 characters' using errcode = '22023';
  end if;

  begin
    insert into public.organiser_applications (profile_id, org_name, discord, about)
    values (me, v_name, public.gg_clean_text(v_discord), public.gg_clean_text(v_about))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an application waiting for review' using errcode = '22023';
  end;

  for r in select m.profile_id from public.moderators m loop
    perform public.gg_notify(
      r.profile_id, 'organiser_application', 'New organiser application', v_name,
      public.gg_route('/moderation'), me,
      jsonb_build_object('application_id', v_id));
  end loop;
  return v_id;
end;
$$;

-- ── review_organiser_application(p_application_id, p_approve, p_note) → void ─
create or replace function public.review_organiser_application(p_application_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_require_moderator();
  v_app   public.organiser_applications%rowtype;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_app from public.organiser_applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'This application has already been reviewed' using errcode = '22023';
  end if;
  if v_app.profile_id = me then
    raise exception 'Another moderator must review your own application' using errcode = '42501';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Note can be at most 300 characters' using errcode = '22023';
  end if;
  v_note := public.gg_clean_text(v_note);

  update public.organiser_applications
     set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
         review_note = v_note, reviewed_by = me, reviewed_at = now()
   where id = v_app.id;

  if coalesce(p_approve, false) then
    insert into public.organisers (profile_id, org_name, granted_by, granted_at)
    values (v_app.profile_id, v_app.org_name, me, now())
    on conflict (profile_id) do update
      set org_name = excluded.org_name, granted_by = excluded.granted_by, granted_at = excluded.granted_at;
    perform public.gg_notify(
      v_app.profile_id, 'organiser_application', 'You''re a verified organiser ✓',
      coalesce(v_note, 'You can now host tournaments.'),
      jsonb_build_object('pathname', '/scrims', 'params', jsonb_build_object('tab', 'tournaments')), me,
      jsonb_build_object('application_id', v_app.id, 'tab', 'tournaments'), false, false);
  else
    perform public.gg_notify(
      v_app.profile_id, 'organiser_application', 'Organiser application not approved',
      coalesce(v_note, 'You can apply again in 7 days.'),
      jsonb_build_object('pathname', '/scrims', 'params', jsonb_build_object('tab', 'tournaments')), me,
      jsonb_build_object('application_id', v_app.id, 'tab', 'tournaments'), false, false);
  end if;
end;
$$;

-- ── revoke_organiser(p_profile_id) → void ───────────────────────────────────
-- Their tournaments stay; moderators can cancel them.
create or replace function public.revoke_organiser(p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.gg_require_moderator();
begin
  delete from public.organisers where profile_id = p_profile_id;
  if not found then
    raise exception 'That player isn''t a verified organiser' using errcode = 'P0002';
  end if;
  perform public.gg_notify(
    p_profile_id, 'organiser_application', 'Your organiser badge was removed',
    'Contact the moderators if you think this is a mistake.',
    jsonb_build_object('pathname', '/scrims', 'params', jsonb_build_object('tab', 'tournaments')), me,
    jsonb_build_object('tab', 'tournaments'), false, false);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. RPCs – tournaments
-- ═════════════════════════════════════════════════════════════════════════════

-- ── create_tournament(...) → uuid ───────────────────────────────────────────
create or replace function public.create_tournament(
  p_game_id                 text,
  p_name                    text,
  p_description             text,
  p_prize                   text,
  p_region                  text,
  p_max_teams               integer,
  p_match_format            text,
  p_final_format            text,
  p_registration_closes_at  timestamptz,
  p_starts_at               timestamptz,
  p_stream_url              text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_game   public.games%rowtype;
  v_name   text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_prize  text := nullif(btrim(coalesce(p_prize, '')), '');
  v_region text := nullif(btrim(coalesce(p_region, '')), '');
  v_url    text := nullif(btrim(coalesce(p_stream_url, '')), '');
  v_id     uuid;
begin
  -- Lock my organiser row: serialises the "3 upcoming" limit.
  perform 1 from public.organisers where profile_id = me for update;
  if not found then
    raise exception 'Only verified organisers can host tournaments' using errcode = '42501';
  end if;
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  if not v_game.scrims_enabled then
    raise exception 'Tournaments aren''t available for % yet', v_game.name using errcode = '22023';
  end if;
  if char_length(v_name) not between 3 and 60 then
    raise exception 'Tournament name must be 3–60 characters' using errcode = '22023';
  end if;
  if public.gg_clean_text(v_name) is distinct from v_name then
    raise exception 'Pick a different tournament name' using errcode = '22023';
  end if;
  if char_length(v_desc) > 2000 then
    raise exception 'Description can be at most 2000 characters' using errcode = '22023';
  end if;
  if char_length(v_prize) > 200 then
    raise exception 'Prize can be at most 200 characters' using errcode = '22023';
  end if;
  if v_region is not null and v_region not in ('india_north','india_south','india_east','india_west','south_asia',
                                               'middle_east','southeast_asia','europe','north_america','other') then
    raise exception 'Choose a region' using errcode = '22023';
  end if;
  if p_max_teams is null or p_max_teams not in (4, 8, 16, 32) then
    raise exception 'Max teams must be 4, 8, 16 or 32' using errcode = '22023';
  end if;
  if p_match_format is null or p_match_format not in ('bo1','bo3') then
    raise exception 'Choose a match format (BO1 or BO3)' using errcode = '22023';
  end if;
  if p_final_format is null or p_final_format not in ('bo1','bo3','bo5') then
    raise exception 'Choose a final format (BO1, BO3 or BO5)' using errcode = '22023';
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '1 hour' then
    raise exception 'The start must be at least 1 hour from now' using errcode = '22023';
  end if;
  if p_starts_at > now() + interval '60 days' then
    raise exception 'Tournaments can be scheduled at most 60 days ahead' using errcode = '22023';
  end if;
  if p_registration_closes_at is null or p_registration_closes_at <= now() then
    raise exception 'Registration must close in the future' using errcode = '22023';
  end if;
  if p_registration_closes_at > p_starts_at - interval '30 minutes' then
    raise exception 'Registration must close at least 30 minutes before the start (check-in time)'
      using errcode = '22023';
  end if;
  if not public.gg_valid_stream_url(v_url) then
    raise exception 'Add the YouTube or Twitch channel link (https://…)' using errcode = '22023';
  end if;
  if (select count(*) from public.tournaments
      where organiser_id = me and status in ('registration','live')) >= 3 then
    raise exception 'You already have 3 upcoming tournaments. Finish or cancel one first.' using errcode = '22023';
  end if;

  insert into public.tournaments (organiser_id, game_id, name, description, prize, region, max_teams,
                                  match_format, final_format, registration_closes_at, starts_at, stream_url)
  values (me, p_game_id, v_name, public.gg_clean_text(v_desc), public.gg_clean_text(v_prize), v_region,
          p_max_teams, p_match_format, p_final_format, p_registration_closes_at, p_starts_at, v_url)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── update_tournament_info(p_tournament_id, p_description, p_prize, p_stream_url) → void ─
create or replace function public.update_tournament_info(
  p_tournament_id  uuid,
  p_description    text,
  p_prize          text,
  p_stream_url     text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_t      public.tournaments%rowtype;
  v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_prize  text := nullif(btrim(coalesce(p_prize, '')), '');
  v_url    text := nullif(btrim(coalesce(p_stream_url, '')), '');
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_t.organiser_id is distinct from me then
    raise exception 'Only the organiser can edit this tournament' using errcode = '42501';
  end if;
  if v_t.status in ('completed','cancelled') then
    raise exception 'This tournament is over' using errcode = '22023';
  end if;
  if char_length(v_desc) > 2000 then
    raise exception 'Description can be at most 2000 characters' using errcode = '22023';
  end if;
  if char_length(v_prize) > 200 then
    raise exception 'Prize can be at most 200 characters' using errcode = '22023';
  end if;
  if not public.gg_valid_stream_url(v_url) then
    raise exception 'Add the YouTube or Twitch channel link (https://…)' using errcode = '22023';
  end if;
  update public.tournaments
     set description = public.gg_clean_text(v_desc), prize = public.gg_clean_text(v_prize), stream_url = v_url
   where id = p_tournament_id;
end;
$$;

-- ── cancel_tournament(p_tournament_id) → void ───────────────────────────────
-- Organiser: while registration is open. Moderator: registration or live.
create or replace function public.cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_t    public.tournaments%rowtype;
  me     uuid;
  v_mod  boolean;
  r      record;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  me := public.gg_tournament_staff(v_t.organiser_id, 'cancel this tournament');
  v_mod := me is null or exists (select 1 from public.moderators m where m.profile_id = me);
  if v_t.status = 'cancelled' then
    return;
  end if;
  if v_t.status = 'completed' then
    raise exception 'This tournament is already finished' using errcode = '22023';
  end if;
  if v_t.status = 'live' and not v_mod then
    raise exception 'The tournament has started. Ask a moderator to cancel it.' using errcode = '42501';
  end if;

  update public.tournaments set status = 'cancelled' where id = p_tournament_id;
  for r in
    select tt.team_id from public.tournament_teams tt
    where tt.tournament_id = p_tournament_id and tt.status in ('registered','playing','eliminated')
  loop
    perform public.gg_notify_team(
      r.team_id, 'tournament_update', left('Tournament cancelled: ' || v_t.name, 80),
      case when v_mod and me is distinct from v_t.organiser_id then 'Cancelled by a moderator.'
           else 'Cancelled by the organiser.' end,
      public.gg_route('/tournaments/[id]', p_tournament_id), me,
      jsonb_build_object('tournament_id', p_tournament_id), true);
  end loop;
  if me is distinct from v_t.organiser_id then
    perform public.gg_notify(
      v_t.organiser_id, 'tournament_update', left('Tournament cancelled: ' || v_t.name, 80),
      'Cancelled by a moderator.', public.gg_route('/tournaments/[id]', p_tournament_id), me,
      jsonb_build_object('tournament_id', p_tournament_id), false, false);
  end if;
end;
$$;

-- ── register_team(p_tournament_id, p_team_id) → void ────────────────────────
create or replace function public.register_team(p_tournament_id uuid, p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor();
  v_t     public.tournaments%rowtype;
  v_team  public.teams%rowtype;
  v_row   public.tournament_teams%rowtype;
begin
  -- Lock the tournament: serialises the capacity check.
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  select * into v_team from public.teams where id = p_team_id;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_team.captain_id is distinct from me then
    raise exception 'Only the team captain can register the team' using errcode = '42501';
  end if;
  if v_t.status <> 'registration' or now() >= v_t.registration_closes_at then
    raise exception 'Registration is closed' using errcode = '22023';
  end if;
  if v_team.game_id <> v_t.game_id then
    raise exception 'Your team plays a different game' using errcode = '22023';
  end if;
  if v_t.region is not null and v_team.region <> v_t.region then
    raise exception 'This tournament is only for teams in its region' using errcode = '22023';
  end if;
  if (select count(*) from public.team_members where team_id = p_team_id) < 5 then
    raise exception 'Your team needs at least 5 players to register' using errcode = '22023';
  end if;

  select * into v_row from public.tournament_teams
   where tournament_id = p_tournament_id and team_id = p_team_id for update;
  if found and v_row.status <> 'withdrawn' then
    raise exception 'Your team is already registered' using errcode = '22023';
  end if;
  if (select count(*) from public.tournament_teams
      where tournament_id = p_tournament_id and status = 'registered') >= v_t.max_teams then
    raise exception 'This tournament is full' using errcode = '22023';
  end if;

  if found then
    update public.tournament_teams
       set status = 'registered', registered_by = me, registered_at = now(), checked_in_at = null, seed = null
     where tournament_id = p_tournament_id and team_id = p_team_id;
  else
    insert into public.tournament_teams (tournament_id, team_id, registered_by)
    values (p_tournament_id, p_team_id, me);
  end if;

  perform public.gg_notify_team(
    p_team_id, 'tournament_update', left('Registered: ' || v_t.name, 80),
    'Check in from ' || public.gg_scrim_when(v_t.starts_at - interval '30 minutes', coalesce(v_t.region, v_team.region)),
    public.gg_route('/tournaments/[id]', p_tournament_id), me,
    jsonb_build_object('tournament_id', p_tournament_id));
end;
$$;

-- ── withdraw_team(p_tournament_id, p_team_id) → void ────────────────────────
create or replace function public.withdraw_team(p_tournament_id uuid, p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := public.gg_scrim_actor(true);
  v_t    public.tournaments%rowtype;
  v_row  public.tournament_teams%rowtype;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.teams where id = p_team_id and captain_id = me) then
    raise exception 'Only the team captain can withdraw the team' using errcode = '42501';
  end if;
  select * into v_row from public.tournament_teams
   where tournament_id = p_tournament_id and team_id = p_team_id for update;
  if not found then
    raise exception 'Your team isn''t registered' using errcode = 'P0002';
  end if;
  if v_row.status = 'withdrawn' then
    return;
  end if;
  if v_t.status <> 'registration' then
    raise exception 'The tournament has already started' using errcode = '22023';
  end if;
  update public.tournament_teams set status = 'withdrawn', checked_in_at = null
   where tournament_id = p_tournament_id and team_id = p_team_id;
end;
$$;

-- ── check_in_team(p_tournament_id, p_team_id) → void ────────────────────────
create or replace function public.check_in_team(p_tournament_id uuid, p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := public.gg_scrim_actor(true);
  v_t    public.tournaments%rowtype;
  v_row  public.tournament_teams%rowtype;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.team_members where team_id = p_team_id and profile_id = me) then
    raise exception 'Only players on this team can check in' using errcode = '42501';
  end if;
  select * into v_row from public.tournament_teams
   where tournament_id = p_tournament_id and team_id = p_team_id for update;
  if not found or v_row.status <> 'registered' then
    raise exception 'Your team isn''t registered for this tournament' using errcode = '22023';
  end if;
  if v_t.status <> 'registration' then
    raise exception 'Check-in has closed' using errcode = '22023';
  end if;
  if now() < v_t.starts_at - interval '30 minutes' then
    raise exception 'Check-in opens 30 minutes before the start' using errcode = '22023';
  end if;
  if now() > v_t.starts_at + interval '10 minutes' then
    raise exception 'Check-in has closed' using errcode = '22023';
  end if;
  update public.tournament_teams set checked_in_at = now()
   where tournament_id = p_tournament_id and team_id = p_team_id and checked_in_at is null;
end;
$$;

-- ── start_tournament(p_tournament_id) → void ────────────────────────────────
-- Builds the whole single-elimination bracket up front.
create or replace function public.start_tournament(p_tournament_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me        uuid := public.gg_scrim_actor(true);
  v_t       public.tournaments%rowtype;
  v_n       integer;
  v_size    integer := 2;
  v_rounds  integer := 1;
  v_order   integer[] := array[1, 2];
  v_new     integer[];
  v_seeds   uuid[];
  v_m       integer;
  v_s       integer;
  v_r       integer;
  v_a       uuid;
  v_b       uuid;
  v_id      uuid;
  r         record;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_t.organiser_id is distinct from me then
    raise exception 'Only the organiser can start this tournament' using errcode = '42501';
  end if;
  if v_t.status <> 'registration' then
    raise exception 'This tournament has already started or ended' using errcode = '22023';
  end if;
  if now() < v_t.starts_at - interval '30 minutes' then
    raise exception 'You can start the tournament from 30 minutes before the start time' using errcode = '22023';
  end if;
  -- Teams that disbanded or dropped under 5 players can't play.
  select count(*) into v_n from public.tournament_teams tt
  where tt.tournament_id = p_tournament_id and tt.status = 'registered' and tt.checked_in_at is not null;
  if v_n < 2 then
    raise exception 'At least 2 teams must check in before you can start' using errcode = '22023';
  end if;

  -- No-shows.
  for r in
    select tt.team_id from public.tournament_teams tt
    where tt.tournament_id = p_tournament_id and tt.status = 'registered' and tt.checked_in_at is null
  loop
    update public.tournament_teams set status = 'no_show'
     where tournament_id = p_tournament_id and team_id = r.team_id;
    perform public.gg_notify_team(
      r.team_id, 'tournament_update', left('Missed check-in: ' || v_t.name, 80),
      'Your team didn''t check in, so it isn''t in the bracket.',
      public.gg_route('/tournaments/[id]', p_tournament_id), me,
      jsonb_build_object('tournament_id', p_tournament_id), true);
  end loop;

  -- Seeds: reliability desc (no history last), then random.
  with s as (
    select tt.team_id,
           row_number() over (order by (public.get_team_stats(tt.team_id) ->> 'reliability')::integer desc nulls last,
                                       random()) as rn
    from public.tournament_teams tt
    where tt.tournament_id = p_tournament_id and tt.status = 'registered'
  )
  update public.tournament_teams tt set seed = s.rn, status = 'playing'
  from s where tt.tournament_id = p_tournament_id and tt.team_id = s.team_id;

  select array_agg(tt.team_id order by tt.seed) into v_seeds
  from public.tournament_teams tt where tt.tournament_id = p_tournament_id and tt.status = 'playing';

  -- Bracket size and standard seed order (1 v N, N/2 v N/2+1, …).
  while v_size < v_n loop
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  end loop;
  v_m := 2;
  while v_m < v_size loop
    v_m := v_m * 2;
    v_new := '{}';
    foreach v_s in array v_order loop
      v_new := v_new || v_s || (v_m + 1 - v_s);
    end loop;
    v_order := v_new;
  end loop;

  -- Rosters snapshot.
  delete from public.tournament_rosters where tournament_id = p_tournament_id;
  insert into public.tournament_rosters (tournament_id, team_id, profile_id)
  select p_tournament_id, tm.team_id, tm.profile_id
  from public.team_members tm
  where tm.team_id = any (v_seeds)
  on conflict do nothing;

  -- All matches, final first so every match can link to its next one.
  delete from public.tournament_matches where tournament_id = p_tournament_id;
  for v_r in reverse v_rounds .. 1 loop
    for v_s in 0 .. (v_size / (2 ^ v_r)::integer) - 1 loop
      insert into public.tournament_matches (tournament_id, round, slot, format, next_match_id, next_slot)
      values (p_tournament_id, v_r, v_s,
              case when v_r = v_rounds then v_t.final_format else v_t.match_format end,
              (select n.id from public.tournament_matches n
               where n.tournament_id = p_tournament_id and n.round = v_r + 1 and n.slot = v_s / 2),
              case when v_r = v_rounds then null when v_s % 2 = 0 then 'a' else 'b' end);
    end loop;
  end loop;

  update public.tournaments set status = 'live' where id = p_tournament_id;

  -- Round 1: place seeds; a missing opponent is a bye.
  for v_s in 0 .. (v_size / 2) - 1 loop
    v_a := case when v_order[2 * v_s + 1] <= v_n then v_seeds[v_order[2 * v_s + 1]] end;
    v_b := case when v_order[2 * v_s + 2] <= v_n then v_seeds[v_order[2 * v_s + 2]] end;
    update public.tournament_matches set team_a_id = v_a, team_b_id = v_b
     where tournament_id = p_tournament_id and round = 1 and slot = v_s
    returning id into v_id;
    if v_b is null then
      update public.tournament_matches
         set status = 'bye', winner_team_id = v_a, completed_at = now()
       where id = v_id;
      perform public.gg_notify_team(
        v_a, 'tournament_update', left(v_t.name || ' started: you have a bye', 80),
        'Your team goes straight to round 2.',
        public.gg_route('/tournaments/[id]', p_tournament_id), me,
        jsonb_build_object('tournament_id', p_tournament_id), false);
    end if;
  end loop;
  -- Ready matches, then move bye winners on (which can make round-2 matches ready).
  for r in
    select m.id from public.tournament_matches m
    where m.tournament_id = p_tournament_id and m.round = 1 and m.status = 'pending'
    order by m.slot
  loop
    perform public.gg_tournament_ready_match(r.id, me);
  end loop;
  for r in
    select m.id from public.tournament_matches m
    where m.tournament_id = p_tournament_id and m.round = 1 and m.status = 'bye'
    order by m.slot
  loop
    perform public.gg_tournament_advance(r.id, me);
  end loop;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. RPCs – matches
-- ═════════════════════════════════════════════════════════════════════════════

-- ── report_match_result(p_match_id, p_a_score, p_b_score) → text ────────────
-- Returns the match status afterwards: 'ready' (waiting for the other captain),
-- 'completed' (both agree; winner advanced) or 'disputed' (organiser resolves).
create or replace function public.report_match_result(p_match_id uuid, p_a_score integer, p_b_score integer)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_tid    uuid;
  v_t      public.tournaments%rowtype;
  v_m      public.tournament_matches%rowtype;
  v_mine   uuid;
  v_other  uuid;
  v_ra     public.tournament_match_reports%rowtype;
  v_rb     public.tournament_match_reports%rowtype;
  v_label  text;
begin
  select tournament_id into v_tid from public.tournament_matches where id = p_match_id;
  if v_tid is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select * into v_t from public.tournaments where id = v_tid for update;
  select * into v_m from public.tournament_matches where id = p_match_id for update;
  if v_m.team_a_id is not null and exists (select 1 from public.teams where id = v_m.team_a_id and captain_id = me) then
    v_mine := v_m.team_a_id;  v_other := v_m.team_b_id;
  elsif v_m.team_b_id is not null and exists (select 1 from public.teams where id = v_m.team_b_id and captain_id = me) then
    v_mine := v_m.team_b_id;  v_other := v_m.team_a_id;
  else
    raise exception 'Only a team captain can report the result' using errcode = '42501';
  end if;
  if v_m.status = 'completed' then
    raise exception 'The result is already confirmed' using errcode = '22023';
  end if;
  if v_m.status not in ('ready','disputed') or v_t.status <> 'live' then
    raise exception 'This match isn''t being played right now' using errcode = '22023';
  end if;
  if not public.gg_scrim_score_ok(v_m.format, p_a_score, p_b_score) then
    raise exception '%', public.gg_scrim_score_hint(v_m.format) using errcode = '22023';
  end if;

  insert into public.tournament_match_reports (match_id, team_id, a_score, b_score, reported_by, created_at)
  values (p_match_id, v_mine, p_a_score, p_b_score, me, now())
  on conflict (match_id, team_id) do update
    set a_score = excluded.a_score, b_score = excluded.b_score,
        reported_by = excluded.reported_by, created_at = excluded.created_at;

  select * into v_ra from public.tournament_match_reports where match_id = p_match_id and team_id = v_m.team_a_id;
  select * into v_rb from public.tournament_match_reports where match_id = p_match_id and team_id = v_m.team_b_id;
  v_label := public.gg_team_label(v_m.team_a_id) || ' vs ' || public.gg_team_label(v_m.team_b_id);

  if v_ra.match_id is null or v_rb.match_id is null then
    perform public.gg_notify_team(
      v_other, 'tournament_update',
      left(public.gg_team_label(v_mine) || ' reported ' || p_a_score || '–' || p_b_score || '. Report your result.', 80),
      v_label, public.gg_route('/tournaments/match/[id]', p_match_id), me,
      jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id), true);
    return v_m.status;
  end if;

  if v_ra.a_score = v_rb.a_score and v_ra.b_score = v_rb.b_score then
    perform public.gg_tournament_finish_match(p_match_id, v_ra.a_score, v_ra.b_score, me);
    perform public.gg_notify_team(
      v_other, 'tournament_update', left('Result confirmed: ' || v_label || ' ' || v_ra.a_score || '–' || v_ra.b_score, 80),
      v_t.name, public.gg_route('/tournaments/match/[id]', p_match_id), me,
      jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id), true);
    return 'completed';
  end if;

  update public.tournament_matches set status = 'disputed', a_score = null, b_score = null where id = p_match_id;
  if v_m.status <> 'disputed' then
    perform public.gg_notify_team(
      v_other, 'tournament_update', left('Result disputed: ' || v_label, 80),
      'The two reported scores don''t match. The organiser will set the result.',
      public.gg_route('/tournaments/match/[id]', p_match_id), me,
      jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id), true);
    perform public.gg_notify(
      v_t.organiser_id, 'tournament_update', left('Result disputed: ' || v_label, 80),
      v_t.name || ': the two captains reported different scores.',
      public.gg_route('/tournaments/match/[id]', p_match_id), me,
      jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id));
  end if;
  return 'disputed';
end;
$$;

-- ── resolve_match(p_match_id, p_a_score, p_b_score) → void ──────────────────
-- Organiser or moderator, never a member of either team.
create or replace function public.resolve_match(p_match_id uuid, p_a_score integer, p_b_score integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid;
  v_tid    uuid;
  v_t      public.tournaments%rowtype;
  v_m      public.tournament_matches%rowtype;
  v_label  text;
begin
  select tournament_id into v_tid from public.tournament_matches where id = p_match_id;
  if v_tid is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select * into v_t from public.tournaments where id = v_tid for update;
  me := public.gg_tournament_staff(v_t.organiser_id, 'set this result');
  select * into v_m from public.tournament_matches where id = p_match_id for update;
  if public.gg_tournament_match_member(p_match_id, me) then
    raise exception 'You play for one of these teams, so another organiser or moderator must set this result'
      using errcode = '42501';
  end if;
  if v_t.status <> 'live' then
    raise exception 'This tournament isn''t live' using errcode = '22023';
  end if;
  if v_m.status not in ('ready','disputed') then
    raise exception 'Only a ready or disputed match can be resolved' using errcode = '22023';
  end if;
  if v_m.next_match_id is not null
     and exists (select 1 from public.tournament_matches n
                 where n.id = v_m.next_match_id and n.status in ('completed','bye')) then
    raise exception 'The next match has already been played' using errcode = '22023';
  end if;
  if not public.gg_scrim_score_ok(v_m.format, p_a_score, p_b_score) then
    raise exception '%', public.gg_scrim_score_hint(v_m.format) using errcode = '22023';
  end if;

  perform public.gg_tournament_finish_match(p_match_id, p_a_score, p_b_score, me);

  v_label := public.gg_team_label(v_m.team_a_id) || ' vs ' || public.gg_team_label(v_m.team_b_id);
  perform public.gg_notify(t.captain_id, 'tournament_update',
                           left('Result set: ' || v_label || ' ' || p_a_score || '–' || p_b_score, 80),
                           'The organiser confirmed the result.',
                           public.gg_route('/tournaments/match/[id]', p_match_id), me,
                           jsonb_build_object('tournament_id', v_t.id, 'match_id', p_match_id), false, false)
  from public.teams t
  where t.id in (v_m.team_a_id, v_m.team_b_id);
end;
$$;

-- ── set_match_lobby(p_match_id, p_info) → void ──────────────────────────────
create or replace function public.set_match_lobby(p_match_id uuid, p_info text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor();
  v_m     public.tournament_matches%rowtype;
  v_org   uuid;
  v_info  text := nullif(btrim(coalesce(p_info, '')), '');
  v_lbl   text;
begin
  select * into v_m from public.tournament_matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select organiser_id into v_org from public.tournaments where id = v_m.tournament_id;
  if v_org is distinct from me
     and not exists (select 1 from public.teams t
                     where t.id in (v_m.team_a_id, v_m.team_b_id) and t.captain_id = me) then
    raise exception 'Only a team captain or the organiser can set the lobby details' using errcode = '42501';
  end if;
  if v_m.status <> 'ready' then
    raise exception 'Lobby details can only be set for a ready match' using errcode = '22023';
  end if;
  if char_length(v_info) > 300 then
    raise exception 'Lobby details can be at most 300 characters' using errcode = '22023';
  end if;
  v_info := public.gg_clean_text(v_info);
  if v_info is not distinct from v_m.lobby_info then
    return;
  end if;
  update public.tournament_matches set lobby_info = v_info where id = p_match_id;

  if v_info is not null then
    v_lbl := left('Lobby details posted: ' || public.gg_team_label(v_m.team_a_id) || ' vs '
                  || public.gg_team_label(v_m.team_b_id), 80);
    perform public.gg_notify_team(v_m.team_a_id, 'tournament_update', v_lbl, null,
      public.gg_route('/tournaments/match/[id]', p_match_id), me,
      jsonb_build_object('tournament_id', v_m.tournament_id, 'match_id', p_match_id));
    perform public.gg_notify_team(v_m.team_b_id, 'tournament_update', v_lbl, null,
      public.gg_route('/tournaments/match/[id]', p_match_id), me,
      jsonb_build_object('tournament_id', v_m.tournament_id, 'match_id', p_match_id));
  end if;
end;
$$;

-- ── get_match_lobby(p_match_id) → text (null for anyone outside the match) ──
create or replace function public.get_match_lobby(p_match_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public.gg_scrim_actor(true);
begin
  if not public.gg_is_tournament_match_party(p_match_id) then
    return null;
  end if;
  return (select lobby_info from public.tournament_matches where id = p_match_id);
end;
$$;

-- ── set_featured_match(p_tournament_id, p_match_id) → void ──────────────────
create or replace function public.set_featured_match(p_tournament_id uuid, p_match_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me   uuid := public.gg_scrim_actor(true);
  v_t  public.tournaments%rowtype;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_t.organiser_id is distinct from me then
    raise exception 'Only the organiser can feature a match' using errcode = '42501';
  end if;
  if p_match_id is not null and not exists (
       select 1 from public.tournament_matches where id = p_match_id and tournament_id = p_tournament_id) then
    raise exception 'That match isn''t in this tournament' using errcode = '22023';
  end if;
  update public.tournaments set featured_match_id = p_match_id where id = p_tournament_id;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Function privileges
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.apply_to_organise(text, text, text, boolean)',
    'public.review_organiser_application(uuid, boolean, text)',
    'public.revoke_organiser(uuid)',
    'public.create_tournament(text, text, text, text, text, integer, text, text, timestamptz, timestamptz, text)',
    'public.update_tournament_info(uuid, text, text, text)',
    'public.cancel_tournament(uuid)',
    'public.register_team(uuid, uuid)',
    'public.withdraw_team(uuid, uuid)',
    'public.check_in_team(uuid, uuid)',
    'public.start_tournament(uuid)',
    'public.report_match_result(uuid, integer, integer)',
    'public.resolve_match(uuid, integer, integer)',
    'public.set_match_lobby(uuid, text)',
    'public.get_match_lobby(uuid)',
    'public.set_featured_match(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
