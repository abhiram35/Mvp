-- ─────────────────────────────────────────────────────────────────────────────
-- 0017 – Clips (shared as YouTube / Twitch / Medal links) + Party (the Lobby's squad slots).
-- Contract: docs/CLIPS_AND_PARTY.md ("Database").
--
--   • clips / clip_ggs / clip_comments   – link clips, GGs (likes), comments
--   • parties / party_members / party_invites – up to 5 players, one party per player
--   • reports: target types 'clip' and 'clip_comment' (remove_content sets removed_at)
--   • notifications: new types clip_comment, party_invite
--
-- Every table is readable per the rules in the contract; ALL writes go through the
-- SECURITY DEFINER RPCs below (clients have no insert/update/delete).
-- Error messages raised here are shown to players as-is.
--
-- Requires 0001–0016. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═════════════════════════════════════════════════════════════════════════════

-- ── clips ───────────────────────────────────────────────────────────────────
create table if not exists public.clips (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles (id) on delete cascade,
  game_id        text not null references public.games (id) on delete cascade,
  url            text not null check (char_length(url) between 10 and 500 and url ~* '^https://'),
  platform       text not null check (platform in ('youtube','twitch','medal')),
  video_id       text not null check (char_length(video_id) between 1 and 120),
  title          text not null check (char_length(btrim(title)) between 3 and 80 and char_length(title) <= 80),
  caption        text check (caption is null or char_length(caption) <= 300),
  tournament_id  uuid references public.tournaments (id) on delete set null,
  gg_count       integer not null default 0 check (gg_count >= 0),
  comment_count  integer not null default 0 check (comment_count >= 0),
  removed_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists clips_created_idx       on public.clips (created_at desc) where removed_at is null;
create index if not exists clips_game_created_idx  on public.clips (game_id, created_at desc) where removed_at is null;
create index if not exists clips_author_created_idx on public.clips (author_id, created_at desc);
create index if not exists clips_tournament_idx    on public.clips (tournament_id, created_at desc)
  where tournament_id is not null and removed_at is null;
-- Same video by the same author only once (while it's up).
create unique index if not exists clips_author_video_key
  on public.clips (author_id, platform, video_id) where removed_at is null;

-- ── clip_ggs ────────────────────────────────────────────────────────────────
create table if not exists public.clip_ggs (
  clip_id     uuid not null references public.clips (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (clip_id, profile_id)
);
create index if not exists clip_ggs_profile_idx on public.clip_ggs (profile_id);

-- ── clip_comments ───────────────────────────────────────────────────────────
create table if not exists public.clip_comments (
  id          uuid primary key default gen_random_uuid(),
  clip_id     uuid not null references public.clips (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500 and char_length(body) <= 500),
  removed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists clip_comments_clip_created_idx   on public.clip_comments (clip_id, created_at);
create index if not exists clip_comments_author_created_idx on public.clip_comments (author_id, created_at desc);

-- ── parties ─────────────────────────────────────────────────────────────────
create table if not exists public.parties (
  id          uuid primary key default gen_random_uuid(),
  leader_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists parties_leader_idx on public.parties (leader_id);

-- ── party_members ───────────────────────────────────────────────────────────
create table if not exists public.party_members (
  party_id    uuid not null references public.parties (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  ready       boolean not null default false,
  joined_at   timestamptz not null default now(),
  primary key (party_id, profile_id),
  constraint party_members_profile_key unique (profile_id)  -- one party per player
);

-- ── party_invites ───────────────────────────────────────────────────────────
create table if not exists public.party_invites (
  id          uuid primary key default gen_random_uuid(),
  party_id    uuid not null references public.parties (id) on delete cascade,
  from_id     uuid references public.profiles (id) on delete set null,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '1 hour'),
  constraint party_invites_no_self check (from_id is distinct from to_id)
);
create unique index if not exists party_invites_one_pending_key
  on public.party_invites (party_id, to_id) where status = 'pending';
create index if not exists party_invites_to_idx on public.party_invites (to_id, status);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Notifications: new types · Reports: new target types
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
    'tournament_update','organiser_application',
    'clip_comment','party_invite'));
end;
$$;

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.reports'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%target_type%'
  loop
    execute format('alter table public.reports drop constraint %I', c.conname);
  end loop;
  alter table public.reports
    add constraint reports_target_type_check
    check (target_type in ('profile','message','lfg_post','community_post','community_reply',
                           'clip','clip_comment'));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Helpers
-- ═════════════════════════════════════════════════════════════════════════════

-- Parse a clip link. https only. Returns (platform, video_id), both null when it isn't a
-- supported link.
--   YouTube: youtube.com/watch?v=<11>, m.youtube.com/watch?v=<11>, youtube.com/shorts/<11>, youtu.be/<11>
--   Twitch:  clips.twitch.tv/<slug>, twitch.tv/<channel>/clip/<slug>, twitch.tv/videos/<digits>
--   Medal:   medal.tv/.../clips/<id>
create or replace function public.gg_parse_clip_url(p_url text, out platform text, out video_id text)
language plpgsql
immutable
set search_path = public
as $$
declare
  u  text := btrim(coalesce(p_url, ''));
  m  text[];
begin
  if u ~ '\s' or u !~* '^https://' then
    return;
  end if;

  m := regexp_match(u, '^https://(?:www\.|m\.)?youtube\.com/watch/?\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$', 'i');
  if m is null then
    m := regexp_match(u, '^https://(?:www\.|m\.)?youtube\.com/shorts/([A-Za-z0-9_-]{11})(?:[/?#].*)?$', 'i');
  end if;
  if m is null then
    m := regexp_match(u, '^https://(?:www\.)?youtu\.be/([A-Za-z0-9_-]{11})(?:[/?#].*)?$', 'i');
  end if;
  if m is not null then
    platform := 'youtube'; video_id := m[1]; return;
  end if;

  m := regexp_match(u, '^https://clips\.twitch\.tv/([A-Za-z0-9_-]{3,100})(?:[/?#].*)?$', 'i');
  if m is not null and lower(m[1]) = 'embed' then
    m := null;
  end if;
  if m is null then
    m := regexp_match(u, '^https://(?:www\.|m\.)?twitch\.tv/[A-Za-z0-9_]{1,25}/clip/([A-Za-z0-9_-]{3,100})(?:[/?#].*)?$', 'i');
  end if;
  if m is not null then
    platform := 'twitch'; video_id := m[1]; return;
  end if;
  m := regexp_match(u, '^https://(?:www\.|m\.)?twitch\.tv/videos/([0-9]{1,15})(?:[/?#].*)?$', 'i');
  if m is not null then
    platform := 'twitch'; video_id := m[1]; return;
  end if;

  m := regexp_match(u, '^https://(?:www\.)?medal\.tv/(?:[^?#]*/)?clips/([A-Za-z0-9_-]{3,100})(?:[/?#].*)?$', 'i');
  if m is not null then
    platform := 'medal'; video_id := m[1]; return;
  end if;
end;
$$;

-- Blocked either way between two players. Server-side only (no caller restriction, so it
-- isn't granted to clients; RLS uses is_blocked_between from 0002).
create or replace function public.gg_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a));
$$;

-- Is the caller a member of this party? Used by RLS (definer: avoids recursive policies).
create or replace function public.gg_is_party_member(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.party_members pm
    where pm.party_id = p_party_id and pm.profile_id = auth.uid());
$$;

-- Take p_profile out of their party (if any). Leader leaving hands over to the
-- longest-serving member; the last member leaving deletes the party (invites cascade).
create or replace function public.gg_party_leave(p_profile uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_party  public.parties%rowtype;
  v_next   uuid;
begin
  select p.* into v_party
  from public.parties p
  join public.party_members pm on pm.party_id = p.id
  where pm.profile_id = p_profile
  for update of p;
  if not found then
    return;
  end if;

  delete from public.party_members where party_id = v_party.id and profile_id = p_profile;

  select pm.profile_id into v_next
  from public.party_members pm
  where pm.party_id = v_party.id
  order by pm.joined_at, pm.profile_id
  limit 1;

  if v_next is null then
    delete from public.parties where id = v_party.id;
  elsif v_party.leader_id = p_profile then
    update public.parties set leader_id = v_next where id = v_party.id;
  end if;
end;
$$;

-- Feed row: clip columns + author + my_gg.
create or replace function public.gg_clip_json(p_clip public.clips, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p_clip)
    || jsonb_build_object(
         'author', (select jsonb_build_object('id', p.id, 'username', p.username,
                                              'display_name', p.display_name, 'avatar_url', p.avatar_url)
                    from public.profiles p where p.id = p_clip.author_id),
         'my_gg', exists (select 1 from public.clip_ggs g where g.clip_id = p_clip.id and g.profile_id = p_me));
$$;

revoke all on function public.gg_parse_clip_url(text)          from public, anon, authenticated;
revoke all on function public.gg_blocked_pair(uuid, uuid)       from public, anon, authenticated;
revoke all on function public.gg_party_leave(uuid)              from public, anon, authenticated;
revoke all on function public.gg_clip_json(public.clips, uuid)  from public, anon, authenticated;
revoke all on function public.gg_is_party_member(uuid)          from public, anon;
grant execute on function public.gg_is_party_member(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Row level security & privileges
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.clips          enable row level security;
alter table public.clip_ggs       enable row level security;
alter table public.clip_comments  enable row level security;
alter table public.parties        enable row level security;
alter table public.party_members  enable row level security;
alter table public.party_invites  enable row level security;

revoke all on table
  public.clips, public.clip_ggs, public.clip_comments,
  public.parties, public.party_members, public.party_invites
from anon, authenticated;
grant select on table
  public.clips, public.clip_ggs, public.clip_comments,
  public.parties, public.party_members, public.party_invites
to authenticated;
grant all on table
  public.clips, public.clip_ggs, public.clip_comments,
  public.parties, public.party_members, public.party_invites
to service_role;

drop policy if exists clips_select on public.clips;
create policy clips_select on public.clips
  for select to authenticated
  using (removed_at is null and not public.is_blocked_between(auth.uid(), author_id));

drop policy if exists clip_ggs_select_own on public.clip_ggs;
create policy clip_ggs_select_own on public.clip_ggs
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists clip_comments_select on public.clip_comments;
create policy clip_comments_select on public.clip_comments
  for select to authenticated
  using (removed_at is null and not public.is_blocked_between(auth.uid(), author_id));

drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties
  for select to authenticated using (public.gg_is_party_member(id));

drop policy if exists party_members_select on public.party_members;
create policy party_members_select on public.party_members
  for select to authenticated using (public.gg_is_party_member(party_id));

drop policy if exists party_invites_select on public.party_invites;
create policy party_invites_select on public.party_invites
  for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid() or public.gg_is_party_member(party_id));

-- Realtime (RLS still applies): the Lobby's squad slots and invites update live.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['party_members', 'party_invites'] loop
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
-- 5. RPCs – clips
-- ═════════════════════════════════════════════════════════════════════════════

-- ── post_clip(p_url, p_game_id, p_title, p_caption, p_tournament_id) → uuid ─
create or replace function public.post_clip(
  p_url            text,
  p_game_id        text,
  p_title          text,
  p_caption        text,
  p_tournament_id  uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me         uuid := public.gg_scrim_actor();
  v_url      text := btrim(coalesce(p_url, ''));
  v_title    text := regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_caption  text := nullif(btrim(coalesce(p_caption, '')), '');
  v_parsed   record;
  v_id       uuid;
begin
  if v_url = '' then
    raise exception 'Paste a link to your clip' using errcode = '22023';
  end if;
  if v_url ~* '^http://' then
    raise exception 'Use a secure link (https://)' using errcode = '22023';
  end if;
  if char_length(v_url) > 500 then
    raise exception 'That link is too long' using errcode = '22023';
  end if;
  select * into v_parsed from public.gg_parse_clip_url(v_url);
  if v_parsed.platform is null then
    raise exception 'Paste a YouTube, Twitch or Medal clip link' using errcode = '22023';
  end if;
  if p_game_id is null or not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Choose a game' using errcode = '22023';
  end if;
  if char_length(v_title) not between 3 and 80 then
    raise exception 'Title must be 3–80 characters' using errcode = '22023';
  end if;
  if char_length(v_caption) > 300 then
    raise exception 'Caption can be at most 300 characters' using errcode = '22023';
  end if;
  if p_tournament_id is not null and not exists (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  -- Serialise this player's posts so the daily limit and duplicate check hold.
  perform pg_advisory_xact_lock(hashtextextended('gg_post_clip:' || me::text, 0));
  if (select count(*) from public.clips
      where author_id = me and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You''ve shared 10 clips today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.clips
             where author_id = me and platform = v_parsed.platform and video_id = v_parsed.video_id
               and removed_at is null) then
    raise exception 'You''ve already shared this clip' using errcode = '22023';
  end if;

  insert into public.clips (author_id, game_id, url, platform, video_id, title, caption, tournament_id)
  values (me, p_game_id, v_url, v_parsed.platform, v_parsed.video_id,
          public.gg_clean_text(v_title), public.gg_clean_text(v_caption), p_tournament_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── delete_clip(p_clip_id) → void ───────────────────────────────────────────
create or replace function public.delete_clip(p_clip_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor(true);
  v_clip  public.clips%rowtype;
begin
  select * into v_clip from public.clips where id = p_clip_id for update;
  if not found or v_clip.removed_at is not null then
    raise exception 'Clip not found' using errcode = 'P0002';
  end if;
  if v_clip.author_id <> me then
    raise exception 'Only the author can delete this clip' using errcode = '42501';
  end if;
  update public.clips set removed_at = now() where id = p_clip_id;
end;
$$;

-- ── toggle_clip_gg(p_clip_id) → jsonb {gg, gg_count} ────────────────────────
create or replace function public.toggle_clip_gg(p_clip_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor();
  v_clip  public.clips%rowtype;
  v_gg    boolean;
  v_count integer;
begin
  select * into v_clip from public.clips where id = p_clip_id for update;
  if not found or v_clip.removed_at is not null or public.gg_blocked_pair(me, v_clip.author_id) then
    raise exception 'Clip not found' using errcode = 'P0002';
  end if;

  delete from public.clip_ggs where clip_id = p_clip_id and profile_id = me;
  if found then
    v_gg := false;
    update public.clips set gg_count = greatest(gg_count - 1, 0) where id = p_clip_id
      returning gg_count into v_count;
  else
    insert into public.clip_ggs (clip_id, profile_id) values (p_clip_id, me);
    v_gg := true;
    update public.clips set gg_count = gg_count + 1 where id = p_clip_id
      returning gg_count into v_count;
  end if;
  return jsonb_build_object('gg', v_gg, 'gg_count', v_count);
end;
$$;

-- ── add_clip_comment(p_clip_id, p_body) → uuid ──────────────────────────────
create or replace function public.add_clip_comment(p_clip_id uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor();
  v_body  text := btrim(coalesce(p_body, ''));
  v_clip  public.clips%rowtype;
  v_me    text;
  v_id    uuid;
begin
  if char_length(v_body) not between 1 and 500 then
    raise exception 'Comment must be 1–500 characters' using errcode = '22023';
  end if;
  select * into v_clip from public.clips where id = p_clip_id for update;
  if not found or v_clip.removed_at is not null or public.gg_blocked_pair(me, v_clip.author_id) then
    raise exception 'Clip not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gg_clip_comment:' || me::text, 0));
  if (select count(*) from public.clip_comments
      where author_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You''re commenting a lot. Take a break and try again in a bit.' using errcode = 'P0001';
  end if;

  v_body := public.gg_clean_text(v_body);
  insert into public.clip_comments (clip_id, author_id, body)
  values (p_clip_id, me, v_body)
  returning id into v_id;
  update public.clips set comment_count = comment_count + 1 where id = p_clip_id;

  select display_name into v_me from public.profiles where id = me;
  perform public.gg_notify(
    v_clip.author_id, 'clip_comment',
    left(coalesce(v_me, 'Someone') || ' commented on your clip', 80),
    public.gg_preview(v_body, 120),
    public.gg_route('/clips/[id]', p_clip_id), me,
    jsonb_build_object('clip_id', p_clip_id, 'comment_id', v_id));
  return v_id;
end;
$$;

-- ── delete_clip_comment(p_comment_id) → void ────────────────────────────────
create or replace function public.delete_clip_comment(p_comment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor(true);
  v_cid   uuid;
  v_clip  public.clips%rowtype;
  v_com   public.clip_comments%rowtype;
begin
  select clip_id into v_cid from public.clip_comments where id = p_comment_id;
  if v_cid is null then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  -- Lock order: clip, then comment (same as add_clip_comment / resolve_report).
  select * into v_clip from public.clips where id = v_cid for update;
  select * into v_com from public.clip_comments where id = p_comment_id for update;
  if not found or v_com.removed_at is not null then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  if v_com.author_id <> me and v_clip.author_id <> me then
    raise exception 'Only the comment author or the clip author can delete this comment' using errcode = '42501';
  end if;
  update public.clip_comments set removed_at = now() where id = p_comment_id;
  update public.clips set comment_count = greatest(comment_count - 1, 0) where id = v_cid;
end;
$$;

-- ── get_clip_feed(p_feed, p_game_id, p_limit, p_offset) → setof jsonb ───────
-- Row: clip columns + author {id, username, display_name, avatar_url} + my_gg.
create or replace function public.get_clip_feed(
  p_feed     text,
  p_game_id  text,
  p_limit    integer default 20,
  p_offset   integer default 0
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me      uuid := public.gg_scrim_actor(true);
  v_game  text := nullif(btrim(coalesce(p_game_id, '')), '');
  v_lim   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_feed is null or p_feed not in ('for_you','squad','cups') then
    raise exception 'Unknown feed: %', coalesce(p_feed, 'null') using errcode = '22023';
  end if;

  return query
  select public.gg_clip_json(c, me)
  from public.clips c
  where c.removed_at is null
    and (v_game is null or c.game_id = v_game)
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = me and b.blocked_id = c.author_id)
                       or (b.blocker_id = c.author_id and b.blocked_id = me))
    and case p_feed
          when 'for_you' then c.created_at > now() - interval '30 days'
          when 'cups'    then c.tournament_id is not null
          when 'squad'   then c.author_id <> me and (
                 exists (select 1 from public.friendships f
                         where f.status = 'accepted'
                           and ((f.requester_id = me and f.addressee_id = c.author_id)
                             or (f.addressee_id = me and f.requester_id = c.author_id)))
              or exists (select 1 from public.team_members a
                         join public.team_members t on t.team_id = a.team_id
                         where a.profile_id = me and t.profile_id = c.author_id))
        end
  order by
    case when p_feed = 'for_you' then
      (c.gg_count + 2 * c.comment_count + 1)::double precision
        / power(extract(epoch from (now() - c.created_at)) / 3600.0 + 2, 1.5)
    end desc nulls last,
    c.created_at desc, c.id
  limit v_lim offset v_off;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. RPCs – party
-- ═════════════════════════════════════════════════════════════════════════════

-- ── get_my_party() → jsonb | null ───────────────────────────────────────────
create or replace function public.get_my_party()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_party  public.parties%rowtype;
begin
  select p.* into v_party
  from public.parties p join public.party_members pm on pm.party_id = p.id
  where pm.profile_id = me;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'party_id', v_party.id,
    'leader_id', v_party.leader_id,
    'members', coalesce((
       select jsonb_agg(jsonb_build_object(
                'profile_id', pm.profile_id, 'username', pr.username, 'display_name', pr.display_name,
                'avatar_url', pr.avatar_url, 'ready', pm.ready, 'joined_at', pm.joined_at)
              order by pm.joined_at, pm.profile_id)
       from public.party_members pm join public.profiles pr on pr.id = pm.profile_id
       where pm.party_id = v_party.id), '[]'::jsonb),
    'invites', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', i.id, 'to_id', i.to_id, 'username', pr.username, 'display_name', pr.display_name,
                'avatar_url', pr.avatar_url, 'created_at', i.created_at)
              order by i.created_at, i.id)
       from public.party_invites i join public.profiles pr on pr.id = i.to_id
       where i.party_id = v_party.id and i.status = 'pending' and i.expires_at > now()), '[]'::jsonb));
end;
$$;

-- ── invite_to_party(p_profile_id) → uuid (invite id) ────────────────────────
create or replace function public.invite_to_party(p_profile_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_party  public.parties%rowtype;
  v_id     uuid;
  v_me     text;
begin
  if p_profile_id is null or p_profile_id = me then
    raise exception 'You can''t invite yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if public.gg_blocked_pair(me, p_profile_id) then
    raise exception 'You can''t invite this player' using errcode = '42501';
  end if;

  -- My party (locked), or a new one with me as leader.
  select p.* into v_party
  from public.parties p join public.party_members pm on pm.party_id = p.id
  where pm.profile_id = me
  for update of p;
  if not found then
    begin
      insert into public.parties (leader_id) values (me) returning * into v_party;
      insert into public.party_members (party_id, profile_id) values (v_party.id, me);
    exception when unique_violation then
      raise exception 'Your party changed. Try again.' using errcode = '40001';
    end;
  end if;
  if v_party.leader_id <> me then
    raise exception 'Only the party leader can invite players' using errcode = '42501';
  end if;
  if exists (select 1 from public.party_members where party_id = v_party.id and profile_id = p_profile_id) then
    raise exception 'This player is already in your party' using errcode = '22023';
  end if;

  update public.party_invites set status = 'expired'
   where party_id = v_party.id and status = 'pending' and expires_at <= now();

  select id into v_id from public.party_invites
   where party_id = v_party.id and to_id = p_profile_id and status = 'pending';
  if v_id is not null then
    return v_id; -- already invited
  end if;

  if (select count(*) from public.party_members where party_id = v_party.id)
     + (select count(*) from public.party_invites where party_id = v_party.id and status = 'pending') >= 5 then
    raise exception 'Your party is full (5 players, including pending invites)' using errcode = '22023';
  end if;

  insert into public.party_invites (party_id, from_id, to_id)
  values (v_party.id, me, p_profile_id)
  returning id into v_id;

  select display_name into v_me from public.profiles where id = me;
  perform public.gg_notify(
    p_profile_id, 'party_invite',
    left(coalesce(v_me, 'A player') || ' invited you to their party', 80),
    'Join the squad in the Lobby. The invite expires in 1 hour.',
    public.gg_route('/lobby'), me,
    jsonb_build_object('party_id', v_party.id, 'invite_id', v_id));
  return v_id;
end;
$$;

-- ── respond_party_invite(p_invite_id, p_accept) → void ──────────────────────
create or replace function public.respond_party_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(not coalesce(p_accept, false));
  v_inv    public.party_invites%rowtype;
  v_party  public.parties%rowtype;
begin
  select * into v_inv from public.party_invites where id = p_invite_id;
  if not found or v_inv.to_id <> me then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  -- Lock the inviting party first (same order as invite_to_party), then the invite.
  select * into v_party from public.parties where id = v_inv.party_id for update;
  select * into v_inv from public.party_invites where id = p_invite_id for update;
  if not found or v_party.id is null then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invite is no longer available' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'This invite has expired' using errcode = '22023';
  end if;

  if not coalesce(p_accept, false) then
    update public.party_invites set status = 'declined' where id = v_inv.id;
    return;
  end if;

  if exists (select 1 from public.party_members where party_id = v_party.id and profile_id = me) then
    update public.party_invites set status = 'accepted' where id = v_inv.id;
    return;
  end if;
  if (select count(*) from public.party_members where party_id = v_party.id) >= 5 then
    raise exception 'This party is full' using errcode = '22023';
  end if;

  perform public.gg_party_leave(me);
  insert into public.party_members (party_id, profile_id) values (v_party.id, me);
  update public.party_invites set status = 'accepted' where id = v_inv.id;
end;
$$;

-- ── leave_party() → void ────────────────────────────────────────────────────
create or replace function public.leave_party()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.gg_scrim_actor(true);
begin
  if not exists (select 1 from public.party_members where profile_id = me) then
    raise exception 'You''re not in a party' using errcode = '22023';
  end if;
  perform public.gg_party_leave(me);
end;
$$;

-- ── remove_party_member(p_profile_id) → void ────────────────────────────────
create or replace function public.remove_party_member(p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_party  public.parties%rowtype;
begin
  select p.* into v_party
  from public.parties p join public.party_members pm on pm.party_id = p.id
  where pm.profile_id = me
  for update of p;
  if not found then
    raise exception 'You''re not in a party' using errcode = '22023';
  end if;
  if v_party.leader_id <> me then
    raise exception 'Only the party leader can remove players' using errcode = '42501';
  end if;
  if p_profile_id is null or p_profile_id = me then
    raise exception 'Use Leave party to leave' using errcode = '22023';
  end if;
  delete from public.party_members where party_id = v_party.id and profile_id = p_profile_id;
  if not found then
    raise exception 'This player isn''t in your party' using errcode = 'P0002';
  end if;
end;
$$;

-- ── set_party_ready(p_ready) → void ─────────────────────────────────────────
create or replace function public.set_party_ready(p_ready boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.gg_scrim_actor(true);
begin
  update public.party_members set ready = coalesce(p_ready, false) where profile_id = me;
  if not found then
    raise exception 'You''re not in a party' using errcode = '22023';
  end if;
end;
$$;

-- ── cancel_party_invite(p_invite_id) → void ─────────────────────────────────
create or replace function public.cancel_party_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor(true);
  v_inv    public.party_invites%rowtype;
  v_party  public.parties%rowtype;
begin
  select * into v_inv from public.party_invites where id = p_invite_id;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  select * into v_party from public.parties where id = v_inv.party_id for update;
  select * into v_inv from public.party_invites where id = p_invite_id for update;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_inv.from_id is distinct from me and v_party.leader_id is distinct from me then
    raise exception 'Only the party leader or the sender can cancel this invite' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invite is no longer pending' using errcode = '22023';
  end if;
  update public.party_invites set status = 'cancelled' where id = v_inv.id;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Reports: 'clip' and 'clip_comment' (bodies copied from 0009 / 0012, cases added)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.gg_report_target_user(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'profile'         then (select id        from public.profiles          where id = p_id)
    when 'message'         then (select sender_id from public.messages          where id = p_id)
    when 'lfg_post'        then (select author_id from public.lfg_posts         where id = p_id)
    when 'community_post'  then (select author_id from public.community_posts   where id = p_id)
    when 'community_reply' then (select author_id from public.community_replies where id = p_id)
    when 'clip'            then (select author_id from public.clips             where id = p_id)
    when 'clip_comment'    then (select author_id from public.clip_comments     where id = p_id)
  end;
$$;
revoke all on function public.gg_report_target_user(text, uuid) from public, anon, authenticated;

create or replace function public.gg_report_preview(p_type text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.gg_preview(case p_type
    when 'profile' then (select p.display_name || coalesce(': ' || nullif(btrim(p.bio), ''), '')
                         from public.profiles p where p.id = p_id)
    when 'message'         then (select body  from public.messages          where id = p_id)
    when 'lfg_post'        then (select title from public.lfg_posts         where id = p_id)
    when 'community_post'  then (select title from public.community_posts   where id = p_id)
    when 'community_reply' then (select body  from public.community_replies where id = p_id)
    when 'clip'            then (select c.title || coalesce(': ' || nullif(btrim(c.caption), ''), '')
                                        || ' (' || c.url || ')'
                                 from public.clips c where c.id = p_id)
    when 'clip_comment'    then (select body  from public.clip_comments     where id = p_id)
  end, 200);
$$;
revoke all on function public.gg_report_preview(text, uuid) from public, anon, authenticated;

create or replace function public.resolve_report(
  p_report_id  uuid,
  p_action     text,
  p_ban_days   integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me        uuid := public.gg_require_moderator();
  v_rep     public.reports%rowtype;
  v_target  uuid;
  v_what    text;
  v_done    boolean := false;
  v_until   timestamptz;
  v_cid     uuid;
begin
  select * into v_rep from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if p_action not in ('dismiss','remove_content','ban_user') then
    raise exception 'Unknown action: %', p_action using errcode = '22023';
  end if;

  if p_action = 'dismiss' then
    update public.reports set status = 'reviewed' where id = v_rep.id;
    return;
  end if;

  v_target := coalesce(v_rep.target_user_id,
                       public.gg_report_target_user(v_rep.target_type, v_rep.target_id));

  if p_action = 'remove_content' then
    case v_rep.target_type
      when 'message' then
        delete from public.messages where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your message';
      when 'lfg_post' then
        delete from public.lfg_posts where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your lobby';
      when 'community_post' then
        delete from public.community_posts where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your post';
      when 'community_reply' then
        delete from public.community_replies where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your reply';
      when 'profile' then
        update public.profiles set bio = null, avatar_url = null where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your bio and avatar';
      when 'clip' then
        update public.clips set removed_at = now()
         where id = v_rep.target_id and removed_at is null;
        v_done := found; v_what := 'A moderator removed your clip';
      when 'clip_comment' then
        select clip_id into v_cid from public.clip_comments where id = v_rep.target_id;
        if v_cid is not null then
          perform 1 from public.clips where id = v_cid for update;
          update public.clip_comments set removed_at = now()
           where id = v_rep.target_id and removed_at is null;
          v_done := found;
          if v_done then
            update public.clips set comment_count = greatest(comment_count - 1, 0) where id = v_cid;
          end if;
        end if;
        v_what := 'A moderator removed your comment';
    end case;

    update public.reports set status = 'actioned'
     where id = v_rep.id
        or (status = 'open' and target_type = v_rep.target_type and target_id = v_rep.target_id);

    if v_done then
      perform public.gg_notify(
        v_target, 'moderation', v_what,
        'Reason: ' || public.gg_reason_label(v_rep.reason) || '. Please keep Vinq friendly.',
        public.gg_route('/notifications'), me,
        jsonb_build_object('action', 'remove_content', 'target_type', v_rep.target_type),
        p_show_actor => false, p_respect_blocks => false);
    end if;
    return;
  end if;

  -- ban_user
  if p_ban_days is null or p_ban_days < 1 or p_ban_days > 365 then
    raise exception 'Ban length must be 1–365 days' using errcode = '22023';
  end if;
  if v_target is null or not exists (select 1 from public.profiles where id = v_target) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if v_target = me then
    raise exception 'You cannot ban yourself' using errcode = '22023';
  end if;

  v_until := now() + make_interval(days => p_ban_days);
  update public.profiles set banned_until = v_until where id = v_target;
  update public.reports set status = 'actioned'
   where id = v_rep.id
      or (status = 'open' and target_type = v_rep.target_type and target_id = v_rep.target_id);

  perform public.gg_notify(
    v_target, 'moderation',
    'Your account is paused until ' || to_char(v_until at time zone 'Asia/Kolkata', 'FMDD Mon'),
    'You can still read and browse. Reason: ' || public.gg_reason_label(v_rep.reason) || '.',
    public.gg_route('/notifications'), me,
    jsonb_build_object('action', 'ban_user', 'banned_until', v_until),
    p_show_actor => false, p_respect_blocks => false);
end;
$$;
revoke all on function public.resolve_report(uuid, text, integer) from public, anon;
grant execute on function public.resolve_report(uuid, text, integer) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Function privileges
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.post_clip(text, text, text, text, uuid)',
    'public.delete_clip(uuid)',
    'public.toggle_clip_gg(uuid)',
    'public.add_clip_comment(uuid, text)',
    'public.delete_clip_comment(uuid)',
    'public.get_clip_feed(text, text, integer, integer)',
    'public.get_my_party()',
    'public.invite_to_party(uuid)',
    'public.respond_party_invite(uuid, boolean)',
    'public.leave_party()',
    'public.remove_party_member(uuid)',
    'public.set_party_ready(boolean)',
    'public.cancel_party_invite(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
