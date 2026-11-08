import type { Game, GameCategory } from '../../lib/types';

/** Steam's store header image (460×215) for an app id. */
export function steamHeaderUrl(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

/** Best artwork for a game: self-hosted logo, then Steam header, else null (use the emoji). */
export function gameArtUrl(game: Pick<Game, 'logo_url' | 'steam_appid'> | undefined): string | null {
  if (!game) return null;
  if (game.logo_url) return game.logo_url;
  return game.steam_appid ? steamHeaderUrl(game.steam_appid) : null;
}

export const CATEGORY_ORDER: readonly GameCategory[] = ['competitive', 'casual', 'story'];

/**
 * A game's category, defaulting to 'competitive' when it's missing or unknown
 * (e.g. the app talking to a database that hasn't run the category migration yet).
 */
export function gameCategory(game: { category?: unknown } | null | undefined): GameCategory {
  const c = game?.category;
  return typeof c === 'string' && (CATEGORY_ORDER as readonly string[]).includes(c) ? (c as GameCategory) : 'competitive';
}

/** Whether a game gets LFG / Squad Finder. Missing (older database) counts as yes. */
export function isSquadable(game: { squadable?: unknown } | null | undefined): boolean {
  return game?.squadable !== false;
}

/** Games grouped by category in display order; empty groups are left out. */
export function groupByCategory<T extends { category?: unknown }>(games: readonly T[]): { category: GameCategory; games: T[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, games: games.filter((g) => gameCategory(g) === category) })).filter(
    (g) => g.games.length > 0,
  );
}
