-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0010 – game categories, story games, game art, in-game IDs,
--           "currently playing", spoiler tags and Steam linking.
-- Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Games: category, co-op flag, Steam app id, artwork
-- ═════════════════════════════════════════════════════════════════════════════
-- category:  competitive = ranked / PvP, story = single-player campaigns,
--            casual = co-op, sandbox and chill multiplayer.
-- is_coop:   story games you can play together (It Takes Two, Baldur's Gate 3).
-- squadable: generated. Only squadable games appear in Squad Finder and LFG.
-- steam_appid: lets the app show Steam artwork and match a player's Steam library.
-- logo_url:  optional artwork you host yourself (Supabase Storage → game-art bucket).
--            When null the app uses the Steam artwork, then the emoji.

-- Re-run safety: the one-off backfills below only run the first time (when the column is
-- new), so running this file again never overwrites changes you made to games yourself.
-- Every schema change is guarded by a catalog check, so a re-run takes no table locks
-- ("add column if not exists" locks the table even when the column is already there).
do $$
declare
  v_new_category boolean := not exists (select 1 from pg_attribute where attrelid = 'public.games'::regclass
                 and attname = 'category' and not attisdropped);
  v_new_appid    boolean := not exists (select 1 from pg_attribute where attrelid = 'public.games'::regclass
                 and attname = 'steam_appid' and not attisdropped);
begin
  if v_new_category then
    alter table public.games add column category text not null default 'competitive';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.games'::regclass and conname = 'games_category_check') then
    alter table public.games add constraint games_category_check
      check (category in ('competitive','story','casual'));
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.games'::regclass
                 and attname = 'is_coop' and not attisdropped) then
    alter table public.games add column is_coop boolean not null default false;
  end if;
  if v_new_appid then
    alter table public.games add column steam_appid integer
      check (steam_appid is null or steam_appid > 0);
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.games'::regclass
                 and attname = 'logo_url' and not attisdropped) then
    alter table public.games add column logo_url text
      check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 1000));
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.games'::regclass
                 and attname = 'squadable' and not attisdropped) then
    alter table public.games add column squadable boolean
      generated always as (category <> 'story' or is_coop) stored;
  end if;
  if to_regclass('public.games_steam_appid_key') is null then
    create unique index games_steam_appid_key on public.games (steam_appid) where steam_appid is not null;
  end if;

  -- Existing games (first run only)
  if v_new_category then
    update public.games set category = 'competitive' where id in
      ('bgmi','free_fire_max','codm','valorant','cs2','pubg_pc','fortnite','apex_legends',
       'league_of_legends','dota_2','clash_of_clans');
    update public.games set category = 'casual' where id in ('minecraft','gta_v');
    -- Genshin Impact is open-world co-op: listed under "Co-op & Casual".
    update public.games set category = 'casual', is_coop = true where id = 'genshin_impact';
  end if;

  if v_new_appid then
    update public.games set steam_appid = 730     where id = 'cs2';
    update public.games set steam_appid = 570     where id = 'dota_2';
    update public.games set steam_appid = 578080  where id = 'pubg_pc';
    update public.games set steam_appid = 1172470 where id = 'apex_legends';
    update public.games set steam_appid = 271590  where id = 'gta_v';
  end if;
end;
$$;

