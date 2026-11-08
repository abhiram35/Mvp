// Request handling for the steam-link Edge Function (index.ts wires in env + clients).
// Kept separate from Deno.serve so it can be exercised with a fake client and fetch.

// deno-lint-ignore no-import-prefix -- Supabase's documented style for Edge Functions
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  buildSteamLoginUrl,
  callbackReturnTo,
  cleanPersonaName,
  isAllowedRedirect,
  isUuid,
  isValidAssertion,
  MAX_CALLBACK_URL_LENGTH,
  parseAssertion,
  safeAvatarUrl,
  safeProfileUrl,
  singleParam,
  STEAM_OPENID_URL,
  topGames,
  withQuery,
} from '../_shared/steam.ts';

/** Steam must send the browser back within this time after `start`. */
export const NONCE_TTL_MS = 10 * 60 * 1000;
/** The app must call `complete` within this time after Steam verified the sign-in. */
export const COMPLETE_TTL_MS = 5 * 60 * 1000;
/** Minimum time between two `sync` calls for the same profile. */
export const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const STEAM_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 4096;
const UNIQUE_VIOLATION = '23505';

export interface Deps {
  admin: SupabaseClient;
  steamKey: string;
  /** `${SUPABASE_URL}/functions/v1/steam-link` */
  callbackBase: string;
  /** OpenID realm shown on Steam's sign-in page (the Supabase origin). */
  realm: string;
  /** Resolves the caller's user id from the JWT, or null. */
  getUserId: (token: string) => Promise<string | null>;
  now?: () => number;
}

/** Steam did not answer (timeout, non-2xx, unreadable body). Message never contains a URL. */
class SteamError extends Error {
  override name = 'SteamError';
}

class BodyTooLarge extends Error {}

/** The account was unlinked (or re-linked to another Steam id) while a refresh ran. */
class NotLinked extends Error {}

/** A loggable description of an error that can never contain the Steam API key. */
function describe(e: unknown): string {
  if (e instanceof SteamError) return e.message;
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    return `db ${(e as { code: string }).code}`; // PostgrestError: no URLs, no secrets
  }
  return e instanceof Error ? e.name : 'unknown';
}

/** fetch() against Steam. Errors carry only a status code or the error *name*, never the URL. */
async function steamFetch(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
  } catch (e) {
    throw new SteamError(`steam request failed (${e instanceof Error ? e.name : 'unknown'})`);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new SteamError(`steam status ${res.status}`);
  }
  return res;
}

async function steamJson(url: string): Promise<Record<string, unknown>> {
  const res = await steamFetch(url);
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch (e) {
    throw new SteamError(`steam bad body (${e instanceof Error ? e.name : 'unknown'})`);
  }
}

/**
 * Fetches the public Steam profile + library and stores it.
 * `link`: upsert (the `complete` action). `refresh`: update only the row that is still linked
 * to this Steam id, so an unlink that lands while Steam is being fetched is never undone.
 */
