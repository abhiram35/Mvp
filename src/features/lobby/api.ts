// Lobby tab reads: cheap live counts for the mode tiles and the live ticker data.
import { supabase } from '../../lib/supabase';
import { fetchMyScrims, fetchMyTeams } from '../scrims/api';
import type { Scrim } from '../scrims/types';
import type { Tournament, TournamentMatch } from '../tournaments/types';
import type { ModeCounts, TickerInput } from './logic';

async function headCount(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** Open scrims, live tournaments and open LFG posts (head-only counts; null when a count fails). */
export async function fetchModeCounts(): Promise<ModeCounts> {
  const now = new Date().toISOString();
  const [scrims, cups, lobbies] = await Promise.all([
    headCount(supabase.from('scrims').select('id', { count: 'exact', head: true }).eq('status', 'open').gt('scheduled_at', now)),
    headCount(supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('status', 'live')),
    headCount(supabase.from('lfg_posts').select('id', { count: 'exact', head: true }).eq('status', 'open').gt('expires_at', now)),
  ]);
  return { scrims, cups, lobbies };
}

type TickerData = Omit<TickerInput, 'gameName'>;

/** Live tournaments, my teams' scrims and my ready tournament matches. Parts that fail are left empty. */
export async function fetchTickerData(myId: string): Promise<TickerData> {
  const [liveRes, teamsRes] = await Promise.allSettled([
    supabase.from('tournaments').select('id, name, game_id, status, starts_at').eq('status', 'live').order('starts_at', { ascending: true }).limit(10),
    fetchMyTeams(myId),
  ]);
  const liveTournaments =
    liveRes.status === 'fulfilled' && !liveRes.value.error ? ((liveRes.value.data ?? []) as Pick<Tournament, 'id' | 'name' | 'game_id' | 'status' | 'starts_at'>[]) : [];
  const myTeamIds = teamsRes.status === 'fulfilled' ? teamsRes.value.map((m) => m.team.id) : [];
  if (myTeamIds.length === 0) return { liveTournaments, myScrims: [], readyMatches: [], myTeamIds };

  const ids = myTeamIds.join(',');
  const [scrimsRes, matchesRes] = await Promise.allSettled([
    fetchMyScrims(myTeamIds),
    supabase
      .from('tournament_matches')
      .select('id, status, tournament_id, round')
      .eq('status', 'ready')
      .or(`team_a_id.in.(${ids}),team_b_id.in.(${ids})`)
      .limit(5),
  ]);
  const myScrims: Scrim[] = scrimsRes.status === 'fulfilled' ? scrimsRes.value : [];
  let readyMatches: TickerData['readyMatches'] = [];
  if (matchesRes.status === 'fulfilled' && !matchesRes.value.error) {
    const rows = (matchesRes.value.data ?? []) as Pick<TournamentMatch, 'id' | 'status' | 'tournament_id' | 'round'>[];
    const tIds = [...new Set(rows.map((r) => r.tournament_id))];
    const names = new Map<string, string>();
    if (tIds.length > 0) {
      const { data } = await supabase.from('tournaments').select('id, name').in('id', tIds);
      for (const t of (data ?? []) as { id: string; name: string }[]) names.set(t.id, t.name);
    }
    readyMatches = rows.map((r) => ({ ...r, tournament_name: names.get(r.tournament_id) ?? null }));
  }
  return { liveTournaments, myScrims, readyMatches, myTeamIds };
}
