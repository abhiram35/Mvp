-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0011 – fixes from the review of 0010 (docs/REVIEW_FIXES.md §1, §3, §4).
--
--   • Steam linking is a 2-step flow: steam_link_requests gets steam_id,
--     completion_code and verified_at (the app "completes" the link with the code).
--   • In-game IDs and Steam accounts are visible only to: yourself, accepted friends,
--     members of a squad (group) chat you are in, and DMs where THEY have sent you a
--     message. Never across a block. Opening an empty DM is no longer enough.
--   • save_profile_games(p_games): saves a player's games + in-game IDs in one go.
--   • Steam names are profanity-masked; Steam links must be real https links.
--   • In-game IDs: max 64 characters, no control characters; updated_at is server-set.
--   • Squad Finder returns nobody for single-player story games.
--   • Community search never matches the hidden body of a spoiler post.
--   • Genshin Impact moves to "Co-op & Casual" (first run only).
--
-- Requires 0010. Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. Genshin Impact → "Co-op & Casual"
-- Only on the first run of this file (save_profile_games doesn't exist yet) and only if
-- it is still 'story', so a re-run never undoes a change you made to games yourself.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.save_profile_games(jsonb)') is null then
    update public.games set category = 'casual'
     where id = 'genshin_impact' and category = 'story';
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Steam link requests: 2-step flow
-- ═════════════════════════════════════════════════════════════════════════════
-- Every schema change in this file is guarded by a catalog check, so a re-run takes no
-- table locks ("add column if not exists" locks the table even when the column exists).
do $$
declare
  c text[];
begin
  -- steam_id: the verified SteamID64; completion_code: one-time code the app sends to
  -- "complete"; verified_at: when Steam's assertion was verified.
  foreach c slice 1 in array array[['steam_id','text'], ['completion_code','uuid'],
                                   ['verified_at','timestamptz']] loop
    if not exists (select 1 from pg_attribute
                   where attrelid = 'public.steam_link_requests'::regclass
                     and attname = c[1] and not attisdropped) then
      execute format('alter table public.steam_link_requests add column %I %s', c[1], c[2]);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.steam_link_requests'::regclass
                   and conname = 'steam_link_requests_steam_id_check') then
    alter table public.steam_link_requests add constraint steam_link_requests_steam_id_check
      check (steam_id ~ '^[0-9]{17}$');  -- ASCII digits only (\d can match other scripts' digits)
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.steam_link_requests'::regclass
                   and conname = 'steam_link_requests_completion_code_key') then
    alter table public.steam_link_requests add constraint steam_link_requests_completion_code_key
      unique (completion_code);
  end if;
  if to_regclass('public.steam_link_requests_profile_id_idx') is null then
    create index steam_link_requests_profile_id_idx on public.steam_link_requests (profile_id);
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Who can see in-game IDs and Steam accounts
-- Yourself; or, when neither of you blocked the other: accepted friends, people in a
-- squad (group) chat with you, or a DM in which THEY have sent at least one message.
-- (A DM anyone can open with get_or_create_dm is not enough on its own.)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.gg_can_see_game_ids(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and p_target is not null and (
    p_target = auth.uid()
    or (
      not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_target)
           or (b.blocker_id = p_target and b.blocked_id = auth.uid())
      )
      and (
        exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = auth.uid() and f.addressee_id = p_target)
              or (f.requester_id = p_target and f.addressee_id = auth.uid()))
        )
        or exists (
          select 1
          from public.conversation_members a
          join public.conversation_members b
            on b.conversation_id = a.conversation_id and b.profile_id = p_target
          join public.conversations c on c.id = a.conversation_id
          where a.profile_id = auth.uid()
            and (
              c.is_group
              or exists (select 1 from public.messages m
                         where m.conversation_id = c.id and m.sender_id = p_target)
            )
        )
      )
    )
  );
$$;
revoke all on function public.gg_can_see_game_ids(uuid) from public, anon;
grant execute on function public.gg_can_see_game_ids(uuid) to authenticated;