async function syncAccount(deps: Deps, profileId: string, steamId: string, mode: 'link' | 'refresh') {
  const key = encodeURIComponent(deps.steamKey);
  const summaries = await steamJson(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`,
  );
  const players = (summaries.response as { players?: unknown } | undefined)?.players;
  const found = Array.isArray(players) ? players.find((p) => p && p.steamid === steamId) : null;
  const summary: Record<string, unknown> = found && typeof found === 'object' ? found : {};

  // A private library comes back as an empty `response` object.
  const ownedBody = await steamJson(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}` +
      '&include_appinfo=1&include_played_free_games=1&format=json',
  );
  const owned = (ownedBody.response ?? {}) as { games?: unknown; game_count?: unknown };
  const libraryPublic = Array.isArray(owned.games);
  const gameCount = owned.game_count;

  const row = {
    profile_id: profileId,
    steam_id: steamId,
    persona_name: cleanPersonaName(summary.personaname),
    avatar_url: safeAvatarUrl(summary.avatarfull),
    profile_url: safeProfileUrl(summary.profileurl),
    library_public: libraryPublic,
    game_count: libraryPublic && typeof gameCount === 'number' && Number.isInteger(gameCount) && gameCount >= 0
      ? gameCount
      : 0,
    games: libraryPublic ? topGames(owned.games) : [],
    synced_at: new Date(deps.now?.() ?? Date.now()).toISOString(),
  };
  if (mode === 'refresh') {
    const { profile_id: _p, steam_id: _s, ...changes } = row;
    const { data, error } = await deps.admin
      .from('steam_accounts')
      .update(changes)
      .eq('profile_id', profileId)
      .eq('steam_id', steamId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotLinked();
    return data;
  }
  const { data, error } = await deps.admin
    .from('steam_accounts')
    .upsert(row, { onConflict: 'profile_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Is this Steam account linked to a different GG profile? */
async function linkedElsewhere(deps: Deps, steamId: string, profileId: string): Promise<boolean> {
  const { data, error } = await deps.admin
    .from('steam_accounts')
    .select('profile_id')
    .eq('steam_id', steamId)
    .neq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/** Reads at most MAX_BODY_BYTES of the request body. */
async function readBody(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new BodyTooLarge();
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// ── GET: Steam sends the browser back here ───────────────────────────────────
async function handleCallback(req: Request, deps: Deps): Promise<Response> {
  const now = deps.now?.() ?? Date.now();
  if (req.url.length > MAX_CALLBACK_URL_LENGTH) return new Response('Invalid request', { status: 400 });
  const nonce = singleParam(new URL(req.url).searchParams, 'nonce');
  if (!isUuid(nonce)) return new Response('Invalid request', { status: 400 });

  // One-time use: claim the unverified attempt atomically (a second callback with the
  // same nonce finds nothing). verified_at = when Steam came back; the row only becomes
  // completable once steam_id + completion_code are set below.
  const { data: reqRow, error: claimErr } = await deps.admin
    .from('steam_link_requests')
    .update({ verified_at: new Date(now).toISOString() })
    .eq('nonce', nonce)
    .is('verified_at', null)
    .select('nonce, profile_id, redirect_to, created_at')
    .maybeSingle();
  if (claimErr) {
    console.error('steam-link: claim failed', describe(claimErr));
    return new Response('Something went wrong. Try again in GG.', { status: 500 });
  }
  if (!reqRow || !isAllowedRedirect(reqRow.redirect_to)) {
    return new Response('Link expired. Try again in GG.', { status: 400 });
  }

  const back = (q: Record<string, string>) =>
    new Response(null, {
      status: 302,
      headers: { Location: withQuery(reqRow.redirect_to, q), 'Cache-Control': 'no-store' },
    });
  const fail = async (reason: string) => {
    await deps.admin.from('steam_link_requests').delete().eq('nonce', nonce);
    return back(reason === 'cancel' ? { steam: 'cancel' } : { steam: 'error', reason });
  };

  if (now - new Date(reqRow.created_at).getTime() > NONCE_TTL_MS) return fail('expired');

  // Strict OpenID checks; the body sent to Steam is built from the same values we trust.
  const assertion = parseAssertion(req.url, callbackReturnTo(deps.callbackBase, nonce));
  if (!assertion.ok) return fail(assertion.reason);

  try {
    const check = await steamFetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: assertion.body,
    });
    if (!isValidAssertion(await check.text())) return fail('invalid');

    // Early, friendly check. `complete` checks again (authoritative).
    if (await linkedElsewhere(deps, assertion.steamId, reqRow.profile_id)) return fail('already_linked');

    // Verified, but NOT linked yet: only the GG user who started this can complete it.
    const code = crypto.randomUUID();
    const { error: updErr } = await deps.admin
      .from('steam_link_requests')
      .update({ steam_id: assertion.steamId, completion_code: code, verified_at: new Date(now).toISOString() })
      .eq('nonce', nonce);
    if (updErr) throw updErr;
    return back({ steam: 'verified', code });
  } catch (e) {
    console.error('steam-link: callback failed', describe(e));
    return fail(e instanceof SteamError ? 'steam_unavailable' : 'internal');
  }
}

// ── POST actions (JWT) ───────────────────────────────────────────────────────
async function handleStart(deps: Deps, userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!isAllowedRedirect(body.redirect_to)) return json(400, { error: 'invalid_request' });
  const now = deps.now?.() ?? Date.now();
  const { data: profile, error: pErr } = await deps.admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (pErr) throw pErr;
  if (!profile) return json(403, { error: 'no_profile' });

  // Global tidy-up: nothing older than TTL + completion window can still be used.
  await deps.admin
    .from('steam_link_requests')
    .delete()
    .lt('created_at', new Date(now - NONCE_TTL_MS - COMPLETE_TTL_MS).toISOString());

  const { data: row, error } = await deps.admin
    .from('steam_link_requests')
    .insert({ profile_id: userId, redirect_to: body.redirect_to })
    .select('nonce')
    .single();
  if (error || !row) throw error ?? new Error('insert returned nothing');

  // At most one attempt per profile: drop every other row of this caller.
  const { error: delErr } = await deps.admin
    .from('steam_link_requests')
    .delete()
    .eq('profile_id', userId)
    .neq('nonce', row.nonce);
  if (delErr) throw delErr;

  return json(200, { url: buildSteamLoginUrl(callbackReturnTo(deps.callbackBase, row.nonce), deps.realm) });
}

async function handleComplete(deps: Deps, userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!isUuid(body.code)) return json(400, { error: 'invalid_request' });
  const now = deps.now?.() ?? Date.now();

  // Atomic consume: only the profile that started the attempt, only within 5 minutes.
  const { data: row, error } = await deps.admin
    .from('steam_link_requests')
    .delete()
    .eq('completion_code', body.code)
    .eq('profile_id', userId)
    .gt('verified_at', new Date(now - COMPLETE_TTL_MS).toISOString())
    .not('steam_id', 'is', null)
    .select('steam_id')
    .maybeSingle();
  if (error) throw error;
  if (!row?.steam_id) return json(400, { error: 'invalid_code' });

  if (await linkedElsewhere(deps, row.steam_id, userId)) return json(409, { error: 'already_linked' });
  try {
    return json(200, { account: await syncAccount(deps, userId, row.steam_id, 'link') });
  } catch (e) {
    // Lost a race with another profile linking the same Steam account.
    if (isUniqueViolation(e)) return json(409, { error: 'already_linked' });
    throw e;
  }
}

async function handleSync(deps: Deps, userId: string): Promise<Response> {
  const now = deps.now?.() ?? Date.now();
  const cutoff = new Date(now - SYNC_COOLDOWN_MS).toISOString();

  // Claim the sync slot atomically (two parallel syncs can't both pass).
  const { data: claimed, error } = await deps.admin
    .from('steam_accounts')
    .update({ synced_at: new Date(now).toISOString() })
    .eq('profile_id', userId)
    .lt('synced_at', cutoff)
    .select('steam_id')
    .maybeSingle();
  if (error) throw error;

  if (!claimed) {
    const { data: acct, error: aErr } = await deps.admin
      .from('steam_accounts')
      .select('synced_at')
      .eq('profile_id', userId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!acct) return json(404, { error: 'not_linked' });
    const last = new Date(acct.synced_at).getTime();
    const retry = Number.isFinite(last) ? Math.ceil((last + SYNC_COOLDOWN_MS - now) / 1000) : 0;
    return json(429, {
      error: 'too_soon',
      retry_after_seconds: Math.min(Math.max(retry, 1), SYNC_COOLDOWN_MS / 1000),
    });
  }

  try {
    return json(200, { account: await syncAccount(deps, userId, claimed.steam_id, 'refresh') });
  } catch (e) {
    if (e instanceof NotLinked) return json(404, { error: 'not_linked' });
    if (e instanceof SteamError) {
      // Steam was down: don't make the player wait 5 minutes for nothing.
      const reopen = new Date(now - SYNC_COOLDOWN_MS - 1000).toISOString();
      await deps.admin.from('steam_accounts').update({ synced_at: reopen }).eq('profile_id', userId);
    }
    throw e;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method === 'GET') return await handleCallback(req, deps);
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // ── Who is calling? ────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'unauthorized' });
  let userId: string | null = null;
  try {
    userId = await deps.getUserId(token);
  } catch (e) {
    console.error('steam-link: auth check failed', describe(e));
  }
  if (!userId) return json(401, { error: 'unauthorized' });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readBody(req));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { error: 'invalid_request' });
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  try {
    switch (body.action) {
      case 'start':
        return await handleStart(deps, userId, body);
      case 'complete':
        return await handleComplete(deps, userId, body);
      case 'sync':
        return await handleSync(deps, userId);
      default:
        return json(400, { error: 'invalid_request' });
    }
  } catch (e) {
    console.error(`steam-link: ${body.action as string} failed`, describe(e));
    return e instanceof SteamError ? json(502, { error: 'steam_unavailable' }) : json(500, { error: 'internal' });
  }
}
