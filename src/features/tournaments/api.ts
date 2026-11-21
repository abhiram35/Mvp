import { errorMessage, supabase } from '../../lib/supabase';
import type { Region } from '../../lib/types';
import type { ScrimFormat } from '../scrims/types';
import type { MatchReport, Organiser, OrganiserApplication, Tournament, TournamentEntry, TournamentMatch, TournamentStatus } from './types';

import { fetchMyTeams } from '../scrims/api';

export { useLoader } from '../scrims/api';

const TEAM_FIELDS = 'id, game_id, name, tag, region, captain_id, created_at';
const TOURNAMENT_FIELDS =
  'id, organiser_id, game_id, name, description, prize, region, max_teams, match_format, final_format, registration_closes_at, starts_at, stream_url, status, featured_match_id, winner_team_id, created_at, updated_at';
// lobby_info is deliberately not selected: it's private to the two teams (get_match_lobby).
const MATCH_FIELDS =
  'id, tournament_id, round, slot, team_a_id, team_b_id, format, status, a_score, b_score, winner_team_id, next_match_id, next_slot, conversation_id, started_at, completed_at, created_at, updated_at';
const MATCH_SELECT = `${MATCH_FIELDS}, team_a:teams!tournament_matches_team_a_id_fkey(${TEAM_FIELDS}), team_b:teams!tournament_matches_team_b_id_fkey(${TEAM_FIELDS})`;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

