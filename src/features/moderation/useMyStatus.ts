// Shared ban / moderator status for the signed-in player (rpc get_my_status).
// One module-level store, so every screen sees the same value and one refresh updates all.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured, registerBanHooks, supabase } from '../../lib/supabase';
import type { MyStatus } from '../../lib/types';

const NOT_BANNED: MyStatus = { banned_until: null, is_moderator: false };
/** Many components refresh on the same focus / foreground event: collapse them. */
const MIN_REFRESH_GAP_MS = 5000;

interface StatusSnapshot {
  status: MyStatus;
  /** true once a response (or error) has come back for the current user. */
  loaded: boolean;
}

let snapshot: StatusSnapshot = { status: NOT_BANNED, loaded: false };
let currentUid: string | null = null;
let lastFetchAt = 0;
let inFlight: Promise<void> | null = null;
let authWired = false;
const listeners = new Set<() => void>();

function publish(next: StatusSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function parseStatus(data: unknown): MyStatus {
  // Accept either the object itself or a one-row array (SETOF / TABLE return types).
  const row = (Array.isArray(data) ? data[0] : data) as Partial<MyStatus> | null | undefined;
  if (!row || typeof row !== 'object') return NOT_BANNED;
  return {
    banned_until: typeof row.banned_until === 'string' ? row.banned_until : null,
    is_moderator: row.is_moderator === true,
  };
}

async function fetchStatus(force: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetchAt < MIN_REFRESH_GAP_MS) return;
  inFlight = (async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      if (uid !== currentUid) {
        currentUid = uid;
        publish({ status: NOT_BANNED, loaded: false });
      }
      if (!uid) {
        publish({ status: NOT_BANNED, loaded: true });
        return;
      }
      const { data, error } = await supabase.rpc('get_my_status');
      if (currentUid !== uid) return; // switched meanwhile
      lastFetchAt = Date.now();
      // Errors count as "not banned, not a moderator" so nobody gets locked out by a hiccup.
      publish({ status: error ? NOT_BANNED : parseStatus(data), loaded: true });
    } catch {
      publish({ status: NOT_BANNED, loaded: true });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function wireAuth() {
  if (authWired || !isSupabaseConfigured) return;
  authWired = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null;
    if (uid === currentUid) return;
    // Defer so the RPC doesn't run inside the auth callback.
    // Wait for any fetch still running for the previous user, then fetch for the new one.
    setTimeout(() => void (inFlight ?? Promise.resolve()).then(() => fetchStatus(true)), 0);
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void fetchStatus(false);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

/** Force a refresh now (e.g. after a moderator action on yourself, or pull-to-refresh). */
export function refreshMyStatus(): Promise<void> {
  return fetchStatus(true);
}

export function isBannedNow(status: MyStatus, now: number = Date.now()): boolean {
  if (!status.banned_until) return false;
  const until = Date.parse(status.banned_until);
  return Number.isFinite(until) && until > now;
}

// Lets errorMessage() say "Your account is paused" for RLS refusals, and re-check the ban.
registerBanHooks({
  isBanned: () => isBannedNow(snapshot.status),
  refresh: () => void fetchStatus(true),
});

export interface MyStatusState {
  status: MyStatus;
  /** Ban is active right now. Composers / host buttons should be disabled. */
  banned: boolean;
  bannedUntil: string | null;
  isModerator: boolean;
  /** false until the first answer for the signed-in player is in. */
  loaded: boolean;
  refresh: () => Promise<void>;
}

/**
 * The signed-in player's ban / moderator status. Refreshes on screen focus and when the app
 * returns to the foreground. Must be used inside a navigator screen (uses useFocusEffect).
 * Errors are treated as not banned / not a moderator.
 */
export function useMyStatus(): MyStatusState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    wireAuth();
    void fetchStatus(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchStatus(false);
    }, []),
  );

  const banned = isBannedNow(snap.status);
  return {
    status: snap.status,
    banned,
    bannedUntil: banned ? snap.status.banned_until : null,
    isModerator: snap.status.is_moderator,
    loaded: snap.loaded,
    refresh: refreshMyStatus,
  };
}
