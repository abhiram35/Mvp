import { useCallback, useEffect, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Profile, ProfileGame, ProfileGameId, SteamAccount } from '../../lib/types';

type ProfileData = {
  profile: Profile | null;
  games: ProfileGame[];
  /** game_id → in-game ID. Only filled when you may see them (you, friends, chat partners). */
  gameIds: Record<string, string>;
  steam: SteamAccount | null;
};

async function fetchProfileData(id: string): Promise<ProfileData> {
  const [p, g, ids, steam] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('profile_games').select('*').eq('profile_id', id),
    supabase.from('profile_game_ids').select('game_id, in_game_id').eq('profile_id', id),
    supabase.from('steam_accounts').select('*').eq('profile_id', id).maybeSingle(),
  ]);
  if (p.error) throw p.error;
  if (g.error) throw g.error;
  // In-game IDs and Steam are extras: a failure there shouldn't hide the whole profile.
  const gameIds: Record<string, string> = {};
  for (const r of (ids.error ? [] : (ids.data ?? [])) as Pick<ProfileGameId, 'game_id' | 'in_game_id'>[]) {
    gameIds[r.game_id] = r.in_game_id;
  }
  return {
    profile: (p.data as Profile | null) ?? null,
    games: (g.data ?? []) as ProfileGame[],
    gameIds,
    steam: steam.error ? null : ((steam.data as SteamAccount | null) ?? null),
  };
}

/** Loads one profile, its profile_games, visible in-game IDs and linked Steam account. `profile` is null (with no error) if it doesn't exist / isn't visible. */
export function useProfile(id: string | null | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<ProfileGame[]>([]);
  const [gameIds, setGameIds] = useState<Record<string, string>>({});
  const [steam, setSteam] = useState<SteamAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback((d: ProfileData) => {
    setProfile(d.profile);
    setGames(d.games);
    setGameIds(d.gameIds);
    setSteam(d.steam);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((e: unknown) => {
    setError(errorMessage(e));
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      commit(await fetchProfileData(id));
    } catch (e) {
      fail(e);
    }
  }, [id, commit, fail]);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchProfileData(id).then(
      (d) => {
        if (live) commit(d);
      },
      (e: unknown) => {
        if (live) fail(e);
      },
    );
    return () => {
      live = false;
    };
  }, [id, commit, fail]);

  return { profile, games, gameIds, steam, loading: loading && !!id, error, reload: load };
}
