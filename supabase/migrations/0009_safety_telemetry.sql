-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0009 – safety + telemetry (docs/PHASE2.md §3–4, types.ts "Phase 2").
--
--   • moderators            – who can use the Moderation screen. Owner adds rows in the SQL editor.
--   • profiles.banned_until – banned players can read but not post, message, host, reply,
--                             add friends or rate (restrictive RLS policies below).
--   • gg_clean_text()       – masks abuse/slurs (English + Hindi/Hinglish) in user text.
--   • list_reports / resolve_report / unban_user / get_beta_metrics – moderators only.
--   • app_events            – product events (client: app_open, theme_changed, onboarding_completed;
--                             the server logs the rest itself).
--   • app_errors            – crash reports, insert-only for clients (signed in or not).
--
-- Requires 0008. Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Moderators + bans
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.moderators (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.moderators enable row level security;
revoke all on table public.moderators from anon, authenticated;
grant all on table public.moderators to service_role;
-- No client policies: only the owner (SQL editor / dashboard) adds moderators.

alter table public.profiles add column if not exists banned_until timestamptz;

-- Users must never set banned_until: replace the table-wide INSERT grant with a
-- column list (the UPDATE grant in 0002 is already a column list without it).
revoke insert on public.profiles from authenticated;
grant insert (id, username, display_name, avatar_url, bio, region, languages, play_style,
              has_mic, play_times) on public.profiles to authenticated;

-- Both helpers only answer about the caller (or for server code with no JWT),
-- so they cannot be used to probe other players.
create or replace function public.is_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null
     and (auth.uid() is null or auth.uid() = uid)
     and exists (select 1 from public.moderators m where m.profile_id = uid);
$$;

create or replace function public.is_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null
     and (auth.uid() is null or auth.uid() = uid)
     and exists (select 1 from public.profiles p where p.id = uid and p.banned_until > now());
$$;

revoke all on function public.is_moderator(uuid) from public, anon;
revoke all on function public.is_banned(uuid)    from public, anon;
grant execute on function public.is_moderator(uuid) to authenticated;
grant execute on function public.is_banned(uuid)    to authenticated;

-- ── Banned players cannot create content (RESTRICTIVE = ANDed with the existing policies) ─
do $$
declare
  t text;
begin
  foreach t in array array['messages','lfg_posts','lfg_requests','community_posts',
                           'community_replies','friendships','teammate_ratings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_not_banned', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated '
      'with check (not public.is_banned(auth.uid()))', t || '_insert_not_banned', t);
  end loop;
end;
$$;

-- Ratings are written by the rate_teammate RPC (SECURITY DEFINER bypasses RLS),
-- so they also get a trigger guard.
create or replace function public.handle_rating_ban_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.rater_id and p.banned_until > now()) then
    raise exception 'Your account is paused' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.handle_rating_ban_guard() from public, anon, authenticated;

drop trigger if exists teammate_ratings_before_write_ban on public.teammate_ratings;
create trigger teammate_ratings_before_write_ban
  before insert or update on public.teammate_ratings
  for each row execute function public.handle_rating_ban_guard();

-- ── get_my_status() → { banned_until, is_moderator } ─────────────────────────
create or replace function public.get_my_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  v_until timestamptz;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select p.banned_until into v_until from public.profiles p where p.id = me;
  return jsonb_build_object(
    'banned_until', case when v_until > now() then v_until end,
    'is_moderator', exists (select 1 from public.moderators m where m.profile_id = me)
  );
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Profanity filter
-- Whole words only, case-insensitive, light leetspeak (@ 4→a, $ 5→s, 0→o, 1→i, 3→e),
-- stretched letters ("fuuuck") and plurals. "class", "assassin", "Scunthorpe",
-- "Essex" are left alone. Masked as first letter + asterisks ("f***").
-- To add a word:  insert into public.gg_blocked_words (word) values ('newword');
-- (lowercase, plain letters; leetspeak/plural forms are handled automatically).
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.gg_blocked_words (
  word text primary key check (word = lower(word) and char_length(word) between 2 and 40)
);
alter table public.gg_blocked_words enable row level security;
revoke all on table public.gg_blocked_words from anon, authenticated;
grant all on table public.gg_blocked_words to service_role;

