import { useCallback, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { PlayStyle, Profile, ProfileGame, Region, ReputationSummary, SquadmateMatch } from '../../lib/types';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Accepts a parsed object or a JSON string. */
function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isObject(v) ? v : null;
}

function normaliseOne(raw: unknown): SquadmateMatch | null {
  let row = asObject(raw);
  if (!row) return null;
  // `returns setof jsonb` may arrive wrapped in a single column, e.g. { find_squadmates: {...} }.
  if (!('profile' in row)) {
    const values = Object.values(row);
    if (values.length === 1) row = asObject(values[0]);
  }
  if (!row) return null;
  const profile = asObject(row.profile) as Profile | null;
  if (!profile || typeof profile.id !== 'string') return null;
  const game = (asObject(row.game) as ProfileGame | null) ?? {
    profile_id: profile.id,
    game_id: '',
    rank: null,
    role: null,
    play_status: null,
  };
  const score = Number(row.match_score);
  const shared = Array.isArray(row.shared_languages) ? row.shared_languages.filter((l): l is string => typeof l === 'string') : [];
  return {
    profile: { ...profile, languages: Array.isArray(profile.languages) ? profile.languages : [] },
    game,
    match_score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    shared_languages: shared,
    reputation: (asObject(row.reputation) as ReputationSummary | null) ?? undefined,
  };
}

/** Normalises the find_squadmates RPC result (array of objects or single-jsonb-column rows). */
export function normaliseSquadmates(data: unknown): SquadmateMatch[] {
  const list = Array.isArray(data) ? data : data == null ? [] : [data];
  return list.map(normaliseOne).filter((m): m is SquadmateMatch => m !== null);
}

export interface SquadSearch {
  gameId: string;
  region: Region | null;
  language: string | null;
  playStyle: PlayStyle | null;
}

export async function findSquadmates(search: SquadSearch, limit = 30): Promise<SquadmateMatch[]> {
  const { data, error } = await supabase.rpc('find_squadmates', {
    p_game_id: search.gameId,
    p_region: search.region,
    p_language: search.language,
    p_play_style: search.playStyle,
    p_limit: limit,
  });
  if (error) throw error;
  return normaliseSquadmates(data);
}

/** On-demand squad search (runs when `search()` is called). */
export function useSquadSearch() {
  const [results, setResults] = useState<SquadmateMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<SquadSearch | null>(null);
  const reqId = useRef(0);

  const search = useCallback(async (params: SquadSearch) => {
    last.current = params;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await findSquadmates(params);
      if (id === reqId.current) setResults(rows);
    } catch (e) {
      if (id === reqId.current) setError((e as { message?: string })?.message ?? 'Something went wrong.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (last.current) void search(last.current);
  }, [search]);

  return { results, loading, error, search, retry };
}

/** The current user's games (to default the squad finder's game). */
export async function fetchMyGameIds(myId: string): Promise<string[]> {
  const { data, error } = await supabase.from('profile_games').select('game_id').eq('profile_id', myId);
  if (error) throw error;
  return ((data ?? []) as { game_id: string }[]).map((r) => r.game_id);
}