-- Replaces 0010's "everyone except blocked" rule (skipped when already replaced).
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'steam_accounts'
                   and policyname = 'steam_accounts_select'
                   and qual like '%gg_can_see_game_ids(profile_id)%') then
    drop policy if exists steam_accounts_select on public.steam_accounts;
    create policy steam_accounts_select on public.steam_accounts
      for select to authenticated using (
        profile_id = auth.uid() or public.gg_can_see_game_ids(profile_id)
      );
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. In-game IDs: format, privileges, updated_at
-- ═════════════════════════════════════════════════════════════════════════════
-- Clean old rows first: trim spaces, then drop IDs that are still too long or contain
-- control characters (the player simply re-enters them).
update public.profile_game_ids
   set in_game_id = btrim(in_game_id)
 where in_game_id <> btrim(in_game_id)
   and char_length(btrim(in_game_id)) between 1 and 64;
delete from public.profile_game_ids
 where char_length(in_game_id) > 64
    or in_game_id ~ '[\u0001-\u001f\u007f-\u009f]';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.profile_game_ids'::regclass
                   and conname = 'profile_game_ids_in_game_id_format') then
    alter table public.profile_game_ids add constraint profile_game_ids_in_game_id_format
      check (char_length(in_game_id) <= 64 and in_game_id !~ '[\u0001-\u001f\u007f-\u009f]')
      not valid;
  end if;
end;
$$;
-- Validate once (a re-run doesn't scan or lock the table again).
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.profile_game_ids'::regclass
               and conname = 'profile_game_ids_in_game_id_format' and not convalidated) then
    alter table public.profile_game_ids validate constraint profile_game_ids_in_game_id_format;
  end if;
end;
$$;

-- Users may only write these columns (updated_at is set by the server).
revoke all on table public.profile_game_ids from anon, authenticated;
grant select, delete on public.profile_game_ids to authenticated;
grant insert (profile_id, game_id, in_game_id) on public.profile_game_ids to authenticated;
grant update (in_game_id) on public.profile_game_ids to authenticated;

create or replace function public.handle_profile_game_id_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.handle_profile_game_id_updated() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profile_game_ids'::regclass
                 and tgname = 'profile_game_ids_before_update' and not tgisinternal) then
    create trigger profile_game_ids_before_update
      before update on public.profile_game_ids
      for each row execute function public.handle_profile_game_id_updated();
  end if;
  if to_regclass('public.profile_game_ids_game_id_idx') is null then
    create index profile_game_ids_game_id_idx on public.profile_game_ids (game_id);
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Steam accounts: safe links, masked names, service role
-- ═════════════════════════════════════════════════════════════════════════════
update public.steam_accounts set profile_url = null
 where profile_url is not null and profile_url !~ '^https://steamcommunity\.com/';
update public.steam_accounts set avatar_url = null
 where avatar_url is not null and avatar_url !~ '^https://';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.steam_accounts'::regclass
                   and conname = 'steam_accounts_profile_url_format') then
    alter table public.steam_accounts add constraint steam_accounts_profile_url_format
      check (profile_url is null or profile_url ~ '^https://steamcommunity\.com/') not valid;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.steam_accounts'::regclass
                   and conname = 'steam_accounts_avatar_url_format') then
    alter table public.steam_accounts add constraint steam_accounts_avatar_url_format
      check (avatar_url is null or avatar_url ~ '^https://') not valid;
  end if;
end;
$$;
do $$
declare
  c text;
begin
  foreach c in array array['steam_accounts_profile_url_format','steam_accounts_avatar_url_format'] loop
    if exists (select 1 from pg_constraint
               where conrelid = 'public.steam_accounts'::regclass and conname = c and not convalidated) then
      execute format('alter table public.steam_accounts validate constraint %I', c);
    end if;
  end loop;
end;
$$;

-- Steam display names go through the same profanity filter as everything else.
create or replace function public.handle_steam_persona_mask()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.persona_name := public.gg_clean_text(new.persona_name);
  return new;
