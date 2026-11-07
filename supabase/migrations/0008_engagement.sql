-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0008 – engagement: notifications (inbox + push), teammate ratings, XP.
-- Implements the "Phase 2" section of src/lib/types.ts (docs/PHASE2.md §1–2).
--
--   • notifications      – inbox rows, created ONLY by the triggers below.
--                          Recipient reads them and may set read_at.
--   • push_tokens        – Expo push tokens, owner upserts / deletes their own.
--   • teammate_ratings   – praise tags or a private 'toxic' flag (rate_teammate RPC only).
--   • player_stats       – server-maintained XP + reputation counters (get_player_stats).
--
-- Push: an AFTER INSERT trigger on notifications calls the `send-push` Edge
-- Function through pg_net, using two Supabase Vault secrets:
--   send_push_url     https://<ref>.functions.supabase.co/send-push
--   send_push_secret  same value as the function's PUSH_SHARED_SECRET
-- If pg_net, Vault or the secrets are missing, nothing is sent and the inbox
-- still works. A push failure never breaks the original insert.
--
-- Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_net is available on every Supabase project. Elsewhere (local tests) this
-- just prints a notice and push stays off.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available, push notifications disabled (%)', sqlerrm;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Notifications
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  type          text not null check (type in (
                  'lfg_request','lfg_accepted','message','friend_request','friend_accepted',
                  'community_reply','community_solution','rating_received','moderation')),
  title         text not null check (char_length(title) between 1 and 80),
  body          text check (body is null or char_length(body) <= 160),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id) where read_at is null;
-- Finds the latest unread message notification for a conversation (collapse).
create index if not exists notifications_unread_message_conv_idx
  on public.notifications (recipient_id, ((data ->> 'conversation_id')))
  where type = 'message' and read_at is null;

-- Message push throttle: last push per (recipient, conversation). Server only.
create table if not exists public.notification_push_throttle (
  recipient_id     uuid not null references public.profiles (id) on delete cascade,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  last_push_at     timestamptz not null,
  primary key (recipient_id, conversation_id)
);

-- ── push_tokens ─────────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  token       text primary key
              check (char_length(token) between 10 and 255 and token ~ '^Expo(nent)?PushToken\[.+\]$'),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios','android')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_profile_id_idx on public.push_tokens (profile_id);

-- A device that signs in to another account takes its token with it: remove the
-- old owner's row first so the new owner's upsert does not hit their RLS.
create or replace function public.handle_push_token_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    delete from public.push_tokens t
    where t.token = new.token and t.profile_id <> new.profile_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.handle_push_token_write() from public, anon, authenticated;

drop trigger if exists push_tokens_before_write on public.push_tokens;
create trigger push_tokens_before_write
  before insert or update on public.push_tokens
  for each row execute function public.handle_push_token_write();

-- ── RLS + privileges ────────────────────────────────────────────────────────
alter table public.notifications              enable row level security;
alter table public.notification_push_throttle enable row level security;
alter table public.push_tokens                enable row level security;

revoke all on table public.notifications, public.notification_push_throttle, public.push_tokens
  from anon, authenticated;

grant select                  on public.notifications to authenticated;
grant update (read_at)        on public.notifications to authenticated;
grant select, delete          on public.push_tokens   to authenticated;
grant insert (token, profile_id, platform, updated_at) on public.push_tokens to authenticated;
grant update (token, profile_id, platform, updated_at) on public.push_tokens to authenticated;
grant all on table public.notifications, public.push_tokens to service_role;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists push_tokens_insert_own on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (profile_id = auth.uid());