/** Attach organiser names (organisers table) to tournaments. */
async function withOrganisers(rows: Tournament[]): Promise<Tournament[]> {
  const ids = [...new Set(rows.map((r) => r.organiser_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return rows;
  const { data } = await supabase.from('organisers').select('profile_id, org_name').in('profile_id', ids);
  const byId = new Map(((data ?? []) as { profile_id: string; org_name: string }[]).map((o) => [o.profile_id, o]));
  return rows.map((r) => ({ ...r, organiser: r.organiser_id ? (byId.get(r.organiser_id) ?? null) : null }));
}

// ── Organisers ──────────────────────────────────────────────────────────────
export async function fetchOrganiser(profileId: string): Promise<Organiser | null> {
  const { data, error } = await supabase.from('organisers').select('*').eq('profile_id', profileId).maybeSingle();
  if (error) return null; // older databases without 0016: nobody is an organiser
  return (data as Organiser | null) ?? null;
}

export async function fetchMyApplication(profileId: string): Promise<OrganiserApplication | null> {
  const { data, error } = await supabase
    .from('organiser_applications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as OrganiserApplication | null) ?? null;
}

/** Moderators: pending applications, oldest first, with the applicant's profile. */
export async function fetchPendingApplications(): Promise<OrganiserApplication[]> {
  const { data, error } = await supabase
    .from('organiser_applications')
    .select('*, profile:profiles!organiser_applications_profile_id_fkey(id, username, display_name, avatar_url, created_at)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as OrganiserApplication[];
}

export const applyToOrganise = (orgName: string, discord: string | null, about: string) =>
  rpc<string>('apply_to_organise', { p_org_name: orgName.trim(), p_discord: discord?.trim() || null, p_about: about.trim(), p_accept_terms: true });
export const reviewApplication = (id: string, approve: boolean, note: string | null) =>
  rpc<void>('review_organiser_application', { p_application_id: id, p_approve: approve, p_note: note?.trim() || null });

// ── Tournaments ─────────────────────────────────────────────────────────────
export async function fetchTournaments(gameId: string | null): Promise<Tournament[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  let q = supabase.from('tournaments').select(TOURNAMENT_FIELDS).gte('starts_at', since).neq('status', 'cancelled');
  if (gameId) q = q.eq('game_id', gameId);
  const { data, error } = await q.order('starts_at', { ascending: true }).limit(60);
  if (error) throw error;
  return withOrganisers((data ?? []) as Tournament[]);
}

export async function fetchTournament(id: string): Promise<Tournament | null> {
  const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withOrganisers([data as Tournament]))[0];
}

/**
 * Tournaments a player may link a clip to (post_clip's rule in 0017): ones a team of theirs is
 * entered in (any status but withdrawn), plus ones they organise. Not cancelled; the picker
 * narrows them further with clipCupChoices.
 */
export async function fetchMyClipTournaments(myId: string): Promise<Tournament[]> {
  const teams = await fetchMyTeams(myId);
  const teamIds = teams.map((m) => m.team.id);
  const [entries, organised] = await Promise.all([
    teamIds.length
      ? supabase.from('tournament_teams').select('tournament_id').in('team_id', teamIds).neq('status', 'withdrawn')
      : Promise.resolve({ data: [] as { tournament_id: string }[], error: null }),
    supabase.from('tournaments').select('id').eq('organiser_id', myId).neq('status', 'cancelled').limit(50),
  ]);
  if (entries.error) throw entries.error;
  if (organised.error) throw organised.error;
  const ids = [
    ...new Set([
      ...((entries.data ?? []) as { tournament_id: string }[]).map((r) => r.tournament_id),
      ...((organised.data ?? []) as { id: string }[]).map((r) => r.id),
    ]),
  ];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_FIELDS).in('id', ids.slice(0, 100)).neq('status', 'cancelled');
  if (error) throw error;
  return (data ?? []) as Tournament[];
}

/** Registered-team counts per tournament (for the list). */
export async function fetchEntryCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from('tournament_teams')
    .select('tournament_id, status')
    .in('tournament_id', ids)
    .in('status', ['registered', 'playing', 'eliminated', 'champion']);
  for (const r of (data ?? []) as { tournament_id: string }[]) out.set(r.tournament_id, (out.get(r.tournament_id) ?? 0) + 1);
  return out;
}

export async function fetchEntries(tournamentId: string): Promise<TournamentEntry[]> {
  const { data, error } = await supabase
    .from('tournament_teams')
    .select(`*, team:teams(${TEAM_FIELDS})`)
    .eq('tournament_id', tournamentId)
    .order('seed', { ascending: true, nullsFirst: false })
    .order('registered_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TournamentEntry[];
}

export async function fetchMatches(tournamentId: string): Promise<TournamentMatch[]> {
  const { data, error } = await supabase.from('tournament_matches').select(MATCH_SELECT).eq('tournament_id', tournamentId).order('round').order('slot');
  if (error) throw error;
  return (data ?? []) as unknown as TournamentMatch[];
}

export async function fetchMatch(id: string): Promise<TournamentMatch | null> {
  const { data, error } = await supabase.from('tournament_matches').select(MATCH_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as TournamentMatch | null) ?? null;
}

export async function fetchMatchReports(matchId: string): Promise<MatchReport[]> {
  const { data, error } = await supabase.from('tournament_match_reports').select('*').eq('match_id', matchId);
  if (error) return [];
  return (data ?? []) as MatchReport[];
}

export async function fetchMatchLobby(matchId: string): Promise<string | null> {
  try {
    return await rpc<string | null>('get_match_lobby', { p_match_id: matchId });
  } catch {
    return null;
  }
}

export interface CreateTournamentInput {
  gameId: string;
  name: string;
  description: string;
  prize: string;
  region: Region | null;
  maxTeams: number;
  matchFormat: ScrimFormat;
  finalFormat: ScrimFormat;
  registrationClosesAt: string;
  startsAt: string;
  streamUrl: string;
}

export const createTournament = (i: CreateTournamentInput) =>
  rpc<string>('create_tournament', {
    p_game_id: i.gameId,
    p_name: i.name.trim(),
    p_description: i.description.trim() || null,
    p_prize: i.prize.trim() || null,
    p_region: i.region,
    p_max_teams: i.maxTeams,
    p_match_format: i.matchFormat,
    p_final_format: i.finalFormat,
    p_registration_closes_at: i.registrationClosesAt,
    p_starts_at: i.startsAt,
    p_stream_url: i.streamUrl,
  });
export const updateTournamentInfo = (id: string, description: string, prize: string, streamUrl: string) =>
  rpc<void>('update_tournament_info', { p_tournament_id: id, p_description: description.trim() || null, p_prize: prize.trim() || null, p_stream_url: streamUrl });
export const cancelTournament = (id: string) => rpc<void>('cancel_tournament', { p_tournament_id: id });
export const registerTeam = (id: string, teamId: string) => rpc<void>('register_team', { p_tournament_id: id, p_team_id: teamId });
export const withdrawTeam = (id: string, teamId: string) => rpc<void>('withdraw_team', { p_tournament_id: id, p_team_id: teamId });
export const checkInTeam = (id: string, teamId: string) => rpc<void>('check_in_team', { p_tournament_id: id, p_team_id: teamId });
export const startTournament = (id: string) => rpc<void>('start_tournament', { p_tournament_id: id });
export const reportMatchResult = (matchId: string, a: number, b: number) => rpc<string>('report_match_result', { p_match_id: matchId, p_a_score: a, p_b_score: b });
export const resolveMatch = (matchId: string, a: number, b: number) => rpc<void>('resolve_match', { p_match_id: matchId, p_a_score: a, p_b_score: b });
export const setMatchLobby = (matchId: string, info: string) => rpc<void>('set_match_lobby', { p_match_id: matchId, p_info: info.trim() });
export const setFeaturedMatch = (id: string, matchId: string | null) => rpc<void>('set_featured_match', { p_tournament_id: id, p_match_id: matchId });

/** Re-run `onChange` when the tournament, its teams or its matches change (realtime + 30 s poll). */
export function watchTournament(id: string, onChange: () => void, pollMs = 30_000): () => void {
  const channel = supabase
    .channel(`tournament-${id}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_teams', filter: `tournament_id=eq.${id}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${id}` }, onChange)
    .subscribe();
  const timer = setInterval(onChange, pollMs);
  return () => {
    clearInterval(timer);
    void supabase.removeChannel(channel);
  };
}

export const STATUS_FILTERS: readonly { value: TournamentStatus | 'upcoming'; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'live', label: 'Live' },
  { value: 'completed', label: 'Finished' },
];
