// Party data layer: get_my_party + the party RPCs from docs/CLIPS_AND_PARTY.md, incoming
// invites (party_invites rows sent to me) and a hook that keeps both fresh (realtime + focus).
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchProfiles, unknownProfile } from '../chat/useConversation';
import { isPartyUnavailable, normaliseParty, partyErrorMessage } from './logic';
import type { IncomingPartyInvite, Party } from './types';

/** Calls an RPC and throws the raw PostgREST error (partyErrorMessage reads its code). */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

// ── Reads ───────────────────────────────────────────────────────────────────
export async function fetchMyParty(): Promise<Party | null> {
  return normaliseParty(await rpc<unknown>('get_my_party'));
}

/** Pending, unexpired invites sent to me, with the sender's profile. */
export async function fetchIncomingPartyInvites(myId: string): Promise<IncomingPartyInvite[]> {
  const { data, error } = await supabase
    .from('party_invites')
    .select('id, party_id, from_id, created_at, expires_at')
    .eq('to_id', myId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  const rows = (data ?? []) as Omit<IncomingPartyInvite, 'from'>[];
  if (rows.length === 0) return [];
  const profiles = await fetchProfiles([...new Set(rows.map((r) => r.from_id))]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, from: byId.get(r.from_id) ?? unknownProfile(r.from_id) }));
}

// ── Writes (all through RPCs) ───────────────────────────────────────────────
export const inviteToParty = (profileId: string) => rpc<string>('invite_to_party', { p_profile_id: profileId });
export const respondPartyInvite = (inviteId: string, accept: boolean) => rpc<void>('respond_party_invite', { p_invite_id: inviteId, p_accept: accept });
export const leaveParty = () => rpc<void>('leave_party');
export const removePartyMember = (profileId: string) => rpc<void>('remove_party_member', { p_profile_id: profileId });
export const setPartyReady = (ready: boolean) => rpc<void>('set_party_ready', { p_ready: ready });
export const cancelPartyInvite = (inviteId: string) => rpc<void>('cancel_party_invite', { p_invite_id: inviteId });

// ── Hook ────────────────────────────────────────────────────────────────────
/** Realtime bursts (e.g. accept = invite update + member insert) collapse into one reload. */
const RELOAD_DEBOUNCE_MS = 300;

export interface PartyState {
  party: Party | null;
  incoming: IncomingPartyInvite[];
  loading: boolean;
  /** Friendly error text (null when fine). */
  error: string | null;
  /** The party RPCs aren't deployed on this database yet. */
  unavailable: boolean;
  reload: () => Promise<void>;
  /** Optimistic local update (e.g. toggling ready); the next reload replaces it. */
  patch: (fn: (p: Party | null) => Party | null) => void;
}

/**
 * My party and my incoming invites. Loads on mount, refetches on focus, and refreshes on
 * realtime changes to party_members / party_invites (RLS limits rows to ones I can see).
 */
export function useParty(myId: string | null | undefined): PartyState {
  const [party, setParty] = useState<Party | null>(null);
  const [incoming, setIncoming] = useState<IncomingPartyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    if (!myId) return;
    const id = ++req.current;
    const [p, inv] = await Promise.allSettled([fetchMyParty(), fetchIncomingPartyInvites(myId)]);
    if (id !== req.current) return;
    if (p.status === 'fulfilled') {
      setParty(p.value);
      setError(null);
      setUnavailable(false);
    } else {
      setUnavailable(isPartyUnavailable(p.reason));
      setError(partyErrorMessage(p.reason));
    }
    // Incoming invites are an extra: keep the last list when that read fails.
    if (inv.status === 'fulfilled') setIncoming(inv.value);
    setLoading(false);
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    // Defer so state is only set from the async callback.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [myId, load]);

  // Refetch on focus (skip the first: the mount load covers it).
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void load();
    }, [load]),
  );

  // Realtime, filtered to rows that concern me (DELETE events aren't checked against RLS, so an
  // unfiltered channel would hear every party's deletes): my party's members and invites, my
  // own membership row (being added to / removed from a party) and invites sent to me.
  // Resubscribes when my party changes; bursts of events cause one reload.
  const partyId = party?.party_id ?? null;
  useEffect(() => {
    if (!myId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, RELOAD_DEBOUNCE_MS);
    };
    let channel = supabase
      .channel(`party:${myId}:${partyId ?? 'solo'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members', filter: `profile_id=eq.${myId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_invites', filter: `to_id=eq.${myId}` }, bump);
    if (partyId) {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members', filter: `party_id=eq.${partyId}` }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_invites', filter: `party_id=eq.${partyId}` }, bump);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [myId, partyId, load]);

  const patch = useCallback((fn: (p: Party | null) => Party | null) => setParty((p) => fn(p)), []);

  return { party, incoming, loading: loading && !!myId, error, unavailable, reload: load, patch };
}