-- Story games
insert into public.games (id, name, platforms, ranks, emoji, category, is_coop, steam_appid) values
  ('rdr2',            'Red Dead Redemption 2',        array['pc','console'], array[]::text[], '🤠', 'story', false, 1174180),
  ('gow_ragnarok',    'God of War Ragnarök',          array['pc','console'], array[]::text[], '🪓', 'story', false, 2322010),
  ('witcher_3',       'The Witcher 3: Wild Hunt',     array['pc','console'], array[]::text[], '🐺', 'story', false, 292030),
  ('elden_ring',      'Elden Ring',                   array['pc','console'], array[]::text[], '💍', 'story', true,  1245620),
  ('cyberpunk_2077',  'Cyberpunk 2077',               array['pc','console'], array[]::text[], '🌆', 'story', false, 1091500),
  ('spider_man_2',    'Marvel''s Spider-Man 2',       array['pc','console'], array[]::text[], '🕷️', 'story', false, 2651280),
  ('baldurs_gate_3',  'Baldur''s Gate 3',             array['pc','console'], array[]::text[], '🎲', 'story', true,  1086940),
  ('it_takes_two',    'It Takes Two',                 array['pc','console'], array[]::text[], '💞', 'story', true,  1426210),
  ('split_fiction',   'Split Fiction',                array['pc','console'], array[]::text[], '📖', 'story', true,  2001120),
  ('hogwarts_legacy', 'Hogwarts Legacy',              array['pc','console'], array[]::text[], '🪄', 'story', false, 990080),
  ('ghost_tsushima',  'Ghost of Tsushima',            array['pc','console'], array[]::text[], '⛩️', 'story', false, 2215430),
  ('tlou_part1',      'The Last of Us Part I',        array['pc','console'], array[]::text[], '🍄', 'story', false, 1888930),
  ('black_myth',      'Black Myth: Wukong',           array['pc','console'], array[]::text[], '🐒', 'story', false, 2358720)
-- Already there (or its Steam app id is used by another row)? Leave it alone, so your
-- own edits in Table Editor survive a re-run.
on conflict do nothing;

-- LFG lobbies only for squadable games (single-player story games have nobody to squad with).
create or replace function public.gg_lfg_game_squadable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.games g where g.id = new.game_id and g.squadable) then
    raise exception 'This game is single-player, so it can''t have a lobby' using errcode = '22023';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.lfg_posts'::regclass
                 and tgname = 'lfg_posts_before_insert_squadable' and not tgisinternal) then
    create trigger lfg_posts_before_insert_squadable
      before insert on public.lfg_posts
      for each row execute function public.gg_lfg_game_squadable();
  end if;
end;
$$;

-- Public bucket for game artwork you upload yourself (dashboard only; no user uploads).
insert into storage.buckets (id, name, public)
values ('game-art', 'game-art', true)
on conflict (id) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. "Currently playing" on profile_games
-- ═════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.profile_games'::regclass
                 and attname = 'play_status' and not attisdropped) then
    alter table public.profile_games add column play_status text;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.profile_games'::regclass
                   and conname = 'profile_games_play_status_check') then
    alter table public.profile_games add constraint profile_games_play_status_check
      check (play_status is null or play_status in ('playing','finished'));
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. In-game IDs (BGMI UID, Riot ID …)
-- Kept in their own table so they are NOT public: only you, accepted friends and
-- people you share a chat with (DM or squad chat) can see them, and never across a block.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.profile_game_ids (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (id) on delete cascade,
  in_game_id  text not null check (char_length(btrim(in_game_id)) between 1 and 64),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, game_id),
  foreign key (profile_id, game_id) references public.profile_games (profile_id, game_id) on delete cascade
);

-- Created only if missing: 0011_review_fixes.sql replaces it with the stricter rule, and
-- re-running this file must not bring the old rule back.
do $$
begin
  if to_regprocedure('public.gg_can_see_game_ids(uuid)') is null then
    execute $sql$
      create function public.gg_can_see_game_ids(p_target uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $fn$
        select auth.uid() is not null and (
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
                select 1 from public.conversation_members a
                join public.conversation_members b on b.conversation_id = a.conversation_id
                where a.profile_id = auth.uid() and b.profile_id = p_target
              )
            )
          )
        );
      $fn$
    $sql$;
  end if;
end;
$$;
revoke all on function public.gg_can_see_game_ids(uuid) from public, anon;
grant execute on function public.gg_can_see_game_ids(uuid) to authenticated;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profile_game_ids'::regclass) then
    alter table public.profile_game_ids enable row level security;
  end if;
