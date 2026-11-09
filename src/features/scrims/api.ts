import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Region } from '../../lib/types';
import type { Scrim, ScrimFormat, ScrimReport, ScrimRequest, ScrimStatus, Team, TeamInvite, TeamMember, TeamRole, TeamStats } from './types';

const TEAM_FIELDS = 'id, game_id, name, tag, region, captain_id, created_at';
const PROFILE_FIELDS = 'id, username, display_name, avatar_url';
const SCRIM_SELECT = `*, host:teams!scrims_host_team_id_fkey(${TEAM_FIELDS}), opponent:teams!scrims_opponent_team_id_fkey(${TEAM_FIELDS})`;
const MEMBER_SELECT = `team_id, profile_id, game_id, role, joined_at, profile:profiles(${PROFILE_FIELDS})`;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

// ── Reads ───────────────────────────────────────────────────────────────────
export interface MyMembership {
  role: TeamRole;
  team: Team;
}

/** Teams I'm on (any game). */
export async function fetchMyTeams(myId: string): Promise<MyMembership[]> {
  const { data, error } = await supabase.from('team_members').select(`role, team:teams(${TEAM_FIELDS})`).eq('profile_id', myId);
  if (error) throw error;
  return ((data ?? []) as unknown as { role: TeamRole; team: Team | null }[])
    .filter((r): r is MyMembership => !!r.team)
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
}

export async function fetchTeam(id: string): Promise<Team | null> {
  const { data, error } = await supabase.from('teams').select(TEAM_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Team | null) ?? null;
}

const ROLE_ORDER: Record<TeamRole, number> = { captain: 0, player: 1, sub: 2 };

export async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.from('team_members').select(MEMBER_SELECT).eq('team_id', teamId);
  if (error) throw error;
  return ((data ?? []) as unknown as TeamMember[]).sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joined_at.localeCompare(b.joined_at),
  );
}

export async function fetchTeamStats(teamId: string): Promise<TeamStats> {
  return rpc<TeamStats>('get_team_stats', { p_team_id: teamId });
}

