// Product events into `app_events` (client may insert only ClientEventName rows for itself).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { BuiltInThemeId, ThemeId } from '../../theme';
import type { ClientEventName } from '../../lib/types';

/**
 * Log a client event for the signed-in player. Best-effort, never throws, no-op when signed out.
 * Keep props tiny and free of personal data.
 */
export function logEvent(name: ClientEventName, props?: Record<string, unknown>): void {
  if (!isSupabaseConfigured) return;
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      await supabase.from('app_events').insert({ profile_id: uid, name, props: props ?? {} });
    } catch {
      // best-effort
    }
  })();
}

/** Call once when onboarding finishes successfully (after the profile row is created). */
export function logOnboardingCompleted(): void {
  logEvent('onboarding_completed');
}

/** Call when the player picks a theme. Custom themes are logged as 'custom' (their ids are private). */
export function logThemeChanged(themeId: ThemeId): void {
  const theme: BuiltInThemeId | 'custom' = themeId.startsWith('custom:') ? 'custom' : (themeId as BuiltInThemeId);
  logEvent('theme_changed', { theme });
}

// ── app_open ────────────────────────────────────────────────────────────────
const APP_OPEN_MIN_GAP_MS = 30 * 60 * 1000;
const LAST_OPEN_KEY = 'gg.telemetry.lastAppOpen';
let lastOpenAt: number | null = null;
let checking = false;

async function maybeLogAppOpen(): Promise<void> {
  if (!isSupabaseConfigured || checking) return;
  checking = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return; // only when signed in
    if (lastOpenAt === null) {
      const stored = await AsyncStorage.getItem(LAST_OPEN_KEY).catch(() => null);
      const n = stored ? Number(stored) : NaN;
      lastOpenAt = Number.isFinite(n) ? n : 0;
    }
    const now = Date.now();
    if (now - lastOpenAt < APP_OPEN_MIN_GAP_MS) return;
    lastOpenAt = now;
    AsyncStorage.setItem(LAST_OPEN_KEY, String(now)).catch(() => undefined);
    logEvent('app_open');
  } catch {
    // best-effort
  } finally {
    checking = false;
  }
}

/**
 * Logs `app_open` on mount, on sign-in, and when the app returns to the foreground — at most once
 * every 30 minutes, and only while signed in. Mount once near the root (inside SafeAreaProvider is fine;
 * it does not need the theme or auth providers).
 */
export function useAppOpenTracking(): void {
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void maybeLogAppOpen();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void maybeLogAppOpen();
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      // Defer so the insert doesn't run inside the auth callback.
      if (event === 'SIGNED_IN') setTimeout(() => void maybeLogAppOpen(), 0);
    });
    return () => {
      appSub.remove();
      authSub.subscription.unsubscribe();
    };
  }, []);
}
