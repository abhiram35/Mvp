import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import type { Game, SteamAccount, SteamGame } from '../../lib/types';
import { createAttemptClaim, createOnce, minutesLeft, readSteamParams, type SteamReturn } from './linkFlow';

/** The app route Steam sign-in returns to (see src/app/steam-linked.tsx). */
export const STEAM_RETURN_PATH = 'steam-linked';

/** Steam linking needs the in-app browser + app deep link, so it's off on web. */
export const STEAM_LINK_SUPPORTED = Platform.OS !== 'web';

export type SteamLinkResult =
  | { status: 'linked' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  /** Steam verified the sign-in; the app still has to call `complete` with this code. */
  | { status: 'verified'; code: string };

const GENERIC_SERVER = 'Something went wrong on our side. Please try again in a moment.';
const OFFLINE = "Couldn't reach the server. Check your connection.";

/** Redirect reasons (…?steam=error&reason=…). */
export const REASON_MESSAGES: Record<string, string> = {
  expired: 'That took too long. Please try again.',
  invalid: "Steam couldn't confirm the sign-in. Please try again.",
  already_linked: 'That Steam account is already linked to another GG profile.',
  steam_unavailable: 'Steam is not responding right now. Try again in a few minutes.',
  internal: GENERIC_SERVER,
};

/** Edge Function error codes ({ error: code }). */
export const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Please sign in again.',
  no_profile: 'Finish your profile first.',
  not_linked: 'No Steam account is linked any more. Link it again.',
  invalid_request: 'Something went wrong with that request. Please try again.',
  invalid_code: 'That Steam sign-in expired or was already used. Please try again.',
  already_linked: 'That Steam account is already linked to another GG profile.',
  steam_unavailable: 'Steam is not responding right now. Try again in a few minutes.',
  not_configured: "Steam linking isn't set up on the server yet.",
  internal: GENERIC_SERVER,
  method_not_allowed: 'This version of GG is out of date. Please update the app.',
};

/** An error from the steam-link Edge Function, already turned into friendly copy. */
export class SteamApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

/** Friendly copy for an Edge Function error code (and its JSON body, for too_soon). */
export function steamErrorMessage(code: string, body?: Record<string, unknown> | null): string {
  if (code === 'too_soon') {
    const m = minutesLeft(body?.retry_after_seconds);
    return `Steam was refreshed recently. Try again in ${m} ${m === 1 ? 'minute' : 'minutes'}.`;
  }
  return ERROR_MESSAGES[code] ?? GENERIC_SERVER;
}

/** Turns a functions.invoke error into a SteamApiError with friendly copy. */
export async function toSteamError(err: unknown): Promise<SteamApiError> {
  if (err instanceof FunctionsHttpError) {
    let body: Record<string, unknown> | null = null;
    try {
      const json: unknown = await (err.context as Response).json();
      body = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    const code = typeof body?.error === 'string' ? body.error : '';
    return new SteamApiError(steamErrorMessage(code, body), code || 'http');
  }
  if (err instanceof FunctionsRelayError) return new SteamApiError(GENERIC_SERVER, 'relay');
  if (err instanceof FunctionsFetchError) return new SteamApiError(OFFLINE, 'network');
  return new SteamApiError(OFFLINE, 'network');
}

async function invokeSteam<T>(body: Record<string, unknown>): Promise<T> {
  let res: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    res = await supabase.functions.invoke('steam-link', { body });
  } catch (e) {
    throw await toSteamError(e);
  }
  if (res.error) throw await toSteamError(res.error);
  return res.data as T;
}

/** Maps a parsed redirect to a result (without completing it). */
export function steamReturnToResult(ret: SteamReturn): SteamLinkResult {
  switch (ret.kind) {
    case 'verified':
      return { status: 'verified', code: ret.code };
    case 'linked':
      return { status: 'linked' };
    case 'cancel':
    case 'none':
      return { status: 'cancelled' };
    case 'error':
      return { status: 'error', message: REASON_MESSAGES[ret.reason] ?? 'Something went wrong. Please try again.' };
  }
}