/** Pending invites sent to me. */
export async function fetchMyInvites(myId: string): Promise<TeamInvite[]> {
  const { data, error } = await supabase
    .from('team_invites')
    .select(`*, team:teams(${TEAM_FIELDS})`)
    .eq('profile_id', myId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TeamInvite[];
}

/** Pending invites a team has sent (visible to its members). */
export async function fetchTeamInvites(teamId: string): Promise<{ id: string; profile_id: string }[]> {
  const { data, error } = await supabase.from('team_invites').select('id, profile_id').eq('team_id', teamId).eq('status', 'pending');
  if (error) throw error;
  return (data ?? []) as { id: string; profile_id: string }[];
}

/** Open, upcoming scrims on the board. */
export async function fetchOpenScrims(gameId: string | null, region: Region | null): Promise<Scrim[]> {
  let q = supabase.from('scrims').select(SCRIM_SELECT).eq('status', 'open').gt('scheduled_at', new Date().toISOString());
  if (gameId) q = q.eq('game_id', gameId);
  if (region) q = q.eq('region', region);
  const { data, error } = await q.order('scheduled_at', { ascending: true }).limit(60);
  if (error) throw error;
  return (data ?? []) as Scrim[];
}

const ACTIVE: ScrimStatus[] = ['open', 'booked', 'disputed'];

/** My teams' scrims: everything active, plus the last few days of finished ones. */
export async function fetchMyScrims(teamIds: string[]): Promise<Scrim[]> {
  if (teamIds.length === 0) return [];
  const ids = teamIds.join(',');
  const since = Date.now() - 3 * 24 * 3600_000;
  const { data, error } = await supabase
    .from('scrims')
    .select(SCRIM_SELECT)
    .or(`host_team_id.in.(${ids}),opponent_team_id.in.(${ids})`)
    .order('scheduled_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as Scrim[])
    .filter((s) => {
      const at = new Date(s.scheduled_at).getTime();
      // Open scrims whose time passed are dead: show them only briefly so the host can tidy up.
      if (s.status === 'open') return at >= since;
      return ACTIVE.includes(s.status) || at >= since || at > now;
    })
    .reverse();
}

/** A team's recent scrims (for the team page). */
export async function fetchTeamScrims(teamId: string): Promise<Scrim[]> {
  const { data, error } = await supabase
    .from('scrims')
    .select(SCRIM_SELECT)
    .or(`host_team_id.eq.${teamId},opponent_team_id.eq.${teamId}`)
    .order('scheduled_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Scrim[];
}

export async function fetchScrim(id: string): Promise<Scrim | null> {
  const { data, error } = await supabase.from('scrims').select(SCRIM_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Scrim | null) ?? null;
}

/** Requests on a scrim (RLS: only the host team and requesting teams see them). */
export async function fetchScrimRequests(scrimId: string): Promise<ScrimRequest[]> {
  const { data, error } = await supabase
    .from('scrim_requests')
    .select(`*, team:teams(${TEAM_FIELDS})`)
    .eq('scrim_id', scrimId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScrimRequest[];
}

/** Lobby / party-code details (RLS: both rosters only; null for everyone else). */
export async function fetchScrimLobby(scrimId: string): Promise<{ info: string | null; updated_at: string } | null> {
  const { data, error } = await supabase.from('scrim_lobby').select('info, updated_at').eq('scrim_id', scrimId).maybeSingle();
  if (error) throw error;
  return (data as { info: string | null; updated_at: string } | null) ?? null;
}

export async function fetchScrimReports(scrimId: string): Promise<ScrimReport[]> {
  const { data, error } = await supabase.from('scrim_reports').select('*').eq('scrim_id', scrimId);
  if (error) throw error;
  return (data ?? []) as ScrimReport[];
}

// ── Writes (all through RPCs) ───────────────────────────────────────────────
export const createTeam = (gameId: string, name: string, tag: string, region: Region) =>
  rpc<string>('create_team', { p_game_id: gameId, p_name: name.trim(), p_tag: tag, p_region: region });
export const inviteToTeam = (teamId: string, profileId: string) => rpc<string>('invite_to_team', { p_team_id: teamId, p_profile_id: profileId });
export const respondTeamInvite = (inviteId: string, accept: boolean) => rpc<void>('respond_team_invite', { p_invite_id: inviteId, p_accept: accept });
export const removeTeamMember = (teamId: string, profileId: string) => rpc<void>('remove_team_member', { p_team_id: teamId, p_profile_id: profileId });
export const leaveTeam = (teamId: string) => rpc<void>('leave_team', { p_team_id: teamId });

export const postScrim = (p: {
  teamId: string;
  scheduledAt: string;
  format: ScrimFormat;
  rankMin: string | null;
  rankMax: string | null;
  notes: string | null;
}) =>
  rpc<string>('post_scrim', {
    p_team_id: p.teamId,
    p_scheduled_at: p.scheduledAt,
    p_format: p.format,
    p_rank_min: p.rankMin,
    p_rank_max: p.rankMax,
    p_notes: p.notes?.trim() || null,
  });
export const requestScrim = (scrimId: string, teamId: string, message: string | null) =>
  rpc<string>('request_scrim', { p_scrim_id: scrimId, p_team_id: teamId, p_message: message?.trim() || null });
export const withdrawScrimRequest = (requestId: string) => rpc<void>('withdraw_scrim_request', { p_request_id: requestId });
export const respondScrimRequest = (requestId: string, accept: boolean) =>
  rpc<string | null>('respond_scrim_request', { p_request_id: requestId, p_accept: accept });
export const cancelScrim = (scrimId: string) => rpc<void>('cancel_scrim', { p_scrim_id: scrimId });
export const checkInScrim = (scrimId: string) => rpc<void>('check_in_scrim', { p_scrim_id: scrimId });
export const setScrimLobby = (scrimId: string, info: string) => rpc<void>('set_scrim_lobby', { p_scrim_id: scrimId, p_info: info.trim() });
export const reportScrimResult = (scrimId: string, hostScore: number, oppScore: number, screenshotUrl: string | null = null) =>
  rpc<ScrimStatus>('report_scrim_result', { p_scrim_id: scrimId, p_host_score: hostScore, p_opp_score: oppScore, p_screenshot_url: screenshotUrl });
export const claimScrimNoShow = (scrimId: string) => rpc<void>('claim_scrim_no_show', { p_scrim_id: scrimId });
export const escalateScrim = (scrimId: string) => rpc<void>('escalate_scrim', { p_scrim_id: scrimId });
export const setScrimStreaming = (scrimId: string, allowed: boolean) => rpc<void>('set_scrim_streaming', { p_scrim_id: scrimId, p_allowed: allowed });
export const setScrimStreamUrl = (scrimId: string, url: string | null) => rpc<void>('set_scrim_stream_url', { p_scrim_id: scrimId, p_url: url });
export const setScrimFeatured = (scrimId: string, featured: boolean) => rpc<void>('set_scrim_featured', { p_scrim_id: scrimId, p_featured: featured });
export const resolveScrimDispute = (scrimId: string, hostScore: number, oppScore: number) =>
  rpc<void>('resolve_scrim_dispute', { p_scrim_id: scrimId, p_host_score: hostScore, p_opp_score: oppScore });

// ── Loader hook ─────────────────────────────────────────────────────────────
/**
 * Runs `load` on mount, whenever `key` changes and when the screen regains focus.
 * Keeps the last data while reloading (no flicker); `refresh` is for pull-to-refresh.
 */
export function useLoader<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const req = useRef(0);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++req.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const value = await loadRef.current();
      if (id !== req.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      setError(errorMessage(e));
    } finally {
      if (id === req.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Initial load and reload when `key` changes (state is only set in the promise callbacks).
  useEffect(() => {
    const id = ++req.current;
    loadRef.current().then(
      (value) => {
        if (id !== req.current) return;
        setData(value);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (id !== req.current) return;
        setError(errorMessage(e));
        setLoading(false);
      },
    );
  }, [key]);

  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void run('silent');
    }, [run]),
  );

  return {
    data,
    loading: loading && data === null,
    refreshing,
    error,
    refresh: useCallback(() => run('refresh'), [run]),
    reload: useCallback(() => run('silent'), [run]),
  };
}

/** Moderators: disputed scrims, oldest first. */
export async function fetchDisputedScrims(): Promise<Scrim[]> {
  const { data, error } = await supabase.from('scrims').select(SCRIM_SELECT).eq('status', 'disputed').order('scheduled_at', { ascending: true }).limit(50);
  if (error) throw error;
  return (data ?? []) as Scrim[];
}

/** My pending invite to one team, if any (shown on the team page when I'm not a member yet). */
export async function fetchMyInviteForTeam(myId: string, teamId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('id')
    .eq('team_id', teamId)
    .eq('profile_id', myId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null) ?? null;
}

/**
 * Calls `onChange` when this scrim or its requests change (realtime), and every `pollMs` as a
 * fallback (realtime can drop on mobile networks). Returns an unsubscribe function.
 */
export function watchScrim(scrimId: string, onChange: () => void, pollMs = 30_000): () => void {
  const channel = supabase
    .channel(`scrim-${scrimId}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scrims', filter: `id=eq.${scrimId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scrim_requests', filter: `scrim_id=eq.${scrimId}` }, onChange)
    .subscribe();
  const timer = setInterval(onChange, pollMs);
  return () => {
    clearInterval(timer);
    void supabase.removeChannel(channel);
  };
}

/** Featured scrims that are still upcoming or playing now (newest feature first). */
export async function fetchFeaturedScrims(): Promise<Scrim[]> {
  const since = new Date(Date.now() - 4 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('scrims')
    .select(SCRIM_SELECT)
    .not('featured_at', 'is', null)
    .in('status', ['open', 'booked', 'completed'])
    .gte('scheduled_at', since)
    .order('featured_at', { ascending: false })
    .limit(3);
  // Older databases without 0015 have no featured_at column: just show nothing.
  if (error) return [];
  return (data ?? []) as Scrim[];
}
