// Pure helpers for the steam-link Edge Function (no imports, no I/O, easy to test).

export const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** How many games (by playtime) we store per player. */
export const MAX_STORED_GAMES = 60;

/** Only our own app schemes may receive the result. */
export function isAllowedRedirect(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 500 && /^(gg|exp|exps):\/\/[^\s]*$/.test(url);
}

/** The Steam sign-in page URL. Steam sends the player back to `returnTo`. */
export function buildSteamLoginUrl(returnTo: string, realm: string): string {
  const q = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_URL}?${q.toString()}`;
}

/** SteamID64 from a claimed_id, or null if it isn't a Steam OpenID identity. */
export function steamIdFromClaimedId(claimedId: string | null): string | null {
  const m = claimedId ? CLAIMED_ID_RE.exec(claimedId) : null;
  return m ? m[1] : null;
}

/** The body Steam needs to confirm that a callback really came from Steam. */
export function checkAuthenticationBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  return body;
}

export function isValidAssertion(responseText: string): boolean {
  return /(^|\n)is_valid\s*:\s*true(\n|$)/.test(responseText);
}

/** Appends `params` to an app URL that may already have a query string. */
export function withQuery(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return url + (url.includes('?') ? '&' : '?') + q;
}

export interface StoredSteamGame {
  appid: number;
  name: string;
  playtime_hours: number;
}

/** Top games by playtime from a GetOwnedGames response (`response.games`). */
export function topGames(raw: unknown, limit = MAX_STORED_GAMES): StoredSteamGame[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredSteamGame[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const o = g as Record<string, unknown>;
    if (typeof o.appid !== 'number' || !Number.isInteger(o.appid) || o.appid <= 0) continue;
    const minutes = typeof o.playtime_forever === 'number' && o.playtime_forever > 0 ? o.playtime_forever : 0;
    out.push({
      appid: o.appid,
      name: typeof o.name === 'string' && o.name ? o.name.slice(0, 120) : `App ${o.appid}`,
      playtime_hours: Math.round((minutes / 60) * 10) / 10,
    });
  }
  out.sort((a, b) => b.playtime_hours - a.playtime_hours || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}
