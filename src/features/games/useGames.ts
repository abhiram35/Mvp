import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Game } from '../../lib/types';

// Games rarely change, so cache them for the whole app session.
let cache: Game[] | null = null;
let inflight: Promise<Game[]> | null = null;

export async function fetchGames(): Promise<Game[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.from('games').select('*').order('name');
      if (error) {
        inflight = null;
        throw error;
      }
      cache = (data ?? []) as Game[];
      return cache;
    })();
  }
  return inflight;
}

/** All supported games, plus a lookup by id. */
export function useGames() {
  const [games, setGames] = useState<Game[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchGames()
      .then((g) => active && setGames(g))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const byId = (id: string | null | undefined) => games.find((g) => g.id === id);
  return { games, byId, loading, error };
}