insert into public.gg_blocked_words (word)
select distinct normalize(lower(w), NFC)
from unnest(array[
  -- English profanity
  'fuck','fucks','fucked','fucker','fuckers','fuckin','fucking','fuckhead','fuckface','fuckoff',
  'motherfucker','motherfuckers','motherfucking','fck','fcking','fuk','fuking','fukin','fuq','phuck',
  'stfu','gtfo','shit','shitty','shithead','bullshit','bitch','bitches','bitchy','biatch',
  'bastard','cunt','dick','dickhead','cock','cocksucker','pussy','pussies','asshole','arsehole',
  'ass','arse','dumbass','jackass','wanker','twat','slut','whore','prick','douche','douchebag',
  'kys','retard','retarded',
  -- English slurs
  'nigger','nigga','faggot','fag','tranny','chink','gook','kike','spic','wetback','paki','dyke','coon',
  -- Hindi / Hinglish abuses (romanised)
  'madarchod','maderchod','madarchodd','behenchod','behanchod','bhenchod','benchod','bhanchod','betichod',
  'chutiya','chutiye','chutiyapa','chootiya','chutia','chut','choot','bhosdike','bhosdi','bhosdiwale',
  'bhosda','bhosadi','bhosadike','bsdk','gandu','gaandu','gand','gaand','randi','randwa','raand',
  'harami','haramkhor','haramzada','haramzade','lauda','laude','lavda','lavde','lawda','lawde','lund',
  'loda','lodu','chodu','chod','jhatu','jhaatu','jhaant','bhadwa','bhadwe','bhadve','chinal','kutiya',
  'bkl','mkc','tmkc',
  -- Indian slurs (caste / region / religion)
  'chamar','bhangi','katua','katwa','chinki',
  -- Devanagari
  'मादरचोद','भेनचोद','बहनचोद','चूतिया','चुतिया','भोसड़ीके','भोसडीके','भोसड़ी','गांडू','गाँडू','रंडी',
  'हरामी','हरामज़ादा','हरामजादा','लौड़ा','लोड़ा','लंड','कुतिया'
]) w
on conflict (word) do nothing;

