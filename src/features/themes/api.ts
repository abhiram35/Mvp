// Custom AI themes: generate (Edge Function), quota (RPC), rename / delete (table).
// See docs/CUSTOM_THEMES.md. The AI key never touches the app — generation runs in the
// generate-theme Edge Function, which validates, saves and counts the theme.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { CustomTheme, ThemeQuota } from '../../lib/types';
import { SPEC_LIMITS, customThemeId, specToAppTheme, validateSpec, type AppTheme } from '../../theme';

/** Generation can take a while (the server gives the AI 30 s). */
const GENERATE_TIMEOUT_MS = 60_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "1 Dec" — the reset date shown to players, in India time (resets at 00:00 IST on the 1st). */
export function formatResetDate(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return 'the 1st';
  const d = new Date(ms + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Same clean-up the server applies: trim and collapse whitespace. */
export function cleanPrompt(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function isValidPrompt(raw: string): boolean {
  const p = cleanPrompt(raw);
  return p.length >= SPEC_LIMITS.promptMin && p.length <= SPEC_LIMITS.promptMax;
}

export type ThemeErrorCode =
  | 'invalid_prompt'
  | 'prompt_rejected'
  | 'unauthorized'
  | 'no_profile'
  | 'storage_full'
  | 'invalid_theme'
  | 'quota'
  | 'busy'
  | 'too_many_attempts'
  | 'ai_unavailable'
  | 'not_configured'
  | 'internal'
  | 'network'
  | 'timeout'
  | 'bad_response';

/** A generation failure with a friendly, ready-to-show message. */
export class ThemeGenerationError extends Error {
  readonly code: ThemeErrorCode;
  /** Present when the server sent the player's current quota (429 quota / too_many_attempts, 409). */
  readonly quota: ThemeQuota | null;
  /** true when the attempt may still have gone through (refresh the list and quota). */
  readonly uncertain: boolean;
  constructor(code: ThemeErrorCode, message: string, quota: ThemeQuota | null = null, uncertain = false) {
    super(message);
    this.name = 'ThemeGenerationError';
    this.code = code;
    this.quota = quota;
    this.uncertain = uncertain;
  }
}

function isQuota(v: unknown): v is ThemeQuota {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ThemeQuota).used === 'number' &&
    typeof (v as ThemeQuota).limit === 'number' &&
    typeof (v as ThemeQuota).remaining === 'number'
  );
}

function messageFor(status: number, code: string, quota: ThemeQuota | null): ThemeGenerationError {
  const e = (c: ThemeErrorCode, m: string) => new ThemeGenerationError(c, m, quota);
  switch (code) {
    case 'quota':
      return e('quota', `You've used both AI themes this month. New ones on ${formatResetDate(quota?.resets_at)}.`);
    case 'busy':
      return e('busy', 'Already designing one — give it a moment.');
    case 'too_many_attempts':
      return e('too_many_attempts', 'Too many tries today, try again tomorrow.');
    case 'storage_full':
      return e('storage_full', `You have ${quota?.saved_limit ?? 6} saved themes. Delete one to make room.`);
    case 'invalid_theme':
      return e('invalid_theme', "That one didn't come out readable. Try again — it won't count.");
    case 'prompt_rejected':
      return e('prompt_rejected', "We can't design a theme from that. Try describing a different vibe — it won't count.");
    case 'invalid_prompt':
      return e('invalid_prompt', `Describe your theme in ${SPEC_LIMITS.promptMin}–${SPEC_LIMITS.promptMax} characters.`);
    case 'unauthorized':
      return e('unauthorized', 'Your session has expired. Sign in again to create themes.');
    case 'no_profile':
      return e('no_profile', 'Finish setting up your profile first, then try again.');
    case 'ai_unavailable':
      return e('ai_unavailable', "Our designer is busy right now. Try again in a minute — it won't count.");
    case 'not_configured':
      return e('not_configured', "AI themes aren't switched on yet.");
  }
  // Unknown body: fall back on the status code.
  if (status === 429) return e('quota', `You've used both AI themes this month. New ones on ${formatResetDate(quota?.resets_at)}.`);
  if (status === 409) return e('storage_full', 'You have 6 saved themes. Delete one to make room.');
  if (status === 422) return e('invalid_theme', "That one didn't come out readable. Try again — it won't count.");
  if (status === 401) return e('unauthorized', 'Your session has expired. Sign in again to create themes.');
  if (status === 502 || status === 504) return e('ai_unavailable', "Our designer is busy right now. Try again in a minute — it won't count.");
  return new ThemeGenerationError('internal', 'Something went wrong on our side. Try again in a minute.', quota, true);
}

async function toGenerationError(err: unknown): Promise<ThemeGenerationError> {
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response | undefined;
    const status = typeof res?.status === 'number' ? res.status : 0;
    let body: { error?: unknown; quota?: unknown } = {};
    try {
      if (res && typeof res.json === 'function') body = ((await res.json()) ?? {}) as typeof body;
    } catch {
      body = {};
    }
    return messageFor(status, typeof body.error === 'string' ? body.error : '', isQuota(body.quota) ? body.quota : null);
  }
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  const ctxName =
    err instanceof FunctionsFetchError && err.context && typeof err.context === 'object' && 'name' in err.context
      ? String((err.context as { name: unknown }).name)
      : '';
  if (name === 'AbortError' || name === 'TimeoutError' || ctxName === 'AbortError' || ctxName === 'TimeoutError') {
    return new ThemeGenerationError(
      'timeout',
      "That took too long. Check your connection — if it went through, it'll show up in Your themes.",
      null,
      true,
    );
  }
  if (err instanceof FunctionsFetchError || err instanceof FunctionsRelayError) {
    return new ThemeGenerationError('network', "Couldn't reach GG. Check your connection and try again.", null, true);
  }
  return new ThemeGenerationError('network', "Couldn't reach GG. Check your connection and try again.", null, true);
}

