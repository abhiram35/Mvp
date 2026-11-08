// GG Edge Function: steam-link
// Links a player's Steam account with "Sign in through Steam" (OpenID 2.0) and
// stores their public profile + top games in steam_accounts.
//
// Deploy with --no-verify-jwt: Steam redirects the browser back here without a
// GG login, so this function checks the JWT itself for the POST actions.
//
//   POST { action: "start", redirect_to }  (JWT)  → 200 { url }  open it in a browser
//   POST { action: "sync" }                 (JWT)  → 200 { account } refresh the library
//   GET  ?nonce=…&openid.*                 (Steam) → 302 to redirect_to?steam=linked
//                                                     or ?steam=error&reason=…
// Errors (JSON): 400 invalid_request, 401 unauthorized, 403 no_profile,
//                404 not_linked, 405 method_not_allowed, 500 not_configured, 502 steam_unavailable
// Redirect reasons: expired, invalid, already_linked, steam_unavailable, internal
//
// Secrets: STEAM_API_KEY (https://steamcommunity.com/dev/apikey).
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

// deno-lint-ignore no-import-prefix -- Supabase's documented style for Edge Functions
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  STEAM_OPENID_URL,
  buildSteamLoginUrl,
  checkAuthenticationBody,
  isAllowedRedirect,
  isValidAssertion,
  steamIdFromClaimedId,
  topGames,
  withQuery,
} from '../_shared/steam.ts';

const NONCE_TTL_MS = 10 * 60 * 1000;
const STEAM_TIMEOUT_MS = 10_000;

class SteamError extends Error {}

async function steamFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
    if (!res.ok) throw new SteamError(`steam ${res.status}`);
    return res;
  } catch (e) {
    throw e instanceof SteamError ? e : new SteamError(String(e));
  }
}

/** Fetches the public Steam profile + library and upserts steam_accounts. */
async function syncAccount(admin: SupabaseClient, apiKey: string, profileId: string, steamId: string) {
  const key = encodeURIComponent(apiKey);
  const summaryRes = await steamFetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`,
  );
  const summary = (await summaryRes.json())?.response?.players?.[0] ?? {};

  // A private library comes back as an empty `response` object.
  const gamesRes = await steamFetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}` +
      '&include_appinfo=1&include_played_free_games=1&format=json',
  );
  const owned = (await gamesRes.json())?.response ?? {};
  const libraryPublic = Array.isArray(owned.games);

  const row = {
    profile_id: profileId,
    steam_id: steamId,
    persona_name: typeof summary.personaname === 'string' ? summary.personaname.slice(0, 64) : null,
    avatar_url: typeof summary.avatarfull === 'string' ? summary.avatarfull : null,
    profile_url: typeof summary.profileurl === 'string' ? summary.profileurl : null,
    library_public: libraryPublic,
    game_count: libraryPublic && typeof owned.game_count === 'number' ? owned.game_count : 0,
    games: libraryPublic ? topGames(owned.games) : [],
    synced_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from('steam_accounts').upsert(row, { onConflict: 'profile_id' }).select().single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey;
  const steamKey = Deno.env.get('STEAM_API_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey || !steamKey) {
    console.error('steam-link: missing env (STEAM_API_KEY or Supabase)');
    return json(500, { error: 'not_configured' });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const callbackBase = `${supabaseUrl}/functions/v1/steam-link`;

  // ── Steam sends the browser back here ──────────────────────────────────────
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    const nonce = params.get('nonce') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(nonce)) return new Response('Invalid request', { status: 400 });

    // One-time use: delete and read in one step.
    const { data: reqRow } = await admin.from('steam_link_requests').delete().eq('nonce', nonce).select().maybeSingle();
    if (!reqRow || !isAllowedRedirect(reqRow.redirect_to)) return new Response('Link expired. Try again in GG.', { status: 400 });
    const back = (q: Record<string, string>) =>
      new Response(null, { status: 302, headers: { Location: withQuery(reqRow.redirect_to, q) } });

    if (Date.now() - new Date(reqRow.created_at).getTime() > NONCE_TTL_MS) return back({ steam: 'error', reason: 'expired' });
    if (params.get('openid.mode') === 'cancel') return back({ steam: 'cancel' });

    // The assertion must be for our callback, and Steam must confirm it.
    const returnTo = params.get('openid.return_to') ?? '';
    const steamId = steamIdFromClaimedId(params.get('openid.claimed_id'));
    if (!returnTo.startsWith(`${callbackBase}?nonce=${nonce}`) || !steamId) return back({ steam: 'error', reason: 'invalid' });

    try {
      const check = await steamFetch(STEAM_OPENID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: checkAuthenticationBody(params).toString(),
      });
      if (!isValidAssertion(await check.text())) return back({ steam: 'error', reason: 'invalid' });

      // A Steam account can only be linked to one GG profile.
      const { data: other } = await admin
        .from('steam_accounts').select('profile_id').eq('steam_id', steamId).neq('profile_id', reqRow.profile_id).maybeSingle();
      if (other) return back({ steam: 'error', reason: 'already_linked' });

      await syncAccount(admin, steamKey, reqRow.profile_id, steamId);
      return back({ steam: 'linked' });
    } catch (e) {
      console.error('steam-link: callback failed', e instanceof Error ? e.message : e);
      return back({ steam: 'error', reason: e instanceof SteamError ? 'steam_unavailable' : 'internal' });
    }
  }

  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // ── Who is calling? ────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'unauthorized' });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json(401, { error: 'unauthorized' });

  let body: { action?: unknown; redirect_to?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  if (body?.action === 'start') {
    if (!isAllowedRedirect(body.redirect_to)) return json(400, { error: 'invalid_request' });
    const { data: profile } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!profile) return json(403, { error: 'no_profile' });

    // Tidy up old attempts, then create a new one.
    await admin.from('steam_link_requests').delete().lt('created_at', new Date(Date.now() - NONCE_TTL_MS).toISOString());
    const { data: row, error } = await admin
      .from('steam_link_requests').insert({ profile_id: user.id, redirect_to: body.redirect_to }).select('nonce').single();
    if (error || !row) {
      console.error('steam-link: start failed', error?.message);
      return json(500, { error: 'internal' });
    }
    const returnTo = `${callbackBase}?nonce=${row.nonce}`;
    return json(200, { url: buildSteamLoginUrl(returnTo, new URL(supabaseUrl).origin) });
  }

  if (body?.action === 'sync') {
    const { data: acct } = await admin.from('steam_accounts').select('steam_id').eq('profile_id', user.id).maybeSingle();
    if (!acct) return json(404, { error: 'not_linked' });
    try {
      return json(200, { account: await syncAccount(admin, steamKey, user.id, acct.steam_id) });
    } catch (e) {
      console.error('steam-link: sync failed', e instanceof Error ? e.message : e);
      return json(e instanceof SteamError ? 502 : 500, { error: e instanceof SteamError ? 'steam_unavailable' : 'internal' });
    }
  }

  return json(400, { error: 'invalid_request' });
});
