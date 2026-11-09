import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * How many players have this game on their profile. A real number (not "online now"), used as
 * social proof under the Duo title. Returns null while loading or if the count fails.
 */
export function usePlayerCount(gameId: string | null): number | null {
  const [state, setState] = useState<{ gameId: string; count: number } | null>(null);
  useEffect(() => {
    if (!gameId) return;
    let active = true;
    void (async () => {
      const { count: n, error } = await supabase
        .from('profile_games')
        .select('profile_id', { count: 'exact', head: true })
        .eq('game_id', gameId);
      if (active && !error && typeof n === 'number') setState({ gameId, count: n });
    })();
    return () => {
      active = false;
    };
  }, [gameId]);
  // Only report a count for the game currently asked about (no stale number while switching).
  return state && state.gameId === gameId ? state.count : null;
}

/** "1 player" / "1,284 players" */
export function playersLabel(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'player' : 'players'}`;
}
