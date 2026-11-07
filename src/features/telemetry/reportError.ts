// Crash / error reporting into the `app_errors` table (no third-party services).
// Best-effort: never throws, never awaits anything the caller depends on.
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { AppErrorReport } from '../../lib/types';

/** At most this many reports per app session (JS runtime lifetime). */
const MAX_REPORTS_PER_SESSION = 10;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

let sent = 0;
const seenMessages = new Set<string>();
/** Guards against an error thrown synchronously while building a report being reported again. */
let reporting = false;

export interface ReportErrorOptions {
  /** Where it happened (screen, action, component stack…). Keep it small and free of personal data. */
  context?: Record<string, unknown>;
  isFatal?: boolean;
}

/** "1.2.0 (34)" from the native build, falling back to app.json's version. */
export function appVersion(): string | null {
  try {
    const native = Application.nativeApplicationVersion;
    const build = Application.nativeBuildVersion;
    if (native) return build ? `${native} (${build})` : native;
    return Constants.expoConfig?.version ?? null;
  } catch {
    return null;
  }
}

function platform(): AppErrorReport['platform'] {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
}

function toMessageAndStack(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: `${error.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error.message || 'Unknown error'}`, stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { message: error, stack: null };
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    const e = error as { message: string; stack?: unknown };
    return { message: e.message, stack: typeof e.stack === 'string' ? e.stack : null };
  }
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

function safeContext(context: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!context) return null;
  try {
    // Drop anything that can't be serialised (functions, cycles).
    const json = JSON.stringify(context);
    if (!json) return null;
    return JSON.parse(json.length > 2000 ? JSON.stringify({ truncated: json.slice(0, 2000) }) : json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Report an error to `app_errors`. Throttled to 10 per session and deduped by message.
 * Never throws; safe to call from global handlers and catch blocks.
 */
export function reportError(error: unknown, { context, isFatal = false }: ReportErrorOptions = {}): void {
  if (!isSupabaseConfigured || reporting) return;
  reporting = true;
  try {
    const { message: rawMessage, stack } = toMessageAndStack(error);
    const message = (rawMessage || 'Unknown error').slice(0, MAX_MESSAGE);
    if (seenMessages.has(message) || sent >= MAX_REPORTS_PER_SESSION) return;
    seenMessages.add(message);
    sent += 1;

    const row: AppErrorReport = {
      message,
      stack: stack ? stack.slice(0, MAX_STACK) : null,
      context: safeContext(context),
      app_version: appVersion(),
      platform: platform(),
      is_fatal: isFatal,
    };

    void (async () => {
      try {
        // getSession reads the stored session; it does not hit the network.
        const { data } = await supabase.auth.getSession();
        const profileId = data.session?.user.id ?? null;
        const { error: insertError } = await supabase.from('app_errors').insert({ ...row, profile_id: profileId });
        // A signed-in player without a profile row yet (mid-onboarding) may fail a profiles FK: retry anonymously.
        if (insertError && profileId) await supabase.from('app_errors').insert({ ...row, profile_id: null });
      } catch {
        // best-effort: swallow
      }
    })().catch(() => undefined);
  } catch {
    // never throw from the reporter
  } finally {
    reporting = false;
  }
}