-- ── Push dispatch (pg_net → send-push) ──────────────────────────────────────
-- Queues one HTTP call. pg_net sends it after the transaction commits.
-- Silently does nothing if Vault / pg_net / the secrets are missing.
create or replace function public.gg_dispatch_push(p_notification_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  begin
    select s.decrypted_secret into v_url
    from vault.decrypted_secrets s where s.name = 'send_push_url' limit 1;
    select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s where s.name = 'send_push_secret' limit 1;
    if coalesce(btrim(v_url), '') = '' or coalesce(v_secret, '') = '' then
      return;
    end if;
    perform net.http_post(
      url                  := btrim(v_url),
      body                 := jsonb_build_object('notification_id', p_notification_id),
      headers              := jsonb_build_object('Content-Type', 'application/json',
                                                 'x-gg-push-secret', v_secret),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise log 'gg_dispatch_push skipped: %', sqlstate; -- never break the original insert
  end;
end;
$$;
revoke all on function public.gg_dispatch_push(uuid) from public, anon, authenticated;

create or replace function public.handle_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gg_dispatch_push(new.id);
  return null;
end;
$$;
revoke all on function public.handle_notification_push() from public, anon, authenticated;

-- Message notifications are pushed by the message trigger itself (throttled), so
-- they are excluded here.
drop trigger if exists notifications_after_insert_push on public.notifications;
create trigger notifications_after_insert_push
  after insert on public.notifications
  for each row
  when (new.type <> 'message')
  execute function public.handle_notification_push();

-- ── gg_notify: the one place notifications are created ──────────────────────
-- Never to the actor, never across a block (unless p_respect_blocks = false,
-- used for moderation notices). p_show_actor = false keeps the actor anonymous
-- (teammate ratings, moderators). Never raises: a failure only skips the row.
create or replace function public.gg_notify(
  p_recipient       uuid,
  p_type            text,
  p_title           text,
  p_body            text,
  p_route           jsonb,
  p_actor           uuid    default null,
  p_extra           jsonb   default '{}'::jsonb,
  p_show_actor      boolean default true,
  p_respect_blocks  boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_data jsonb;
begin
  if p_recipient is null or p_recipient = p_actor then
    return null;
  end if;
  if p_respect_blocks and p_actor is not null and exists (
       select 1 from public.blocks b
       where (b.blocker_id = p_recipient and b.blocked_id = p_actor)
          or (b.blocker_id = p_actor and b.blocked_id = p_recipient)) then
    return null;
  end if;

  v_data := coalesce(p_extra, '{}'::jsonb) || jsonb_build_object('route', p_route);
  if p_show_actor and p_actor is not null then
    v_data := v_data || jsonb_build_object('actor_id', p_actor);
  end if;

  begin
    insert into public.notifications (recipient_id, type, title, body, data)
    select p_recipient, p_type,
           left(coalesce(nullif(btrim(p_title), ''), 'GG'), 80),
           nullif(left(btrim(coalesce(p_body, '')), 160), ''),
           v_data
    where exists (select 1 from public.profiles where id = p_recipient)
    returning id into v_id;
  exception when others then
    raise log 'gg_notify skipped (%): %', p_type, sqlerrm;
    return null;
  end;
  return v_id;
end;
$$;
revoke all on function public.gg_notify(uuid, text, text, text, jsonb, uuid, jsonb, boolean, boolean)
  from public, anon, authenticated;

create or replace function public.gg_route(p_pathname text, p_id uuid default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p_id is null then jsonb_build_object('pathname', p_pathname)
              else jsonb_build_object('pathname', p_pathname,
                                      'params', jsonb_build_object('id', p_id::text)) end;
$$;

-- One-line preview of user text.
create or replace function public.gg_preview(p_text text, p_len integer default 120)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_text is null then null
              when char_length(regexp_replace(btrim(p_text), '\s+', ' ', 'g')) > p_len
                then left(regexp_replace(btrim(p_text), '\s+', ' ', 'g'), p_len - 1) || '…'
              else regexp_replace(btrim(p_text), '\s+', ' ', 'g') end;
$$;

-- ── count_unread_notifications() → integer ──────────────────────────────────
create or replace function public.count_unread_notifications()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return (select count(*)::integer from public.notifications n
          where n.recipient_id = auth.uid() and n.read_at is null);
end;
$$;

-- ── mark_notifications_read(p_id) → void (p_id null = all) ──────────────────
create or replace function public.mark_notifications_read(p_id uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.notifications n
     set read_at = now()
   where n.recipient_id = auth.uid()
     and n.read_at is null
     and (p_id is null or n.id = p_id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Teammate ratings + XP
-- ═════════════════════════════════════════════════════════════════════════════

-- lfg_post_id has no FK on purpose: ratings (and the XP they gave) survive if the
-- host deletes the lobby, so a host cannot wipe their toxic flags that way.
create table if not exists public.teammate_ratings (
  id           uuid primary key default gen_random_uuid(),
  rater_id     uuid not null references public.profiles (id) on delete cascade,
  ratee_id     uuid not null references public.profiles (id) on delete cascade,
  lfg_post_id  uuid not null,
  tags         text[] not null check (
                 cardinality(tags) between 1 and 4
                 and tags <@ array['good_comms','chill','clutch','shotcaller','toxic']::text[]
                 and (not ('toxic' = any (tags)) or tags = array['toxic']::text[])),
  created_at   timestamptz not null default now(), -- time of the latest (re-)rating
  constraint teammate_ratings_no_self check (rater_id <> ratee_id),
  constraint teammate_ratings_rater_ratee_post_key unique (rater_id, ratee_id, lfg_post_id)
);
create index if not exists teammate_ratings_ratee_idx on public.teammate_ratings (ratee_id, created_at desc);
create index if not exists teammate_ratings_post_idx  on public.teammate_ratings (lfg_post_id);

-- Server-maintained. Toxic counts are never stored here (computed only for moderators).
create table if not exists public.player_stats (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  xp                integer not null default 0 check (xp >= 0),
  squads_joined     integer not null default 0 check (squads_joined >= 0),
  lobbies_hosted    integer not null default 0 check (lobbies_hosted >= 0),
  solutions         integer not null default 0 check (solutions >= 0),
  ratings_received  integer not null default 0 check (ratings_received >= 0), -- distinct raters
  positive_ratings  integer not null default 0 check (positive_ratings >= 0), -- distinct raters who gave praise
  good_comms        integer not null default 0 check (good_comms >= 0),       -- ratings carrying the tag
  chill             integer not null default 0 check (chill >= 0),
  clutch            integer not null default 0 check (clutch >= 0),
  shotcaller        integer not null default 0 check (shotcaller >= 0),
  updated_at        timestamptz not null default now()
);

-- Community GGs received per player per IST day (for the +50 XP/day cap).
create table if not exists public.xp_gg_daily (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  ggs         integer not null default 0 check (ggs >= 0),
  primary key (profile_id, day)
);

alter table public.teammate_ratings enable row level security;
alter table public.player_stats     enable row level security;
alter table public.xp_gg_daily      enable row level security;

revoke all on table public.teammate_ratings, public.player_stats, public.xp_gg_daily from anon, authenticated;
-- Raters may read the ratings they gave. Writes go through rate_teammate only.
grant select on public.teammate_ratings to authenticated;
grant all on table public.teammate_ratings, public.player_stats, public.xp_gg_daily to service_role;

drop policy if exists teammate_ratings_select_own on public.teammate_ratings;
create policy teammate_ratings_select_own on public.teammate_ratings
  for select to authenticated using (rater_id = auth.uid());

-- ── XP helpers ──────────────────────────────────────────────────────────────
-- level = floor(sqrt(xp / 50)) + 1. Level L starts at 50·(L−1)² XP.
create or replace function public.gg_level(p_xp integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select (floor(sqrt(greatest(coalesce(p_xp, 0), 0)::numeric / 50)) + 1)::integer;
$$;

-- +10 per praise tag, max 30 per rating. 'toxic' gives nothing.
create or replace function public.gg_rating_xp(p_tags text[])
returns integer
language sql
immutable
set search_path = public
as $$
  select least(30, 10 * cardinality(array(
    select t from unnest(coalesce(p_tags, '{}'::text[])) t
    where t in ('good_comms','chill','clutch','shotcaller'))));
$$;

-- Up to 2 public tags, most received first (ties in the fixed tag order).
create or replace function public.gg_top_tags(p_good integer, p_chill integer, p_clutch integer, p_shot integer)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(v.tag order by v.n desc, v.ord), '[]'::jsonb)
  from (
    select x.tag, x.n, x.ord
    from (values ('good_comms', coalesce(p_good, 0), 1), ('chill', coalesce(p_chill, 0), 2),
                 ('clutch', coalesce(p_clutch, 0), 3), ('shotcaller', coalesce(p_shot, 0), 4)) x (tag, n, ord)
    where x.n > 0
    order by x.n desc, x.ord
    limit 2
  ) v;
$$;

-- Adds to a player's counters (creating the row). Skips players that no longer
-- exist (e.g. during account deletion cascades).
create or replace function public.gg_bump_stats(
  p_profile    uuid,
  p_xp         integer default 0,
  p_squads     integer default 0,
  p_hosted     integer default 0,
  p_solutions  integer default 0
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_profile is null
     or (coalesce(p_xp, 0) = 0 and coalesce(p_squads, 0) = 0
         and coalesce(p_hosted, 0) = 0 and coalesce(p_solutions, 0) = 0) then
    return;
  end if;
  insert into public.player_stats as s (profile_id, xp, squads_joined, lobbies_hosted, solutions)
  select p_profile, greatest(p_xp, 0), greatest(p_squads, 0), greatest(p_hosted, 0), greatest(p_solutions, 0)
  where exists (select 1 from public.profiles where id = p_profile)
  on conflict (profile_id) do update
    set xp             = greatest(s.xp + p_xp, 0),
        squads_joined  = greatest(s.squads_joined + p_squads, 0),
        lobbies_hosted = greatest(s.lobbies_hosted + p_hosted, 0),
        solutions      = greatest(s.solutions + p_solutions, 0),
        updated_at     = now();
end;
$$;

-- Recomputes the rating counters of one player from teammate_ratings.
create or replace function public.gg_refresh_rating_stats(p_profile uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.player_stats as s
    (profile_id, ratings_received, positive_ratings, good_comms, chill, clutch, shotcaller)
  select p_profile,
         count(distinct r.rater_id),
         count(distinct r.rater_id) filter (where r.tags && array['good_comms','chill','clutch','shotcaller']),
         count(*) filter (where 'good_comms' = any (r.tags)),
         count(*) filter (where 'chill'      = any (r.tags)),
         count(*) filter (where 'clutch'     = any (r.tags)),
         count(*) filter (where 'shotcaller' = any (r.tags))
  from public.teammate_ratings r
  where r.ratee_id = p_profile
  having exists (select 1 from public.profiles where id = p_profile)
  on conflict (profile_id) do update
    set ratings_received = excluded.ratings_received,
        positive_ratings = excluded.positive_ratings,
        good_comms       = excluded.good_comms,
        chill            = excluded.chill,
        clutch           = excluded.clutch,
        shotcaller       = excluded.shotcaller,
        updated_at       = now();
end;
$$;

-- PlayerStats JSON for any player (zeros if no row yet).
create or replace function public.gg_player_stats_json(p_profile uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s       public.player_stats%rowtype;
  v_xp    integer;
  v_level integer;
begin
  select * into s from public.player_stats where profile_id = p_profile;
  v_xp    := coalesce(s.xp, 0);
  v_level := public.gg_level(v_xp);
  return jsonb_build_object(
    'profile_id',       p_profile,
    'xp',               v_xp,
    'level',            v_level,
    'xp_into_level',    v_xp - 50 * (v_level - 1) * (v_level - 1),
    'xp_for_next',      50 * (2 * v_level - 1),
    'squads_joined',    coalesce(s.squads_joined, 0),
    'lobbies_hosted',   coalesce(s.lobbies_hosted, 0),
    'ratings_received', coalesce(s.ratings_received, 0),
    'positive_ratings', coalesce(s.positive_ratings, 0),
    'tag_counts',       jsonb_build_object(
                          'good_comms', coalesce(s.good_comms, 0),
                          'chill',      coalesce(s.chill, 0),
                          'clutch',     coalesce(s.clutch, 0),
                          'shotcaller', coalesce(s.shotcaller, 0)),
    'solutions',        coalesce(s.solutions, 0)
  );
end;
$$;

revoke all on function public.gg_level(integer)                                  from public, anon;
revoke all on function public.gg_rating_xp(text[])                               from public, anon, authenticated;
revoke all on function public.gg_top_tags(integer, integer, integer, integer)    from public, anon;
revoke all on function public.gg_bump_stats(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.gg_refresh_rating_stats(uuid)                      from public, anon, authenticated;
revoke all on function public.gg_player_stats_json(uuid)                         from public, anon, authenticated;
grant execute on function public.gg_level(integer)                               to authenticated;
grant execute on function public.gg_top_tags(integer, integer, integer, integer) to authenticated;

-- ── Is this player in the lobby's squad chat? ───────────────────────────────
create or replace function public.gg_in_squad(p_post public.lfg_posts, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_post.conversation_id is not null and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_post.conversation_id and cm.profile_id = p_profile);
$$;
revoke all on function public.gg_in_squad(public.lfg_posts, uuid) from public, anon, authenticated;

-- ── rate_teammate(p_lfg_post_id, p_ratee_id, p_tags) → PlayerStats ──────────
create or replace function public.rate_teammate(p_lfg_post_id uuid, p_ratee_id uuid, p_tags text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  v_post public.lfg_posts%rowtype;
  v_tags text[];
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  v_tags := array(select distinct t from unnest(coalesce(p_tags, '{}'::text[])) t
                  where t is not null order by t);
  if cardinality(v_tags) = 0 then
    raise exception 'Pick at least one tag' using errcode = '22023';
  end if;
  if not (v_tags <@ array['good_comms','chill','clutch','shotcaller','toxic']::text[]) then
    raise exception 'Unknown rating tag' using errcode = '22023';
  end if;
  if 'toxic' = any (v_tags) and cardinality(v_tags) > 1 then
    raise exception 'Toxic cannot be combined with praise tags' using errcode = '22023';
  end if;

  if p_ratee_id is null or p_ratee_id = me then
    raise exception 'You cannot rate yourself' using errcode = '22023';
  end if;

  select * into v_post from public.lfg_posts where id = p_lfg_post_id;
  if not found then
    raise exception 'Lobby not found' using errcode = 'P0002';
  end if;
  if v_post.conversation_id is null then
    raise exception 'You can rate teammates once the squad chat exists' using errcode = '22023';
  end if;
  if now() > v_post.created_at + interval '7 days' then
    raise exception 'Ratings for this lobby are closed (7 days)' using errcode = '22023';
  end if;
  if not public.gg_in_squad(v_post, me) or not public.gg_in_squad(v_post, p_ratee_id) then
    raise exception 'You can only rate players from your squad' using errcode = '42501';
  end if;

  insert into public.teammate_ratings as r (rater_id, ratee_id, lfg_post_id, tags)
  values (me, p_ratee_id, p_lfg_post_id, v_tags)
  on conflict (rater_id, ratee_id, lfg_post_id) do update
    set tags = excluded.tags, created_at = now()
    where r.tags is distinct from excluded.tags;

  return public.gg_player_stats_json(p_ratee_id);
end;
$$;

-- ── list_rateable_teammates(p_lfg_post_id) → setof jsonb (RateableTeammate) ─
-- { profile: {id, username, display_name, avatar_url}, already_rated, my_tags }
create or replace function public.list_rateable_teammates(p_lfg_post_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  v_post public.lfg_posts%rowtype;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_post from public.lfg_posts where id = p_lfg_post_id;
  if not found
     or v_post.conversation_id is null
     or now() > v_post.created_at + interval '7 days'
     or not public.gg_in_squad(v_post, me) then
    return;
  end if;

  return query
  select jsonb_build_object(
           'profile', jsonb_build_object('id', p.id, 'username', p.username,
                                         'display_name', p.display_name, 'avatar_url', p.avatar_url),
           'already_rated', r.id is not null,
           'my_tags', to_jsonb(coalesce(r.tags, '{}'::text[]))
         )
  from public.conversation_members cm
  join public.profiles p on p.id = cm.profile_id
  left join public.teammate_ratings r
    on r.rater_id = me and r.ratee_id = p.id and r.lfg_post_id = v_post.id
  where cm.conversation_id = v_post.conversation_id
    and cm.profile_id <> me
  order by lower(p.display_name), p.id;
end;
$$;

-- ── get_player_stats(p_profile_id) → PlayerStats ────────────────────────────
create or replace function public.get_player_stats(p_profile_id uuid)
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
  if p_profile_id is null then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  return public.gg_player_stats_json(p_profile_id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Triggers: notifications + XP
-- ═════════════════════════════════════════════════════════════════════════════

-- ── lfg_requests insert → host ("Rhea wants to join your lobby") ────────────
create or replace function public.handle_lfg_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.lfg_posts%rowtype;
  v_name text;
begin
  if new.status <> 'pending' then
    return null;
  end if;
  select * into v_post from public.lfg_posts where id = new.post_id;
  if not found then
    return null;
  end if;
  select display_name into v_name from public.profiles where id = new.requester_id;
  perform public.gg_notify(
    v_post.author_id, 'lfg_request',
    coalesce(v_name, 'A player') || ' wants to join your lobby',
    coalesce(public.gg_preview(new.message, 158), v_post.title),
    public.gg_route('/lfg/[id]', v_post.id),
    new.requester_id,
    jsonb_build_object('post_id', v_post.id, 'request_id', new.id));
  return null;
end;
$$;

drop trigger if exists lfg_requests_after_insert_notify on public.lfg_requests;
create trigger lfg_requests_after_insert_notify
  after insert on public.lfg_requests
  for each row execute function public.handle_lfg_request_created();

-- ── lfg_requests → accepted: notify requester, XP (+5 joiner, +15 host on first) ─
create or replace function public.handle_lfg_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.lfg_posts%rowtype;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return null;
  end if;
  select * into v_post from public.lfg_posts where id = new.post_id;
  if not found then
    return null;
  end if;

  perform public.gg_bump_stats(new.requester_id, p_xp => 5, p_squads => 1);
  if (select count(*) from public.lfg_requests r
      where r.post_id = new.post_id and r.status = 'accepted') = 1 then
    perform public.gg_bump_stats(v_post.author_id, p_xp => 15, p_squads => 1);
  end if;

  perform public.gg_notify(
    new.requester_id, 'lfg_accepted',
    'You''re in: ' || v_post.title,
    'Say hi to your squad.',
    case when v_post.conversation_id is not null
         then public.gg_route('/chat/[id]', v_post.conversation_id)
         else public.gg_route('/lfg/[id]', v_post.id) end,
    v_post.author_id,
    jsonb_build_object('post_id', v_post.id, 'conversation_id', v_post.conversation_id));
  return null;
end;
$$;

drop trigger if exists lfg_requests_after_update_accepted on public.lfg_requests;
create trigger lfg_requests_after_update_accepted
  after update of status on public.lfg_requests
  for each row execute function public.handle_lfg_request_accepted();

-- ── lfg_posts insert → lobbies_hosted ───────────────────────────────────────
create or replace function public.handle_lfg_post_hosted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gg_bump_stats(new.author_id, p_hosted => 1);
  return null;
end;
$$;

drop trigger if exists lfg_posts_after_insert_stats on public.lfg_posts;
create trigger lfg_posts_after_insert_stats
  after insert on public.lfg_posts
  for each row execute function public.handle_lfg_post_hosted();

-- ── messages insert → every other member (throttled + collapsed) ────────────
-- One unread row per (recipient, conversation): new messages update it instead
-- of stacking. At most one push per recipient per conversation every 60 s.
create or replace function public.gg_notify_message(
  p_recipient  uuid,
  p_message    public.messages,
  p_title      text,
  p_preview    text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_data  jsonb;
  v_last  timestamptz;
  v_route jsonb := public.gg_route('/chat/[id]', p_message.conversation_id);
begin
  begin
    select n.id, n.data into v_id, v_data
    from public.notifications n
    where n.recipient_id = p_recipient
      and n.type = 'message'
      and n.read_at is null
      and n.data ->> 'conversation_id' = p_message.conversation_id::text
    order by n.created_at desc
    limit 1
    for update;

    if v_id is not null then
      update public.notifications
         set title = left(p_title, 80),
             body = p_preview,
             data = v_data || jsonb_build_object(
                      'actor_id', p_message.sender_id,
                      'message_id', p_message.id,
                      'count', coalesce((v_data ->> 'count')::integer, 1) + 1),
             created_at = now()
       where id = v_id;
    else
      v_id := public.gg_notify(
        p_recipient, 'message', p_title, p_preview, v_route, p_message.sender_id,
        jsonb_build_object('conversation_id', p_message.conversation_id,
                           'message_id', p_message.id, 'count', 1));
      if v_id is null then
        return;
      end if;
    end if;

    select t.last_push_at into v_last
    from public.notification_push_throttle t
    where t.recipient_id = p_recipient and t.conversation_id = p_message.conversation_id
    for update;

    if v_last is null or v_last <= now() - interval '60 seconds' then
      insert into public.notification_push_throttle (recipient_id, conversation_id, last_push_at)
      values (p_recipient, p_message.conversation_id, now())
      on conflict (recipient_id, conversation_id) do update set last_push_at = excluded.last_push_at;
      perform public.gg_dispatch_push(v_id);
    end if;
  exception when others then
    raise log 'gg_notify_message skipped: %', sqlerrm;
  end;
end;
$$;
revoke all on function public.gg_notify_message(uuid, public.messages, text, text) from public, anon, authenticated;

create or replace function public.handle_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv   public.conversations%rowtype;
  v_sender text;
  v_title  text;
  v_body   text := public.gg_preview(new.body, 140);
  r        record;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  if not found then
    return null;
  end if;
  select display_name into v_sender from public.profiles where id = new.sender_id;
  v_sender := coalesce(v_sender, 'Someone');
  v_title := case when v_conv.is_group
                  then v_sender || ' in ' || coalesce(v_conv.title, 'Squad chat')
                  else v_sender end;

  for r in
    select cm.profile_id
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.profile_id <> new.sender_id
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = cm.profile_id and b.blocked_id = new.sender_id)
           or (b.blocker_id = new.sender_id and b.blocked_id = cm.profile_id))
  loop
    perform public.gg_notify_message(r.profile_id, new, v_title, v_body);
  end loop;
  return null;
end;
$$;

drop trigger if exists messages_after_insert_notify on public.messages;
create trigger messages_after_insert_notify
  after insert on public.messages
  for each row execute function public.handle_message_notify();

-- Reading a conversation (mark_conversation_read / sending) marks its message
-- notifications read too, so the bell badge never goes stale.
create or replace function public.handle_conversation_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_read_at > old.last_read_at then
    update public.notifications n
       set read_at = now()
     where n.recipient_id = new.profile_id
       and n.type = 'message'
       and n.read_at is null
       and n.data ->> 'conversation_id' = new.conversation_id::text
       and n.created_at <= new.last_read_at;
  end if;
  return null;
end;
$$;

drop trigger if exists conversation_members_after_read on public.conversation_members;
create trigger conversation_members_after_read
  after update of last_read_at on public.conversation_members
  for each row execute function public.handle_conversation_read();

-- ── friendships ─────────────────────────────────────────────────────────────
create or replace function public.handle_friendship_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return null;
    end if;
    select display_name into v_name from public.profiles where id = new.requester_id;
    perform public.gg_notify(
      new.addressee_id, 'friend_request',
      coalesce(v_name, 'A player') || ' sent you a friend request', null,
      public.gg_route('/friends'), new.requester_id,
      jsonb_build_object('friendship_id', new.id));
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    select display_name into v_name from public.profiles where id = new.addressee_id;
    perform public.gg_notify(
      new.requester_id, 'friend_accepted',
      coalesce(v_name, 'A player') || ' accepted your friend request', null,
      public.gg_route('/user/[id]', new.addressee_id), new.addressee_id,
      jsonb_build_object('friendship_id', new.id));
  end if;
  return null;
end;
$$;

drop trigger if exists friendships_after_write_notify on public.friendships;
create trigger friendships_after_write_notify
  after insert or update of status on public.friendships
  for each row execute function public.handle_friendship_notify();

-- ── community_replies insert → post author ──────────────────────────────────
create or replace function public.handle_community_reply_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.community_posts%rowtype;
begin
  select * into v_post from public.community_posts where id = new.post_id;
  if not found then
    return null;
  end if;
  perform public.gg_notify(
    v_post.author_id, 'community_reply',
    'New reply on: ' || v_post.title,
    public.gg_preview(new.body, 140),
    public.gg_route('/community/[id]', v_post.id),
    new.author_id,
    jsonb_build_object('post_id', v_post.id, 'reply_id', new.id));
  return null;
end;
$$;

drop trigger if exists community_replies_after_insert_notify on public.community_replies;
create trigger community_replies_after_insert_notify
  after insert on public.community_replies
  for each row execute function public.handle_community_reply_notify();

-- ── set_solution → reply author: notify + 20 XP (adjusted when changed/cleared) ─
-- Marking your own reply gives nothing. If the solution reply is deleted, the
-- XP it earned stays.
create or replace function public.handle_community_solution_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_author uuid;
  v_new_author uuid;
begin
  if new.solved_reply_id is not distinct from old.solved_reply_id then
    return null;
  end if;

  if old.solved_reply_id is not null then
    select author_id into v_old_author from public.community_replies where id = old.solved_reply_id;
    if v_old_author is not null and v_old_author <> new.author_id then
      perform public.gg_bump_stats(v_old_author, p_xp => -20, p_solutions => -1);
    end if;
  end if;

  if new.solved_reply_id is not null then
    select author_id into v_new_author from public.community_replies where id = new.solved_reply_id;
    if v_new_author is not null and v_new_author <> new.author_id then
      perform public.gg_bump_stats(v_new_author, p_xp => 20, p_solutions => 1);
      perform public.gg_notify(
        v_new_author, 'community_solution',
        'Your answer was marked as the solution',
        new.title,
        public.gg_route('/community/[id]', new.id),
        new.author_id,
        jsonb_build_object('post_id', new.id, 'reply_id', new.solved_reply_id));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists community_posts_after_solution on public.community_posts;
create trigger community_posts_after_solution
  after update of solved_reply_id on public.community_posts
  for each row execute function public.handle_community_solution_change();

-- ── Community GGs → +1 XP each for the author, max 50 per IST day ───────────
create or replace function public.handle_community_gg_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_giver  uuid;
  v_at     timestamptz;
  v_day    date;
  v_ggs    integer;
  v_delta  integer;
begin
  if tg_op = 'INSERT' then
    v_giver := new.profile_id;
    v_at := new.created_at;
    if tg_table_name = 'community_post_ggs' then
      select author_id into v_author from public.community_posts where id = new.post_id;
    else
      select author_id into v_author from public.community_replies where id = new.reply_id;
    end if;
  else
    v_giver := old.profile_id;
    v_at := old.created_at;
    if tg_table_name = 'community_post_ggs' then
      select author_id into v_author from public.community_posts where id = old.post_id;
    else
      select author_id into v_author from public.community_replies where id = old.reply_id;
    end if;
  end if;

  -- Content already gone (cascade) or self-GG: nothing to adjust.
  if v_author is null or v_author = v_giver
     or not exists (select 1 from public.profiles where id = v_author) then
    return null;
  end if;

  v_day := (v_at at time zone 'Asia/Kolkata')::date;
  if tg_op = 'INSERT' then
    insert into public.xp_gg_daily as d (profile_id, day, ggs) values (v_author, v_day, 1)
    on conflict (profile_id, day) do update set ggs = d.ggs + 1
    returning d.ggs into v_ggs;
    v_delta := least(v_ggs, 50) - least(v_ggs - 1, 50);
  else
    update public.xp_gg_daily d set ggs = greatest(d.ggs - 1, 0)
     where d.profile_id = v_author and d.day = v_day
    returning d.ggs into v_ggs;
    if v_ggs is null then
      return null;
    end if;
    v_delta := least(v_ggs, 50) - least(v_ggs + 1, 50);
  end if;

  perform public.gg_bump_stats(v_author, p_xp => v_delta);
  return null;
end;
$$;

drop trigger if exists community_post_ggs_after_xp on public.community_post_ggs;
create trigger community_post_ggs_after_xp
  after insert or delete on public.community_post_ggs
  for each row execute function public.handle_community_gg_xp();

drop trigger if exists community_reply_ggs_after_xp on public.community_reply_ggs;
create trigger community_reply_ggs_after_xp
  after insert or delete on public.community_reply_ggs
  for each row execute function public.handle_community_gg_xp();

-- ── teammate_ratings → XP, counters, ratee notification, toxic auto-report ──
create or replace function public.handle_teammate_rating_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ratee     uuid := coalesce(new.ratee_id, old.ratee_id);
  v_old_xp    integer := 0;
  v_new_xp    integer := 0;
  v_praise    text[];
  v_labels    text;
  v_toxic     integer;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_xp := public.gg_rating_xp(old.tags);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_xp := public.gg_rating_xp(new.tags);
  end if;

  perform public.gg_bump_stats(v_ratee, p_xp => v_new_xp - v_old_xp);
  perform public.gg_refresh_rating_stats(v_ratee);
  if tg_op = 'DELETE' then
    return null;
  end if;

  -- Praise → tell the ratee (rater stays anonymous).
  v_praise := array(select t from unnest(array['good_comms','chill','clutch','shotcaller']) t
                    where t = any (new.tags));
  if cardinality(v_praise) > 0
     and (tg_op = 'INSERT' or old.tags is distinct from new.tags) then
    select string_agg(case t when 'good_comms' then 'Good comms' when 'chill' then 'Chill'
                             when 'clutch' then 'Clutch' else 'Shotcaller' end, ', ')
      into v_labels
    from unnest(v_praise) t;
    perform public.gg_notify(
      v_ratee, 'rating_received',
      'A teammate rated you: ' || v_labels,
      'Keep it up. Good teammates rank higher in squad finder.',
      public.gg_route('/user/[id]', v_ratee),
      new.rater_id,
      jsonb_build_object('post_id', new.lfg_post_id),
      p_show_actor => false);
  end if;

  -- Toxic from 3+ distinct teammates in 30 days → one open auto-report.
  if 'toxic' = any (new.tags) and (tg_op = 'INSERT' or not ('toxic' = any (old.tags))) then
    select count(distinct r.rater_id) into v_toxic
    from public.teammate_ratings r
    where r.ratee_id = v_ratee
      and 'toxic' = any (r.tags)
      and r.created_at > now() - interval '30 days';
    if v_toxic >= 3 and not exists (
         select 1 from public.reports rp
         where rp.target_type = 'profile' and rp.target_id = v_ratee
           and rp.status = 'open' and rp.details like 'Auto:%') then
      insert into public.reports (reporter_id, target_type, target_id, reason, details, status)
      values (new.rater_id, 'profile', v_ratee, 'harassment',
              'Auto: flagged toxic by 3+ teammates in 30 days', 'open');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists teammate_ratings_after_change on public.teammate_ratings;
create trigger teammate_ratings_after_change
  after insert or update or delete on public.teammate_ratings
  for each row execute function public.handle_teammate_rating_change();

revoke all on function public.handle_lfg_request_created()       from public, anon, authenticated;
revoke all on function public.handle_lfg_request_accepted()      from public, anon, authenticated;
revoke all on function public.handle_lfg_post_hosted()           from public, anon, authenticated;
revoke all on function public.handle_message_notify()            from public, anon, authenticated;
revoke all on function public.handle_conversation_read()         from public, anon, authenticated;
revoke all on function public.handle_friendship_notify()         from public, anon, authenticated;
revoke all on function public.handle_community_reply_notify()    from public, anon, authenticated;
revoke all on function public.handle_community_solution_change() from public, anon, authenticated;
revoke all on function public.handle_community_gg_xp()           from public, anon, authenticated;
revoke all on function public.handle_teammate_rating_change()    from public, anon, authenticated;

-- ── Backfill: rebuild player_stats from existing data (service only) ────────
-- Runs automatically the first time this file is applied (player_stats empty).
-- You can run it again any time: select public.rebuild_player_stats();
create or replace function public.rebuild_player_stats()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.xp_gg_daily;
  insert into public.xp_gg_daily (profile_id, day, ggs)
  select g.author_id, g.day, count(*)
  from (
    select p.author_id, (pg.created_at at time zone 'Asia/Kolkata')::date as day
    from public.community_post_ggs pg
    join public.community_posts p on p.id = pg.post_id
    where pg.profile_id <> p.author_id
    union all
    select r.author_id, (rg.created_at at time zone 'Asia/Kolkata')::date
    from public.community_reply_ggs rg
    join public.community_replies r on r.id = rg.reply_id
    where rg.profile_id <> r.author_id
  ) g
  group by g.author_id, g.day;

  delete from public.player_stats;
  insert into public.player_stats
    (profile_id, xp, squads_joined, lobbies_hosted, solutions, ratings_received, positive_ratings,
     good_comms, chill, clutch, shotcaller)
  select pr.id,
         coalesce(rt.xp, 0) + 5 * coalesce(j.n, 0) + 15 * coalesce(h.filled, 0)
           + 20 * coalesce(so.n, 0) + coalesce(gg.xp, 0),
         coalesce(j.n, 0) + coalesce(h.filled, 0),
         coalesce(h.hosted, 0),
         coalesce(so.n, 0),
         coalesce(rt.raters, 0), coalesce(rt.positive, 0),
         coalesce(rt.good_comms, 0), coalesce(rt.chill, 0), coalesce(rt.clutch, 0), coalesce(rt.shotcaller, 0)
  from public.profiles pr
  left join (
    select r.ratee_id,
           sum(public.gg_rating_xp(r.tags))::integer as xp,
           count(distinct r.rater_id) as raters,
           count(distinct r.rater_id) filter (where r.tags && array['good_comms','chill','clutch','shotcaller']) as positive,
           count(*) filter (where 'good_comms' = any (r.tags)) as good_comms,
           count(*) filter (where 'chill' = any (r.tags)) as chill,
           count(*) filter (where 'clutch' = any (r.tags)) as clutch,
           count(*) filter (where 'shotcaller' = any (r.tags)) as shotcaller
    from public.teammate_ratings r group by r.ratee_id
  ) rt on rt.ratee_id = pr.id
  left join (
    select requester_id, count(*) as n from public.lfg_requests
    where status = 'accepted' group by requester_id
  ) j on j.requester_id = pr.id
  left join (
    select p.author_id, count(*) as hosted,
           count(*) filter (where exists (select 1 from public.lfg_requests r
                                          where r.post_id = p.id and r.status = 'accepted')) as filled
    from public.lfg_posts p group by p.author_id
  ) h on h.author_id = pr.id
  left join (
    select r.author_id, count(*) as n
    from public.community_posts p
    join public.community_replies r on r.id = p.solved_reply_id
    where r.author_id <> p.author_id
    group by r.author_id
  ) so on so.author_id = pr.id
  left join (
    select profile_id, sum(least(ggs, 50))::integer as xp from public.xp_gg_daily group by profile_id
  ) gg on gg.profile_id = pr.id;
end;
$$;
revoke all on function public.rebuild_player_stats() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from public.player_stats) then
    perform public.rebuild_player_stats();
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. find_squadmates: + reputation, + score boost for well-rated players
-- Same signature, arguments, filters and shape as 0003; each row also has
--   "reputation": { "level": int, "ratings_received": int, "top_tags": [...] }
-- Score boost: least(15, positive_ratings * 2), total still capped at 100.
-- Unrated players get no boost and no penalty.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.find_squadmates(
  p_game_id     text,
  p_region      text,
  p_language    text,
  p_play_style  text,
  p_limit       integer default 30
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_game_id is null then
    raise exception 'Choose a game' using errcode = '22023';
  end if;

  return query
  with caller as (
    select p.region, p.languages, p.play_style, p.has_mic, p.play_times
    from public.profiles p where p.id = me
  ),
  candidates as (
    select pr, pg,
      coalesce(ps.xp, 0)               as xp,
      coalesce(ps.ratings_received, 0) as ratings_received,
      coalesce(ps.positive_ratings, 0) as positive_ratings,
      public.gg_top_tags(ps.good_comms, ps.chill, ps.clutch, ps.shotcaller) as top_tags,
      coalesce(array(
        select l from unnest(pr.languages) l
        where l = any (coalesce((select c.languages from caller c), '{}'::text[]))
        order by l
      ), '{}'::text[]) as shared,
      (
        case when pr.region = (select c.region from caller c) then 30 else 0 end
        + least(15 * cardinality(array(
            select l from unnest(pr.languages) l
            where l = any (coalesce((select c.languages from caller c), '{}'::text[])))), 30)
        + case when pr.play_style = (select c.play_style from caller c)
                 or 'both' in (pr.play_style, (select c.play_style from caller c))
               then 20 else 0 end
        + 5 * cardinality(array(
            select t from unnest(pr.play_times) t
            where t = any (coalesce((select c.play_times from caller c), '{}'::text[]))))
        + case when pr.has_mic and coalesce((select c.has_mic from caller c), false) then 10 else 0 end
        + least(15, coalesce(ps.positive_ratings, 0) * 2)
      ) as raw_score
    from public.profile_games pg
    join public.profiles pr on pr.id = pg.profile_id
    left join public.player_stats ps on ps.profile_id = pr.id
    where pg.game_id = p_game_id
      and pr.id <> me
      and (p_region is null or pr.region = p_region)
      and (p_language is null or p_language = any (pr.languages))
      and (p_play_style is null or pr.play_style = p_play_style or pr.play_style = 'both')
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me and b.blocked_id = pr.id)
           or (b.blocker_id = pr.id and b.blocked_id = me)
      )
  )
  select jsonb_build_object(
           'profile', to_jsonb(c.pr) - 'banned_until',
           'game', to_jsonb(c.pg),
           'match_score', least(c.raw_score, 100),
           'shared_languages', to_jsonb(c.shared),
           'reputation', jsonb_build_object(
             'level', public.gg_level(c.xp),
             'ratings_received', c.ratings_received,
             'top_tags', c.top_tags)
         )
  from candidates c
  order by least(c.raw_score, 100) desc, (c.pr).created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.count_unread_notifications()              from public, anon;
revoke all on function public.mark_notifications_read(uuid)             from public, anon;
revoke all on function public.rate_teammate(uuid, uuid, text[])         from public, anon;
revoke all on function public.list_rateable_teammates(uuid)             from public, anon;
revoke all on function public.get_player_stats(uuid)                    from public, anon;
revoke all on function public.find_squadmates(text, text, text, text, integer) from public, anon;
revoke all on function public.gg_route(text, uuid)                      from public, anon;
revoke all on function public.gg_preview(text, integer)                 from public, anon;

grant execute on function public.count_unread_notifications()              to authenticated;
grant execute on function public.mark_notifications_read(uuid)             to authenticated;
grant execute on function public.rate_teammate(uuid, uuid, text[])         to authenticated;
grant execute on function public.list_rateable_teammates(uuid)             to authenticated;
grant execute on function public.get_player_stats(uuid)                    to authenticated;
grant execute on function public.find_squadmates(text, text, text, text, integer) to authenticated;

-- ── Realtime: the bell updates live (RLS still applies) ─────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
