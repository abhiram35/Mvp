import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  PUBLIC_RATING_TAGS,
  type PlayerStats,
  type PublicRatingTag,
  type RateableTeammate,
  type RatingTag,
} from '../../lib/types';

const ALL_TAGS: RatingTag[] = [...PUBLIC_RATING_TAGS, 'toxic'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** RPC results may be an object, a one-element array, a JSON string, or wrapped in a single column. */
function unwrap(raw: unknown, key: string): Record<string, unknown> | null {
  let v: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!isObject(v)) return null;
  if (!(key in v)) {
    const values = Object.values(v);
    if (values.length === 1) return unwrap(values[0], key);
  }
  return v;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function emptyStats(profileId: string): PlayerStats {
  return {
    profile_id: profileId,
    xp: 0,
    level: 1,
    xp_into_level: 0,
    xp_for_next: 50,
    squads_joined: 0,
    lobbies_hosted: 0,
    ratings_received: 0,
    positive_ratings: 0,
    tag_counts: { good_comms: 0, chill: 0, clutch: 0, shotcaller: 0 },
    solutions: 0,
  };
}

export function normaliseStats(raw: unknown, profileId: string): PlayerStats {
  const r = unwrap(raw, 'xp');
  const base = emptyStats(profileId);
  if (!r) return base;
  const tc = isObject(r.tag_counts) ? r.tag_counts : {};
  const tag_counts = Object.fromEntries(PUBLIC_RATING_TAGS.map((tag) => [tag, num(tc[tag])])) as Record<PublicRatingTag, number>;
  const xp = num(r.xp);
  const level = Math.max(1, Math.floor(num(r.level)) || Math.floor(Math.sqrt(xp / 50)) + 1);
  return {
    profile_id: typeof r.profile_id === 'string' ? r.profile_id : profileId,
    xp,
    level,
    xp_into_level: num(r.xp_into_level),
    xp_for_next: num(r.xp_for_next) || base.xp_for_next,
    squads_joined: num(r.squads_joined),
    lobbies_hosted: num(r.lobbies_hosted),
    ratings_received: num(r.ratings_received),
    positive_ratings: num(r.positive_ratings),
    tag_counts,
    solutions: num(r.solutions),
  };
}

function normaliseTeammates(data: unknown): RateableTeammate[] {
  const list = Array.isArray(data) ? data : data == null ? [] : [data];
  const out: RateableTeammate[] = [];
  for (const item of list) {
    const r = unwrap(item, 'profile');
    const p = r && isObject(r.profile) ? r.profile : null;
    if (!r || !p || typeof p.id !== 'string') continue;
    const tags = Array.isArray(r.my_tags) ? r.my_tags.filter((x): x is RatingTag => ALL_TAGS.includes(x as RatingTag)) : [];
    out.push({
      profile: {
        id: p.id,
        username: typeof p.username === 'string' ? p.username : '',
        display_name: typeof p.display_name === 'string' ? p.display_name : 'Player',
        avatar_url: typeof p.avatar_url === 'string' ? p.avatar_url : null,
      },
      already_rated: r.already_rated === true || tags.length > 0,
      my_tags: tags,
    });
  }
  return out;
}

function codeOf(e: unknown): string {
  const c = (e as { code?: unknown })?.code;
  return typeof c === 'string' ? c : '';
}

function messageOf(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === 'string' ? m : '';
}

/** Short, friendly text for rating errors (the server's wording is not shown as-is). */
export function ratingErrorMessage(e: unknown): string {
  const code = codeOf(e);
  const msg = messageOf(e);
  if (/network|fetch|timed? ?out|offline/i.test(msg)) return 'No connection. Check your internet and try again.';
  if (/banned|paused|suspend/i.test(msg)) return "Your account is paused, so you can't rate teammates right now.";
  if (/expired|window|7 days|too late|closed/i.test(msg)) return 'Ratings for this lobby are closed — you can rate for 7 days after it was created.';
  if (code === '42501' || /not eligible|not allowed|not a member|permission|row-level/i.test(msg)) {
    return 'You can only rate players who were in this lobby with you.';
  }
  if (code === '22023' || code === '23514' || /tag/i.test(msg)) return 'Pick 1–4 praise tags, or report as toxic on its own.';
  if (/yourself|self/i.test(msg)) return "You can't rate yourself.";
  return "Couldn't save that rating. Please try again.";
}

/** Valid tag sets: 1–4 distinct praise tags, or exactly ['toxic']. */
export function isValidTagSet(tags: RatingTag[]): boolean {
  const unique = new Set(tags);
  if (unique.size !== tags.length || tags.length === 0) return false;
  if (unique.has('toxic')) return tags.length === 1;
  return tags.length <= 4 && tags.every((t) => (PUBLIC_RATING_TAGS as readonly string[]).includes(t));
}

/** Rate or re-rate a teammate for a lobby. Throws an Error with a friendly message. Returns the ratee's new stats. */
export async function rateTeammate(postId: string, rateeId: string, tags: RatingTag[]): Promise<PlayerStats> {
  if (!isValidTagSet(tags)) throw new Error('Pick 1–4 praise tags, or report as toxic on its own.');
  const { data, error } = await supabase.rpc('rate_teammate', { p_lfg_post_id: postId, p_ratee_id: rateeId, p_tags: tags });
  if (error) throw new Error(ratingErrorMessage(error));
  return normaliseStats(data, rateeId);
}

/** Public stats for a player (level, XP, ratings, praise counts, solutions). Reloads quietly on focus. */
export function usePlayerStats(profileId: string | null | undefined) {
  const [entry, setEntry] = useState<{ id: string; stats: PlayerStats } | null>(null);
  const stats = entry && entry.id === profileId ? entry.stats : null;
  const [loading, setLoading] = useState(!!profileId);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!profileId) return;
      const id = ++reqId.current;
      if (!silent) setLoading(true);
      try {
        const { data, error: e } = await supabase.rpc('get_player_stats', { p_profile_id: profileId });
        if (id !== reqId.current) return;
        if (e) throw e;
        setEntry({ id: profileId, stats: normaliseStats(data, profileId) });
        setError(null);
      } catch (e) {
        if (id === reqId.current && !silent) setError(messageOf(e) || "Couldn't load stats.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [profileId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void load(true);
    }, [load]),
  );

  return { stats, loading: !!profileId && (loading || !stats) && !error, error, reload: () => load(true) };
}

/** Teammates the caller can rate for a lobby. `enabled` lets a closed sheet skip the request. */
export function useRateableTeammates(lfgPostId: string | null | undefined, enabled = true) {
  const [teammates, setTeammates] = useState<RateableTeammate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!lfgPostId) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc('list_rateable_teammates', { p_lfg_post_id: lfgPostId });
      if (id !== reqId.current) return;
      if (e) throw e;
      setTeammates(normaliseTeammates(data));
    } catch (e) {
      if (id === reqId.current) setError(/network|fetch/i.test(messageOf(e)) ? 'No connection. Check your internet and try again.' : "Couldn't load your teammates.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [lfgPostId]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { teammates, loading, error, reload: load };
}
