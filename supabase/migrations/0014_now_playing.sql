-- 0014: "currently playing" becomes exclusive, so it can be shown as a live status badge
-- (friends list, squad finder, chat header, profile) instead of just a per-game progress
-- flag on story games. Marking a game 'playing' now clears 'playing' on every other game for
-- that player, so profile_games.play_status = 'playing' identifies at most one "current" game
-- per player. 'finished' rows (story game progress) are untouched. Safe to run more than once.

create or replace function public.gg_profile_games_playing_exclusive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.play_status = 'playing' then
    update public.profile_games
      set play_status = null
      where profile_id = new.profile_id
        and game_id <> new.game_id
        and play_status = 'playing';
  end if;
  return null; -- after-trigger: return value is ignored
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profile_games_playing_exclusive'
                 and tgrelid = 'public.profile_games'::regclass) then
    create trigger profile_games_playing_exclusive
      after insert or update of play_status on public.profile_games
      for each row execute function public.gg_profile_games_playing_exclusive();
  end if;
end;
$$;
