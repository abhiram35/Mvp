import { useCallback, useEffect, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Profile, ProfileGame } from '../../lib/types';

/** Loads one profile and its profile_games. `profile` is null (with no error) if it doesn't exist / isn't visible. */
export function useProfile(id: string | null | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<ProfileGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, g] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('profile_games').select('*').eq('profile_id', id),
      ]);
      if (p.error) throw p.error;
      if (g.error) throw g.error;
      setProfile((p.data as Profile | null) ?? null);
      setGames((g.data ?? []) as ProfileGame[]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { profile, games, loading, error, reload: load };
}