end;
$$;
revoke all on function public.handle_steam_persona_mask() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.steam_accounts'::regclass
                 and tgname = 'steam_accounts_before_write_mask' and not tgisinternal) then
    create trigger steam_accounts_before_write_mask
      before insert or update of persona_name on public.steam_accounts
      for each row execute function public.handle_steam_persona_mask();
  end if;
end;
$$;

-- Mask names that were stored before this filter existed.
update public.steam_accounts set persona_name = persona_name
 where persona_name is distinct from public.gg_clean_text(persona_name);

-- The steam-link Edge Function uses the service role.
grant all on table public.steam_accounts      to service_role;
grant all on table public.steam_link_requests to service_role;
grant all on table public.profile_game_ids    to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. save_profile_games(p_games jsonb) → void
-- Replaces the caller's games and in-game IDs in one transaction.
-- p_games: [{ game_id, rank, role, play_status, in_game_id }, …] (at most 30)
--   rank / role / play_status: null (or '') = none
--   in_game_id: null or missing = keep the saved one, '' = remove it, text = set it
-- Invalid input raises an error (code 22023) and nothing is changed.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.save_profile_games(p_games jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me         uuid := auth.uid();
  v_item     jsonb;
  v_val      jsonb;
  v_game     text;
  v_text     text;
  v_games    text[] := '{}';
  v_ranks    text[] := '{}';
  v_roles    text[] := '{}';
  v_statuses text[] := '{}';
  v_set_g    text[] := '{}';
  v_set_id   text[] := '{}';
  v_remove   text[] := '{}';
  k          text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'Finish setting up your profile first' using errcode = '42501';
  end if;
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    raise exception 'Games must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_games) > 30 then
    raise exception 'You can add at most 30 games' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_games) e loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'game_id') is distinct from 'string' then
      raise exception 'Each game needs a game_id' using errcode = '22023';
    end if;
    v_game := v_item ->> 'game_id';
    if not exists (select 1 from public.games g where g.id = v_game) then
      raise exception 'Unknown game: %', left(v_game, 40) using errcode = '22023';
    end if;
    if v_game = any (v_games) then
      raise exception 'Game listed twice: %', v_game using errcode = '22023';
    end if;

    -- rank / role / play_status: null or text ('' means none)
    foreach k in array array['rank','role','play_status'] loop
      v_val := v_item -> k;
      if v_val is not null and jsonb_typeof(v_val) not in ('null','string') then
        raise exception '% must be text', k using errcode = '22023';
      end if;
    end loop;

    v_text := nullif(btrim(v_item ->> 'rank'), '');
    if char_length(v_text) > 40 then
      raise exception 'Rank must be 40 characters or less' using errcode = '22023';
    end if;
    v_ranks := v_ranks || v_text;

    v_text := nullif(btrim(v_item ->> 'role'), '');
    if char_length(v_text) > 40 then
      raise exception 'Role must be 40 characters or less' using errcode = '22023';
    end if;
    v_roles := v_roles || v_text;

    v_text := nullif(btrim(v_item ->> 'play_status'), '');
    if v_text is not null and v_text not in ('playing','finished') then
      raise exception 'Unknown play status: %', left(v_text, 20) using errcode = '22023';
    end if;
    v_statuses := v_statuses || v_text;

    v_games := v_games || v_game;

    -- in_game_id: missing / null = keep, '' = remove, text = set
    v_val := v_item -> 'in_game_id';
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      null; -- keep
    elsif jsonb_typeof(v_val) <> 'string' then
      raise exception 'in_game_id must be text' using errcode = '22023';
    else
      v_text := btrim(v_item ->> 'in_game_id');
      if v_text = '' then
        v_remove := v_remove || v_game;
      elsif char_length(v_text) > 64 then
        raise exception 'In-game ID must be 64 characters or less' using errcode = '22023';
      elsif v_text ~ '[\u0001-\u001f\u007f-\u009f]' then
        raise exception 'In-game ID can''t contain line breaks or control characters' using errcode = '22023';
      else
        v_set_g  := v_set_g  || v_game;
        v_set_id := v_set_id || v_text;
      end if;
    end if;
  end loop;

  -- One save at a time per player.
  perform pg_advisory_xact_lock(hashtextextended('save_profile_games:' || me::text, 0));

  -- Games first (in-game IDs reference them).
  insert into public.profile_games as pg (profile_id, game_id, rank, role, play_status)
  select me, t.g, t.r, t.ro, t.s
  from unnest(v_games, v_ranks, v_roles, v_statuses) as t (g, r, ro, s)
  on conflict (profile_id, game_id) do update
    set rank = excluded.rank, role = excluded.role, play_status = excluded.play_status
    where (pg.rank, pg.role, pg.play_status)
          is distinct from (excluded.rank, excluded.role, excluded.play_status);

  -- Games no longer in the list (their in-game IDs go with them).
  delete from public.profile_games
  where profile_id = me and game_id <> all (v_games);

  delete from public.profile_game_ids
  where profile_id = me and game_id = any (v_remove);

  insert into public.profile_game_ids as gi (profile_id, game_id, in_game_id)
  select me, t.g, t.i
  from unnest(v_set_g, v_set_id) as t (g, i)
  on conflict (profile_id, game_id) do update
    set in_game_id = excluded.in_game_id
    where gi.in_game_id is distinct from excluded.in_game_id;