export interface GeneratedTheme {
  theme: AppTheme;
  quota: ThemeQuota | null;
}

/**
 * Asks the AI designer for a theme. On success the theme is ALREADY saved to the
 * player's custom_themes and counted against this month's quota. Throws
 * ThemeGenerationError with a friendly message otherwise.
 */
export async function generateTheme(prompt: string): Promise<GeneratedTheme> {
  const clean = cleanPrompt(prompt);
  if (!isValidPrompt(clean)) throw messageFor(400, 'invalid_prompt', null);
  let data: unknown;
  try {
    const res = await supabase.functions.invoke('generate-theme', { body: { prompt: clean }, timeout: GENERATE_TIMEOUT_MS });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw await toGenerationError(err);
  }
  const body = (typeof data === 'string' ? safeJson(data) : data) as { theme?: Partial<CustomTheme>; quota?: unknown } | null;
  const row = body?.theme;
  const spec = row ? validateSpec(row.spec) : null;
  if (!row || typeof row.id !== 'string' || !spec) {
    throw new ThemeGenerationError('bad_response', 'Your theme was made but this version of GG can’t show it. Update the app and check Your themes.', null, true);
  }
  return {
    theme: specToAppTheme(spec, customThemeId(row.id), typeof row.name === 'string' ? row.name : spec.name),
    quota: isQuota(body?.quota) ? body.quota : null,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Renames a saved theme (owner only; 2–24 chars). Returns the trimmed name. */
export async function renameTheme(rowId: string, name: string): Promise<string> {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length < SPEC_LIMITS.nameMin || clean.length > SPEC_LIMITS.nameMax) {
    throw new Error(`Names are ${SPEC_LIMITS.nameMin}–${SPEC_LIMITS.nameMax} characters.`);
  }
  const { data, error } = await supabase.from('custom_themes').update({ name: clean }).eq('id', rowId).select('id').maybeSingle();
  if (error) throw new Error(errorMessage(error));
  if (!data) throw new Error("Couldn't find that theme. Pull to refresh and try again.");
  return clean;
}

/** Deletes a saved theme. Does not refund this month's quota. */
export async function deleteTheme(rowId: string): Promise<void> {
  const { error } = await supabase.from('custom_themes').delete().eq('id', rowId);
  if (error) throw new Error(errorMessage(error));
}

type QuotaResult = { quota: ThemeQuota } | { error: string };

async function fetchThemeQuota(): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc('get_theme_quota');
  if (error) return { error: errorMessage(error) };
  return isQuota(data) ? { quota: data } : { error: "Couldn't load your AI theme allowance." };
}

/** The player's AI theme quota for this IST month. */
export function useThemeQuota() {
  const [quota, setQuota] = useState<ThemeQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const apply = useCallback((r: QuotaResult) => {
    if (!mounted.current) return;
    if ('quota' in r) {
      setQuota(r.quota);
      setError(null);
    } else setError(r.error);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    apply(await fetchThemeQuota().catch((e: unknown) => ({ error: errorMessage(e) })));
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    fetchThemeQuota().then(apply, (e: unknown) => apply({ error: errorMessage(e) }));
    return () => {
      mounted.current = false;
    };
  }, [apply]);

  return { quota, loading, error, refresh, setQuota };
}
