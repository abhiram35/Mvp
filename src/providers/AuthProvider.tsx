import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AuthState {
  /** true until the stored session (and profile, if any) has been loaded */
  initializing: boolean;
  session: Session | null;
  /** null when signed out OR when signed in but onboarding is not finished */
  profile: Profile | null;
  /** Re-fetch the current user's profile row (call after onboarding / edits). */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface Snapshot {
  session: Session | null;
  profile: Profile | null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  // On error treat as "no profile" so the app never hangs on a spinner; onboarding's
  // createProfile falls back to an update if the row actually exists.
  if (error) return null;
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = still loading the stored session. Session and profile are published
  // together, so the router guard never sees "signed in, no profile" for a user who
  // already has one (which would flash onboarding).
  const [snap, setSnap] = useState<Snapshot | undefined>(isSupabaseConfigured ? undefined : { session: null, profile: null });
  const currentUserId = useRef<string | null>(null);
  const latestSession = useRef<Session | null>(null);
  /** The user id whose profile has finished loading into `snap`. */
  const readyFor = useRef<string | null>(null);

  /** Publish a new session, loading its profile first when the user changed. */
  const applySession = useCallback(async (next: Session | null) => {
    const uid = next?.user.id ?? null;
    const changedUser = uid !== currentUserId.current;
    currentUserId.current = uid;
    latestSession.current = next;
    if (!uid) {
      readyFor.current = null;
      setSnap({ session: null, profile: null });
      return;
    }
    if (!changedUser) {
      // Token refresh / duplicate event: swap the session, keep the profile. If the
      // profile is still loading, the pending load publishes latestSession itself.
      if (readyFor.current === uid) setSnap((prev) => ({ session: next, profile: prev?.profile ?? null }));
      return;
    }
    readyFor.current = null;
    const profile = await fetchProfile(uid);
    if (currentUserId.current !== uid) return; // signed out / switched meanwhile
    readyFor.current = uid;
    setSnap({ session: latestSession.current, profile });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) void applySession(data.session);
      })
      .catch(() => {
        if (active) void applySession(null);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Defer so the profile query doesn't run inside the auth callback.
      setTimeout(() => {
        if (active) void applySession(next);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    const uid = currentUserId.current;
    if (!uid) return;
    const profile = await fetchProfile(uid);
    if (currentUserId.current !== uid) return;
    setSnap((prev) => (prev ? { ...prev, profile } : prev));
  }, []);

  const signOut = useCallback(async () => {
    // Sign out locally even if the network request fails.
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      initializing: snap === undefined,
      session: snap?.session ?? null,
      profile: snap?.profile ?? null,
      refreshProfile,
      signOut,
    }),
    [snap, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Convenience: the signed-in user's id. Only use on screens behind the signed-in guard. */
export function useUserId(): string {
  const { session } = useAuth();
  return session?.user.id ?? '';
}