-- Set-based (one pass, no per-word function calls): ~6 ms for a 2000-char message.
create or replace function public.gg_clean_text(p_text text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p_text is null or p_text = '' then p_text else (
    -- Split into alternating word / non-word chunks; joining them gives the original back.
    with tok as (
      select t.m[1] as w, t.m[2] as sep, t.ord,
             translate(lower(normalize(t.m[1], NFC)), '@4$5013', 'aassoie') as n
      from regexp_matches(p_text, '([[:alnum:]@$ऀ-ॿ]+)|([^[:alnum:]@$ऀ-ॿ]+)', 'g')
           with ordinality as t (m, ord)
    )
    select string_agg(
      case when tok.w is null then tok.sep
           when char_length(tok.w) >= 2 and tok.w !~ '^[0-9]+$' and exists (
             select 1 from public.gg_blocked_words b
             where b.word = any (array[
               tok.n,
               regexp_replace(tok.n, '(.)\1{2,}', '\1', 'g'),                      -- fuuuck → fuck
               regexp_replace(tok.n, '(.)\1{2,}', '\1\1', 'g'),                    -- asssss → ass
               case when char_length(tok.n) > 3 and tok.n like '%s'  then left(tok.n, -1) end,  -- dicks → dick
               case when char_length(tok.n) > 4 and tok.n like '%es' then left(tok.n, -2) end]))  -- asses → ass
             then left(tok.w, 1) || repeat('*', char_length(tok.w) - 1)
           else tok.w end,
      '' order by tok.ord)
    from tok) end;
$$;

drop function if exists public.gg_is_blocked_word(text);
revoke all on function public.gg_clean_text(text) from public, anon;
grant execute on function public.gg_clean_text(text) to authenticated;

create or replace function public.handle_mask_profanity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case tg_table_name
    when 'messages' then
      new.body := public.gg_clean_text(new.body);
    when 'lfg_posts' then
      new.title := public.gg_clean_text(new.title);
      new.description := public.gg_clean_text(new.description);
    when 'lfg_requests' then
      new.message := public.gg_clean_text(new.message);
    when 'community_posts' then
      new.title := public.gg_clean_text(new.title);
      new.body := public.gg_clean_text(new.body);
    when 'community_replies' then
      new.body := public.gg_clean_text(new.body);
    when 'profiles' then
      new.display_name := public.gg_clean_text(new.display_name);
      new.bio := public.gg_clean_text(new.bio);
    else
      null;
  end case;
  return new;
end;
$$;
revoke all on function public.handle_mask_profanity() from public, anon, authenticated;

drop trigger if exists messages_before_write_mask on public.messages;
create trigger messages_before_write_mask
  before insert or update of body on public.messages
  for each row execute function public.handle_mask_profanity();

drop trigger if exists lfg_posts_before_write_mask on public.lfg_posts;
create trigger lfg_posts_before_write_mask
  before insert or update of title, description on public.lfg_posts
  for each row execute function public.handle_mask_profanity();

drop trigger if exists lfg_requests_before_write_mask on public.lfg_requests;
create trigger lfg_requests_before_write_mask
  before insert or update of message on public.lfg_requests
  for each row execute function public.handle_mask_profanity();

drop trigger if exists community_posts_before_write_mask on public.community_posts;
create trigger community_posts_before_write_mask
  before insert or update of title, body on public.community_posts
  for each row execute function public.handle_mask_profanity();

drop trigger if exists community_replies_before_write_mask on public.community_replies;
create trigger community_replies_before_write_mask
  before insert or update of body on public.community_replies
  for each row execute function public.handle_mask_profanity();

drop trigger if exists profiles_before_write_mask on public.profiles;
create trigger profiles_before_write_mask
  before insert or update of display_name, bio on public.profiles
  for each row execute function public.handle_mask_profanity();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Report queue
-- reports.target_user_id = the reported person, filled by the server when the
-- report is filed, so it survives the content being removed. Users cannot set it.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.reports
  add column if not exists target_user_id uuid references public.profiles (id) on delete set null;
create index if not exists reports_target_user_status_idx on public.reports (target_user_id, status);

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
  end;
$$;
revoke all on function public.gg_report_target_user(text, uuid) from public, anon, authenticated;

create or replace function public.handle_report_target_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.target_user_id := public.gg_report_target_user(new.target_type, new.target_id);
  return new;
end;
$$;
revoke all on function public.handle_report_target_user() from public, anon, authenticated;

drop trigger if exists reports_before_insert_target on public.reports;
create trigger reports_before_insert_target
  before insert on public.reports
  for each row execute function public.handle_report_target_user();

update public.reports r
   set target_user_id = public.gg_report_target_user(r.target_type, r.target_id)
 where r.target_user_id is null;

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
  end, 200);
$$;
revoke all on function public.gg_report_preview(text, uuid) from public, anon, authenticated;

create or replace function public.gg_require_moderator()
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
    -- No JWT at all = SQL Editor / server code (API requests always carry claims,
    -- and anon has no EXECUTE on the moderator RPCs). Allowed, with no actor.
    if coalesce(current_setting('request.jwt.claims', true), '') = ''
       and coalesce(current_setting('request.jwt.claim.role', true), '') = ''
       and coalesce(current_setting('request.jwt.claim.sub', true), '') = '' then
      return null;
    end if;
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.moderators m where m.profile_id = me) then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  return me;
end;
$$;
revoke all on function public.gg_require_moderator() from public, anon, authenticated;

