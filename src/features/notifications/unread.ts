// Tiny shared store for the unread notification count (bell badges, app icon badge).
// NotificationsBridge keeps it fresh (realtime + app foreground); screens read it with
// useUnreadNotifications() and may adjust it optimistically after marking rows read.
import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from '../../lib/supabase';

let count = 0;
let loadedOnce = false;
let inflight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return count;
}

/** Set the count directly (optimistic updates, sign-out). */
export function setUnreadCount(next: number) {
  const n = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
  if (n === count) return;
  count = n;
  emit();
}

/** Lower the count by `by` (e.g. after marking one notification read). */
export function decrementUnread(by = 1) {
  setUnreadCount(count - by);
}

/** Forget everything (sign-out). Any request still in flight is ignored. */
export function resetUnread() {
  generation += 1;
  loadedOnce = false;
  inflight = null;
  setUnreadCount(0);
}

/** Re-read the count from the server (count_unread_notifications). Safe to call often. */
export function refreshUnread(): Promise<void> {
  if (inflight) return inflight;
  const gen = generation;
  inflight = (async () => {
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        if (gen === generation) setUnreadCount(0);
        return;
      }
      const { data, error } = await supabase.rpc('count_unread_notifications');
      if (error || gen !== generation) return;
      const raw = Array.isArray(data) ? data[0] : data;
      const n = typeof raw === 'number' ? raw : Number(raw);
      loadedOnce = true;
      setUnreadCount(Number.isFinite(n) ? n : 0);
    } catch {
      // Offline etc. — keep the last known count.
    } finally {
      if (gen === generation) inflight = null;
    }
  })();
  return inflight;
}

export function hasLoadedUnread() {
  return loadedOnce;
}

/** Subscribe to listeners outside React (the bridge uses this for the app icon badge). */
export function onUnreadChange(listener: (n: number) => void): () => void {
  const wrapped = () => listener(count);
  listeners.add(wrapped);
  return () => {
    listeners.delete(wrapped);
  };
}

/** The unread notification count plus a refresh function. */
export function useUnreadNotifications(): { count: number; refresh: () => Promise<void> } {
  const n = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh = useCallback(() => refreshUnread(), []);
  return { count: n, refresh };
}
