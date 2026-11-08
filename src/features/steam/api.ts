import { FunctionsHttpError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import type { Game, SteamAccount, SteamGame } from '../../lib/types';

/** The app route Steam sign-in returns to (see src/app/steam-linked.tsx). */
export const STEAM_RETURN_PATH = 'steam-linked';

export type SteamLinkResult =
  | { status: 'linked' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const REASON_MESSAGES: Record<string, string> = {
  expired: 'That took too long. Please try again.',
  invalid: "Steam couldn't confirm the sign-in. Please try again.",
  already_linked: 'That Steam account is already linked to another GG profile.',
  steam_unavailable: 'Steam is not responding right now. Try again in a few minutes.',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Steam linking isn't set up on the server yet.",
  no_profile: 'Finish your profile first.',
  not_linked: 'No Steam account is linked.',
  steam_unavailable: 'Steam is not responding right now. Try again in a few minutes.',
  unauthorized: 'Please sign in again.',
};

async function invokeSteam<T>(body: Record<string, unknown>): Promise<T> {
  const res = await supabase.functions.invoke('steam-link', { body });
  if (res.error) {
    let code = '';
    if (res.error instanceof FunctionsHttpError) {
      try {
        const j = (await (res.error.context as Response).json()) as { error?: unknown };
        code = typeof j?.error === 'string' ? j.error : '';
      } catch {
        code = '';
      }
    }
    throw new Error(ERROR_MESSAGES[code] ?? "Couldn't reach the server. Check your connection.");
  }
  return res.data as T;
}

/** Reads ?steam=…&reason=… from the URL Steam sign-in returned to. */
export function parseSteamReturn(url: string): SteamLinkResult {
  const { queryParams } = Linking.parse(url);
  const steam = typeof queryParams?.steam === 'string' ? queryParams.steam : '';
  if (steam === 'linked') return { status: 'linked' };
  if (steam === 'cancel') return { status: 'cancelled' };
  const reason = typeof queryParams?.reason === 'string' ? queryParams.reason : '';
  return { status: 'error', message: REASON_MESSAGES[reason] ?? 'Something went wrong. Please try again.' };
}

/** Opens "Sign in through Steam" and waits for it to come back to the app. */
export async function linkSteam(): Promise<SteamLinkResult> {
  const redirect = Linking.createURL(STEAM_RETURN_PATH);
  const { url } = await invokeSteam<{ url: string }>({ action: 'start', redirect_to: redirect });
  const res = await WebBrowser.openAuthSessionAsync(url, redirect);
  if (res.type !== 'success') return { status: 'cancelled' };
  return parseSteamReturn(res.url);
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