end;
$$;
revoke all on function public.save_profile_games(jsonb) from public, anon, service_role;
grant execute on function public.save_profile_games(jsonb) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Squad Finder: nobody for single-player story games
-- Same as 0009 (signature, filters, bans, blocks, reputation, scoring, shape) plus the
-- squadable check.
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
  -- 0011: single-player story games have nobody to squad with.
  if not exists (select 1 from public.games g where g.id = p_game_id and g.squadable) then
    return;
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
      and (pr.banned_until is null or pr.banned_until <= now())   -- 0009: hide paused players
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Community search: spoiler posts match on title only
-- Same as 0006 otherwise.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.list_community_posts(
  p_sort     text,
  p_kind     text,
  p_game_id  text,
  p_search   text,
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
  me       uuid := auth.uid();
  v_sort   text := coalesce(p_sort, 'hot');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like   text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_sort not in ('hot','new','unanswered') then
    raise exception 'Unknown sort: %', v_sort using errcode = '22023';
  end if;
  if p_kind is not null and p_kind not in ('take','question') then
    raise exception 'Unknown post kind: %', p_kind using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select jsonb_build_object(
           'post', to_jsonb(p),
           'author', jsonb_build_object('id', a.id, 'username', a.username,
                                        'display_name', a.display_name, 'avatar_url', a.avatar_url),
           'has_gg', exists (select 1 from public.community_post_ggs g
                             where g.post_id = p.id and g.profile_id = me),
           'is_solved', (p.kind = 'question' and p.solved_reply_id is not null)
         )
  from public.community_posts p
  join public.profiles a on a.id = p.author_id
  where (p_kind is null or p.kind = p_kind)
    and (p_game_id is null or p.game_id = p_game_id)
    and (v_sort <> 'unanswered' or (p.kind = 'question' and p.reply_count = 0))
    -- 0011: a spoiler post's body is hidden, so search only matches its title.
    and (v_like is null or p.title ilike v_like or (not p.is_spoiler and p.body ilike v_like))
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = me)
    )
  order by
    case when v_sort = 'hot' then
      (p.gg_count + 2 * p.reply_count + 1)::double precision
      / power(greatest(extract(epoch from (now() - p.created_at))::double precision, 0) / 3600.0 + 2, 1.5)
    end desc nulls last,
    p.created_at desc,
    p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Privileges (create or replace keeps them; repeated here so this file stands on its own).
revoke all on function public.find_squadmates(text, text, text, text, integer) from public, anon;
grant execute on function public.find_squadmates(text, text, text, text, integer) to authenticated;
revoke all on function public.list_community_posts(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.list_community_posts(text, text, text, text, integer, integer) to authenticated;