end;
$$;
-- 0011 narrows these to column privileges (no table-wide UPDATE). Only set them while
-- they are still the defaults (table-wide UPDATE) or missing, so a re-run of this file
-- never widens them again.
do $$
begin
  if has_table_privilege('authenticated', 'public.profile_game_ids', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.profile_game_ids', 'SELECT') then
    revoke all on table public.profile_game_ids from anon, authenticated;
    grant select, insert, update, delete on public.profile_game_ids to authenticated;
  end if;
end;
$$;

-- Policies: created when missing (re-runs leave them, and the table, alone).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'profile_game_ids' and policyname = 'profile_game_ids_select') then
    create policy profile_game_ids_select on public.profile_game_ids
      for select to authenticated using (public.gg_can_see_game_ids(profile_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'profile_game_ids' and policyname = 'profile_game_ids_insert_own') then
    create policy profile_game_ids_insert_own on public.profile_game_ids
      for insert to authenticated with check (profile_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'profile_game_ids' and policyname = 'profile_game_ids_update_own') then
    create policy profile_game_ids_update_own on public.profile_game_ids
      for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'profile_game_ids' and policyname = 'profile_game_ids_delete_own') then
    create policy profile_game_ids_delete_own on public.profile_game_ids
      for delete to authenticated using (profile_id = auth.uid());
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Spoiler tags on community posts
-- ═════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.community_posts'::regclass
                 and attname = 'is_spoiler' and not attisdropped) then
    alter table public.community_posts add column is_spoiler boolean not null default false;
  end if;
end;
$$;
grant insert (is_spoiler) on public.community_posts to authenticated;
grant update (is_spoiler) on public.community_posts to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Steam accounts (verified with "Sign in through Steam")
-- Written only by the steam-link Edge Function (service role). Players can unlink
-- their own. Who can read a linked account is decided in 0011_review_fixes.sql
-- (same people who can see in-game IDs).
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.steam_accounts (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  steam_id        text not null unique check (steam_id ~ '^[0-9]{17}$'),
  persona_name    text check (persona_name is null or char_length(persona_name) <= 64),
  avatar_url      text check (avatar_url is null or char_length(avatar_url) <= 1000),
  profile_url     text check (profile_url is null or char_length(profile_url) <= 1000),
  library_public  boolean not null default false,
  game_count      integer not null default 0 check (game_count >= 0),
  -- top games by playtime: [{ appid, name, playtime_hours }]
  games           jsonb not null default '[]'::jsonb check (jsonb_typeof(games) = 'array'),
  linked_at       timestamptz not null default now(),
  synced_at       timestamptz not null default now()
);

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.steam_accounts'::regclass) then
    alter table public.steam_accounts enable row level security;
  end if;
end;
$$;
revoke all on table public.steam_accounts from anon, authenticated;
grant select, delete on public.steam_accounts to authenticated;

-- Created only if missing: 0011 replaces it, and a re-run must not undo that.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'steam_accounts' and policyname = 'steam_accounts_select') then
    create policy steam_accounts_select on public.steam_accounts
      for select to authenticated using (
        not exists (
          select 1 from public.blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = profile_id)
             or (b.blocker_id = profile_id and b.blocked_id = auth.uid())
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'steam_accounts' and policyname = 'steam_accounts_delete_own') then
    create policy steam_accounts_delete_own on public.steam_accounts
      for delete to authenticated using (profile_id = auth.uid());
  end if;
end;
$$;

-- One-time sign-in attempts (nonce). Service role only.
create table if not exists public.steam_link_requests (
  nonce        uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  redirect_to  text not null check (redirect_to ~ '^(gg|exp|exps)://' and char_length(redirect_to) <= 500),
  created_at   timestamptz not null default now()
);
do $$
begin
  if to_regclass('public.steam_link_requests_created_idx') is null then
    create index steam_link_requests_created_idx on public.steam_link_requests (created_at);
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.steam_link_requests'::regclass) then
    alter table public.steam_link_requests enable row level security;
  end if;
end;
$$;
revoke all on table public.steam_link_requests from anon, authenticated;