create or replace function public.gg_reason_label(p_reason text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_reason
    when 'harassment'    then 'Harassment or bullying'
    when 'hate'          then 'Hate speech'
    when 'cheating'      then 'Cheating or selling hacks'
    when 'spam'          then 'Spam'
    when 'scam'          then 'Scam or fraud'
    when 'inappropriate' then 'Sexual or inappropriate content'
    else 'Something else' end;
$$;
revoke all on function public.gg_reason_label(text) from public, anon;

-- ── list_reports(p_status, p_limit, p_offset) → setof jsonb (ReportQueueItem) ─
create or replace function public.list_reports(
  p_status  text,
  p_limit   integer default 50,
  p_offset  integer default 0
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(p_status, 'open');
begin
  perform public.gg_require_moderator();
  if v_status not in ('open','reviewed','actioned') then
    raise exception 'Unknown status: %', v_status using errcode = '22023';
  end if;

  return query
  select jsonb_build_object(
           'report', to_jsonb(r) - 'target_user_id',
           'reporter', jsonb_build_object('id', rp.id, 'username', rp.username,
                                          'display_name', rp.display_name),
           'target_user', case when tu.id is null then null else
                            jsonb_build_object('id', tu.id, 'username', tu.username,
                                               'display_name', tu.display_name,
                                               'avatar_url', tu.avatar_url) end,
           'target_preview', public.gg_report_preview(r.target_type, r.target_id),
           'open_reports_against_user', coalesce((
              select count(*)::integer from public.reports o
              where o.status = 'open' and o.target_user_id = tu.id), 0),
           'toxic_flags_30d', coalesce((
              select count(distinct t.rater_id)::integer from public.teammate_ratings t
              where t.ratee_id = tu.id and 'toxic' = any (t.tags)
                and t.created_at > now() - interval '30 days'), 0)
         )
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tu
    on tu.id = coalesce(r.target_user_id, public.gg_report_target_user(r.target_type, r.target_id))
  where r.status = v_status
  order by r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ── resolve_report(p_report_id, p_action, p_ban_days) → void ────────────────
--   dismiss        → report 'reviewed'
--   remove_content → deletes the reported row (profile: clears bio + avatar_url),
--                    notifies the author, report(s) on that content 'actioned'
--   ban_user       → banned_until = now() + p_ban_days (1–365), notifies, 'actioned'
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
    end case;

    update public.reports set status = 'actioned'
     where id = v_rep.id
        or (status = 'open' and target_type = v_rep.target_type and target_id = v_rep.target_id);

    if v_done then
      perform public.gg_notify(
        v_target, 'moderation', v_what,
        'Reason: ' || public.gg_reason_label(v_rep.reason) || '. Please keep GG friendly.',
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

-- ── unban_user(p_profile_id) → void ─────────────────────────────────────────
create or replace function public.unban_user(p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := public.gg_require_moderator();
  v_was  timestamptz;
begin
  select banned_until into v_was from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  update public.profiles set banned_until = null where id = p_profile_id;
  if v_was > now() then
    perform public.gg_notify(
      p_profile_id, 'moderation', 'Your account is active again',
      'Welcome back. Please keep GG friendly.',
      public.gg_route('/notifications'), me,
      jsonb_build_object('action', 'unban'),
      p_show_actor => false, p_respect_blocks => false);
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Telemetry
-- ═════════════════════════════════════════════════════════════════════════════

-- profile_id references auth.users (not profiles) so app_open works before
-- onboarding; deleting an account keeps the anonymous counts (set null).
create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  profile_id  uuid default auth.uid() references auth.users (id) on delete set null,
  name        text not null check (name in (
                'app_open','theme_changed','onboarding_completed',
                'signup','lobby_created','join_requested','squad_formed','message_sent',
                'community_post','community_reply','rating_given')),
  props       jsonb not null default '{}'::jsonb
              check (jsonb_typeof(props) = 'object' and char_length(props::text) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists app_events_created_idx         on public.app_events (created_at);
create index if not exists app_events_profile_created_idx on public.app_events (profile_id, created_at);
create index if not exists app_events_name_created_idx    on public.app_events (name, created_at);

create table if not exists public.app_errors (
  id           bigint generated always as identity primary key,
  profile_id   uuid default auth.uid() references auth.users (id) on delete set null,
  message      text not null check (char_length(btrim(message)) >= 1 and char_length(message) <= 500),
  stack        text check (stack is null or char_length(stack) <= 4000),
  context      jsonb check (context is null
                            or (jsonb_typeof(context) = 'object' and char_length(context::text) <= 4000)),
  app_version  text check (app_version is null or char_length(app_version) <= 40),
  platform     text not null check (platform in ('ios','android','web')),
  is_fatal     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_events enable row level security;
alter table public.app_errors enable row level security;
revoke all on table public.app_events, public.app_errors from anon, authenticated;

-- Insert only. No SELECT for clients: insert without .select().
grant insert (profile_id, name, props) on public.app_events to authenticated;
grant insert (profile_id, message, stack, context, app_version, platform, is_fatal)
  on public.app_errors to anon, authenticated;
grant all on table public.app_events, public.app_errors to service_role;

drop policy if exists app_events_insert_own on public.app_events;
create policy app_events_insert_own on public.app_events
  for insert to authenticated
  with check (profile_id = auth.uid()
              and name in ('app_open','theme_changed','onboarding_completed'));

drop policy if exists app_errors_insert on public.app_errors;
create policy app_errors_insert on public.app_errors
  for insert to anon, authenticated
  with check (profile_id is null or profile_id = auth.uid());

-- ── Server events ───────────────────────────────────────────────────────────
create or replace function public.gg_log_event(p_profile uuid, p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.app_events (profile_id, name, props)
  values (p_profile, p_name, coalesce(p_props, '{}'::jsonb));
exception when others then
  raise log 'gg_log_event skipped (%): %', p_name, sqlerrm; -- telemetry never breaks a write
end;
$$;
revoke all on function public.gg_log_event(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.handle_server_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case tg_table_name
    when 'profiles' then
      perform public.gg_log_event(new.id, 'signup', jsonb_build_object('region', new.region));
    when 'lfg_posts' then
      perform public.gg_log_event(new.author_id, 'lobby_created',
        jsonb_build_object('game_id', new.game_id, 'slots_needed', new.slots_needed));
    when 'lfg_requests' then
      if tg_op = 'INSERT' then
        perform public.gg_log_event(new.requester_id, 'join_requested', jsonb_build_object('post_id', new.post_id));
      elsif new.status = 'accepted' and old.status <> 'accepted' then
        perform public.gg_log_event(new.requester_id, 'squad_formed', jsonb_build_object('post_id', new.post_id));
      end if;
    when 'messages' then
      perform public.gg_log_event(new.sender_id, 'message_sent',
        jsonb_build_object('is_group', (select c.is_group from public.conversations c where c.id = new.conversation_id)));
    when 'community_posts' then
      perform public.gg_log_event(new.author_id, 'community_post',
        jsonb_build_object('kind', new.kind, 'game_id', new.game_id));
    when 'community_replies' then
      perform public.gg_log_event(new.author_id, 'community_reply', jsonb_build_object('post_id', new.post_id));
    when 'teammate_ratings' then
      perform public.gg_log_event(new.rater_id, 'rating_given',
        jsonb_build_object('positive', not ('toxic' = any (new.tags))));
    else
      null;
  end case;
  return null;
end;
$$;
revoke all on function public.handle_server_event() from public, anon, authenticated;

drop trigger if exists profiles_after_insert_event on public.profiles;
create trigger profiles_after_insert_event
  after insert on public.profiles
  for each row execute function public.handle_server_event();

drop trigger if exists lfg_posts_after_insert_event on public.lfg_posts;
create trigger lfg_posts_after_insert_event
  after insert on public.lfg_posts
  for each row execute function public.handle_server_event();

drop trigger if exists lfg_requests_after_write_event on public.lfg_requests;
create trigger lfg_requests_after_write_event
  after insert or update of status on public.lfg_requests
  for each row execute function public.handle_server_event();

drop trigger if exists messages_after_insert_event on public.messages;
create trigger messages_after_insert_event
  after insert on public.messages
  for each row execute function public.handle_server_event();

drop trigger if exists community_posts_after_insert_event on public.community_posts;
create trigger community_posts_after_insert_event
  after insert on public.community_posts
  for each row execute function public.handle_server_event();

drop trigger if exists community_replies_after_insert_event on public.community_replies;
create trigger community_replies_after_insert_event
  after insert on public.community_replies
  for each row execute function public.handle_server_event();

drop trigger if exists teammate_ratings_after_insert_event on public.teammate_ratings;
create trigger teammate_ratings_after_insert_event
  after insert on public.teammate_ratings
  for each row execute function public.handle_server_event();

-- ── get_beta_metrics(p_days) → BetaMetrics (moderators only) ────────────────
-- Days are IST calendar days; the window is the last p_days days including today.
-- Activity counts come from app_events (so deleted content still counts).
create or replace function public.get_beta_metrics(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 14), 90));
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from  date;
  v_start timestamptz;
  v_out   jsonb;
begin
  perform public.gg_require_moderator();
  v_from  := v_today - (v_days - 1);
  v_start := v_from::timestamp at time zone 'Asia/Kolkata';

  with ev as (
    select e.profile_id, e.name, (e.created_at at time zone 'Asia/Kolkata')::date as day
    from public.app_events e
    where e.created_at >= v_start
  ),
  cohort as (
    select p.id, (p.created_at at time zone 'Asia/Kolkata')::date as day
    from public.profiles p
    where p.created_at >= v_start
  ),
  ret as (
    select
      count(*) filter (where c.day <= v_today - 1) as d1_total,
      count(*) filter (where c.day <= v_today - 1 and exists (
        select 1 from ev where ev.profile_id = c.id and ev.day = c.day + 1)) as d1_back,
      count(*) filter (where c.day <= v_today - 7) as d7_total,
      count(*) filter (where c.day <= v_today - 7 and exists (
        select 1 from ev where ev.profile_id = c.id and ev.day = c.day + 7)) as d7_back
    from cohort c
  )
  select jsonb_build_object(
    'days',            v_days,
    'total_players',   (select count(*) from public.profiles),
    'new_players',     (select count(*) from cohort),
    'daily_active',    (select coalesce(jsonb_agg(jsonb_build_object(
                                 'day', to_char(d.day, 'YYYY-MM-DD'),
                                 'players', (select count(distinct ev.profile_id) from ev
                                             where ev.day = d.day and ev.profile_id is not null))
                               order by d.day), '[]'::jsonb)
                        from (select generate_series(v_from, v_today, interval '1 day')::date as day) d),
    'lobbies_created', (select count(*) from ev where ev.name = 'lobby_created'),
    'join_requests',   (select count(*) from ev where ev.name = 'join_requested'),
    'squads_formed',   (select count(*) from ev where ev.name = 'squad_formed'),
    'messages_sent',   (select count(*) from ev where ev.name = 'message_sent'),
    'community_posts', (select count(*) from ev where ev.name = 'community_post'),
    'ratings_given',   (select count(*) from ev where ev.name = 'rating_given'),
    'day1_retention',  (select case when r.d1_total = 0 then null
                                    else round(r.d1_back::numeric / r.d1_total, 4) end from ret r),
    'day7_retention',  (select case when r.d7_total = 0 then null
                                    else round(r.d7_back::numeric / r.d7_total, 4) end from ret r),
    'errors_last_24h', (select count(*) from public.app_errors x where x.created_at > now() - interval '24 hours')
  ) into v_out;
  return v_out;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.get_my_status()                       from public, anon;
revoke all on function public.list_reports(text, integer, integer)  from public, anon;
revoke all on function public.resolve_report(uuid, text, integer)   from public, anon;
revoke all on function public.unban_user(uuid)                      from public, anon;
revoke all on function public.get_beta_metrics(integer)             from public, anon;

grant execute on function public.get_my_status()                       to authenticated;
grant execute on function public.list_reports(text, integer, integer)  to authenticated;
grant execute on function public.resolve_report(uuid, text, integer)   to authenticated;
grant execute on function public.unban_user(uuid)                      to authenticated;
grant execute on function public.get_beta_metrics(integer)             to authenticated;
