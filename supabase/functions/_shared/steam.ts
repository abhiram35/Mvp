// Pure helpers for the steam-link Edge Function (no imports, no I/O, easy to test).
// Keep this file free of Deno APIs and `npm:` imports: the app's Jest tests load it.

export const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
export const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const OPENID_KEY_RE = /^openid\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;
const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// deno-lint-ignore no-control-regex -- matching control characters is the point
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;
// deno-lint-ignore no-control-regex -- matching control characters is the point
const URL_UNSAFE_RE = /[\u0000- \u007f-\u009f"'<>\\`]/;

/** Fields Steam must have signed for us to trust the assertion. */
export const REQUIRED_SIGNED_FIELDS = [
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'assoc_handle',
] as const;

/** Callback URLs longer than this are rejected outright. */
export const MAX_CALLBACK_URL_LENGTH = 8192;
/** A real Steam assertion has ~11 openid.* fields. */
const MAX_OPENID_PARAMS = 32;

/** How many games (by playtime) we store per player. */
export const MAX_STORED_GAMES = 60;
export const MAX_PERSONA_NAME_LENGTH = 64;
const MAX_STORED_URL_LENGTH = 1000;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Only our own app schemes may receive the result. */
export function isAllowedRedirect(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 500 && /^(gg|exp|exps):\/\/[^\s]*$/.test(url);
}

/** The exact return_to we send to Steam and expect back. */
export function callbackReturnTo(callbackBase: string, nonce: string): string {
  return `${callbackBase}?nonce=${nonce}`;
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
export function steamIdFromClaimedId(claimedId: string | null | undefined): string | null {
  const m = typeof claimedId === 'string' ? CLAIMED_ID_RE.exec(claimedId) : null;
  return m ? m[1] : null;
}

/**
 * The value of a query parameter that must appear exactly once.
 * Returns null when it is missing OR repeated (a repeated key is never trusted).
 */
export function singleParam(params: URLSearchParams, key: string): string | null {
  const all = params.getAll(key);
  return all.length === 1 ? all[0] : null;
}

export type AssertionResult =
  | { ok: true; steamId: string; body: string }
  | { ok: false; reason: 'cancel' | 'invalid' };

/**
 * Strictly validates Steam's OpenID 2.0 callback (positive assertion).
 *
 * Every trusted value is read from ONE single-valued map, and the
 * check_authentication body Steam verifies is built from that same map, so the
 * values we act on are exactly the values Steam signs off on. Any repeated
 * `openid.*` key rejects the whole callback.
 *
 * `url` is the full callback URL; `expectedReturnTo` is `${callbackBase}?nonce=${nonce}`.
 * On success, POST `body` (application/x-www-form-urlencoded) to STEAM_OPENID_URL and
 * require isValidAssertion() on the reply before trusting `steamId`.
 */
export function parseAssertion(url: string, expectedReturnTo: string): AssertionResult {
  const invalid: AssertionResult = { ok: false, reason: 'invalid' };
  if (typeof url !== 'string' || url.length > MAX_CALLBACK_URL_LENGTH) return invalid;
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return invalid;
  }

  const fields = new Map<string, string>();
  const folded = new Set<string>();
  for (const [k, v] of params) {
    if (!k.toLowerCase().startsWith('openid')) continue;
    // Only plain OpenID key names: no spaces, brackets or other characters that some
    // form parsers rewrite (e.g. PHP folds "." / " " / "[" into "_").
    if (!OPENID_KEY_RE.test(k)) return invalid;
    if (fields.has(k)) return invalid; // duplicated key: never guess which one counts
    // Keys that differ only in case or "." vs "_" could alias on another parser.
    const f = k.toLowerCase().replace(/\./g, '_');
    if (folded.has(f)) return invalid;
    folded.add(f);
    fields.set(k, v);
  }
  if (fields.size > MAX_OPENID_PARAMS) return invalid;
  // Other parameters (our own `nonce`) must not be repeated either.
  if (params.getAll('nonce').length > 1) return invalid;

  const get = (k: string) => fields.get(`openid.${k}`);
  const mode = get('mode');
  // A cancel is never trusted for anything: it only ends the attempt.
  if (mode === 'cancel') return { ok: false, reason: 'cancel' };
  if (mode !== 'id_res') return invalid;
  if (get('ns') !== OPENID_NS) return invalid;
  if (get('op_endpoint') !== STEAM_OPENID_URL) return invalid;
  if (get('return_to') !== expectedReturnTo) return invalid;

  const claimedId = get('claimed_id');
  if (claimedId === undefined || claimedId !== get('identity')) return invalid;
  const steamId = steamIdFromClaimedId(claimedId);
  if (!steamId) return invalid;

  for (const k of ['response_nonce', 'assoc_handle', 'sig', 'signed']) {
    if (!get(k)) return invalid;
  }
  const signed = (get('signed') ?? '').split(',');
  if (new Set(signed).size !== signed.length) return invalid;
  for (const f of REQUIRED_SIGNED_FIELDS) if (!signed.includes(f)) return invalid;
  // Every field Steam says it signed must actually be present.
  for (const f of signed) if (!f || !fields.has(`openid.${f}`)) return invalid;

  const body = new URLSearchParams();
  for (const [k, v] of fields) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  return { ok: true, steamId, body: body.toString() };
}

/**
 * Steam's check_authentication reply (key-value form, LF or CRLF line endings).
 * True only with exactly one `is_valid:true` line.
 */
export function isValidAssertion(responseText: string): boolean {
  if (typeof responseText !== 'string') return false;
  let isValid: string | null = null;
  for (const line of responseText.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0 || line.slice(0, i) !== 'is_valid') continue;
    if (isValid !== null) return false; // repeated → don't trust
    isValid = line.slice(i + 1);
  }
  return isValid === 'true';
}

/** Appends `params` to an app URL that may already have a query string. */
export function withQuery(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return url + (url.includes('?') ? '&' : '?') + q;
}

function safeUrl(value: unknown, prefix: string): string | null {
  if (typeof value !== 'string' || value.length > MAX_STORED_URL_LENGTH) return null;
  if (!value.startsWith(prefix) || URL_UNSAFE_RE.test(value)) return null;
  return value;
}

/** A Steam profile link we are willing to store/show, else null. */
export function safeProfileUrl(value: unknown): string | null {
  return safeUrl(value, 'https://steamcommunity.com/');
}

/** An avatar image URL we are willing to store/show (https only), else null. */
export function safeAvatarUrl(value: unknown): string | null {
  return safeUrl(value, 'https://');
}

/** Persona name without control characters, at most 64 characters, else null. */
export function cleanPersonaName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = Array.from(value.replace(CONTROL_RE, '')).slice(0, MAX_PERSONA_NAME_LENGTH).join('').trim();
  return name || null;
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
    const name = typeof o.name === 'string' ? Array.from(o.name.replace(CONTROL_RE, '')).slice(0, 120).join('') : '';
    out.push({
      appid: o.appid,
      name: name || `App ${o.appid}`,
      playtime_hours: Math.round((minutes / 60) * 10) / 10,
    });
  }
  out.sort((a, b) => b.playtime_hours - a.playtime_hours || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}
