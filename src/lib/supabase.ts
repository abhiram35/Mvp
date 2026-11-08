import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Set these in a .env file at the project root (see .env.example).
// EXPO_PUBLIC_ variables are bundled into the app, so only ever put the
// public "anon" key here — never the service_role key.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Only refresh the auth token while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// ── Friendly copy for server refusals ───────────────────────────────────────
// The moderation status store registers itself here (lib must not import features).
let banHooks: { isBanned: () => boolean; refresh: () => void } = { isBanned: () => false, refresh: () => undefined };

/** Called once by features/moderation/useMyStatus. */
export function registerBanHooks(hooks: { isBanned: () => boolean; refresh: () => void }) {
  banHooks = hooks;
}

export const PAUSED_MESSAGE = "Your account is paused, so you can't do that right now. You can still read and browse.";

/** A raw RLS / privilege refusal ("new row violates row-level security policy …"). */
export function isRlsRefusal(err: unknown): boolean {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  const msg = typeof e.message === 'string' ? e.message : '';
  return e.code === '42501' && /row-level security|permission denied/i.test(msg);
}

/**
 * For a raw RLS refusal: the "account paused" copy when the player is banned, else null.
 * Also re-checks the ban status, so the banner appears if a ban started meanwhile.
 */
export function pausedMessageFor(err: unknown): string | null {
  if (!isRlsRefusal(err)) return null;
  banHooks.refresh();
  return banHooks.isBanned() ? PAUSED_MESSAGE : null;
}

/** Turns any Supabase / unknown error into a short message safe to show users. */
export function errorMessage(err: unknown): string {
  if (isRlsRefusal(err)) return pausedMessageFor(err) ?? "You can't do that right now.";
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Something went wrong. Please try again.';
}
