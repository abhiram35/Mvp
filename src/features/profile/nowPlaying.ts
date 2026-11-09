import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Game } from '../../lib/types';
import { useGames } from '../games/useGames';

/** profile_id → game_id, for whoever among `profileIds` is currently marked playing. */
export async function fetchNowPlayingGameIds(profileIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(profileIds)).filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from('profile_games')
    .select('profile_id, game_id')
    .eq('play_status', 'playing')
    .in('profile_id', unique);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { profile_id: string; game_id: string }[]) map[r.profile_id] = r.game_id;
  return map;
}

/** profile_id → Game currently marked "Playing now", for the given ids. Refetches when the id set changes. */
export function useNowPlaying(profileIds: string[]): Record<string, Game> {
  const { byId } = useGames();
  const [gameIdByProfile, setGameIdByProfile] = useState<Record<string, string>>({});
  const key = Array.from(new Set(profileIds.filter(Boolean))).sort().join(',');

  useEffect(() => {
    let live = true;
    fetchNowPlayingGameIds(key ? key.split(',') : []).then(
      (m) => {
        if (live) setGameIdByProfile(m);
      },
      () => {
        if (live) setGameIdByProfile({});
      },
    );
    return () => {
      live = false;
    };
  }, [key]);

  const result: Record<string, Game> = {};
  for (const [profileId, gameId] of Object.entries(gameIdByProfile)) {
    const game = byId(gameId);
    if (game) result[profileId] = game;
  }
  return result;
}