/** Reads ?steam=…&code=…&reason=… from the URL Steam sign-in returned to. */
export function parseSteamReturn(url: string): SteamLinkResult {
  const { queryParams } = Linking.parse(url);
  return steamReturnToResult(readSteamParams(queryParams));
}

// ── Completion (shared by the browser result and the /steam-linked route) ────
const completeOnce = createOnce<SteamLinkResult>();
const attempts = createAttemptClaim();
const listeners = new Set<() => void>();

/** Listen for "the linked Steam account may have changed" (used by the Steam card). */
export function subscribeSteamChanges(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifySteamChanged(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      // a listener must never break the others
    }
  }
}

/**
 * Exchanges a completion code for the link. Each code is sent at most once, however many
 * times this is called (both the browser result and the deep-link route may call it).
 */
export function completeSteamLink(code: string): Promise<SteamLinkResult> {
  return completeOnce(code, async () => {
    try {
      await invokeSteam<{ account: SteamAccount }>({ action: 'complete', code });
      return { status: 'linked' } as const;
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : GENERIC_SERVER } as const;
    } finally {
      notifySteamChanged();
    }
  });
}

/** Completes a `verified` result; other results pass through. Never throws. */
export async function finishSteamResult(res: SteamLinkResult): Promise<Exclude<SteamLinkResult, { status: 'verified' }>> {
  if (res.status === 'verified') {
    const done = await completeSteamLink(res.code);
    return done.status === 'verified' ? { status: 'error', message: GENERIC_SERVER } : done;
  }
  return res;
}

/**
 * True for the first caller that reports the outcome of the current link attempt, so the
 * user sees one message even when both the browser result and the route finish it.
 */
export function claimSteamOutcome(): boolean {
  return attempts.claim();
}

/** Opens "Sign in through Steam", waits for it to come back and completes the link. */
export async function linkSteam(): Promise<Exclude<SteamLinkResult, { status: 'verified' }>> {
  if (!STEAM_LINK_SUPPORTED) return { status: 'error', message: 'Link Steam from the GG app on your phone.' };
  attempts.begin();
  const redirect = Linking.createURL(STEAM_RETURN_PATH);
  const { url } = await invokeSteam<{ url: string }>({ action: 'start', redirect_to: redirect });
  const res = await WebBrowser.openAuthSessionAsync(url, redirect);
  // Android may report "dismiss" before the redirect arrives: /steam-linked then finishes the link.
  if (res.type !== 'success') return { status: 'cancelled' };
  return finishSteamResult(parseSteamReturn(res.url));
}

/** Re-fetches the linked account's profile and library from Steam. */
export async function syncSteam(): Promise<SteamAccount> {
  const { account } = await invokeSteam<{ account: SteamAccount }>({ action: 'sync' });
  return account;
}

export async function unlinkSteam(profileId: string): Promise<void> {
  const { error } = await supabase.from('steam_accounts').delete().eq('profile_id', profileId);
  if (error) throw error;
}

/** Adds catalog games to my profile (used for "Add from Steam"). */
export async function addProfileGames(profileId: string, gameIds: string[]): Promise<void> {
  if (!gameIds.length) return;
  const rows = gameIds.map((game_id) => ({ profile_id: profileId, game_id }));
  const { error } = await supabase.from('profile_games').upsert(rows, { onConflict: 'profile_id,game_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Steam games that are also GG catalog games, paired with the catalog entry. */
export function matchCatalog(steamGames: readonly SteamGame[], catalog: readonly Game[]): { steam: SteamGame; game: Game }[] {
  const byAppId = new Map<number, Game>();
  for (const g of catalog) if (g.steam_appid) byAppId.set(g.steam_appid, g);
  const out: { steam: SteamGame; game: Game }[] = [];
  for (const s of steamGames) {
    const game = byAppId.get(s.appid);
    if (game) out.push({ steam: s, game });
  }
  return out;
}

/** "1.2k h", "35 h", "<1 h". */
export function formatHours(h: number): string {
  if (h < 1) return '<1 h';
  if (h >= 1000) return `${(h / 1000).toFixed(1).replace(/\.0$/, '')}k h`;
  return `${Math.round(h)} h`;
}
