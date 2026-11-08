// GG Edge Function: steam-link
// Links a player's Steam account with "Sign in through Steam" (OpenID 2.0) and
// stores their public profile + top games in steam_accounts.
//
// verify_jwt = false (supabase/config.toml): Steam redirects the browser back here
// without a GG login, so this function checks the JWT itself for the POST actions.
//
// Two steps, so a forwarded sign-in link can't link someone else's Steam account:
//   POST { action: "start", redirect_to }  (JWT)  → 200 { url }  open it in a browser
//                                                    (keeps at most 1 pending attempt per profile)
//   GET  ?nonce=…&openid.*                 (Steam) → strict OpenID check + Steam check_authentication,
//                                                    then 302 to redirect_to?steam=verified&code=<uuid>
//                                                    or ?steam=cancel or ?steam=error&reason=…
//   POST { action: "complete", code }      (JWT)  → 200 { account } — only the profile that started
//                                                    the attempt, within 5 minutes, once
//   POST { action: "sync" }                (JWT)  → 200 { account } refresh the library (every 5 min max)
// Errors (JSON): 400 invalid_request / invalid_code, 401 unauthorized, 403 no_profile,
//                404 not_linked, 405 method_not_allowed, 409 already_linked,
//                429 too_soon { retry_after_seconds }, 500 not_configured / internal,
//                502 steam_unavailable
// Redirect reasons: expired, invalid, already_linked, steam_unavailable, internal
//
// Secrets: STEAM_API_KEY (https://steamcommunity.com/dev/apikey). Never logged, and
// no URL containing it is ever logged.
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

// deno-lint-ignore no-import-prefix -- Supabase's documented style for Edge Functions
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { json } from '../_shared/cors.ts';
import { handle } from './handler.ts';

Deno.serve((req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey;
  const steamKey = Deno.env.get('STEAM_API_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey || !steamKey) {
    console.error('steam-link: missing env (STEAM_API_KEY or Supabase)');
    return json(500, { error: 'not_configured' });
  }
  const noSession = { persistSession: false, autoRefreshToken: false };
  const admin = createClient(supabaseUrl, serviceKey, { auth: noSession });

  return handle(req, {
    admin,
    steamKey,
    callbackBase: `${supabaseUrl}/functions/v1/steam-link`,
    realm: new URL(supabaseUrl).origin,
    getUserId: async (token) => {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: noSession,
      });
      const { data, error } = await userClient.auth.getUser(token);
      return error || !data?.user ? null : data.user.id;
    },
  });
});
