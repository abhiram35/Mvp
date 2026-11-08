import { useCallback, useEffect, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Profile, ProfileGame } from '../../lib/types';

type ProfileData = { profile: Profile | null; games: ProfileGame[] };

async function fetchProfileData(id: string): Promise<ProfileData> {
  const [p, g] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('profile_games').select('*').eq('profile_id', id),
  ]);
  if (p.error) throw p.error;
  if (g.error) throw g.error;
  return { profile: (p.data as Profile | null) ?? null, games: (g.data ?? []) as ProfileGame[] };
}

/** Loads one profile and its profile_games. `profile` is null (with no error) if it doesn't exist / isn't visible. */
export function useProfile(id: string | null | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<ProfileGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback((d: ProfileData) => {
    setProfile(d.profile);
    setGames(d.games);
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

  return { profile, games, loading: loading && !!id, error, reload: load };
}
