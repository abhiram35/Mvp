# GG – fixes from the specialist review of "Story games + Steam" (PR #1)

Owner decisions:
- **Steam info visibility = same rule as in-game IDs** (yourself, accepted friends, squad chats, and DMs where the
  other person has actually sent you a message). Nobody else can read a linked Steam account.
- **Genshin Impact → category `casual`** (keep `is_coop`).
- All database fixes go in a NEW migration `0011_review_fixes.sql` (0010 may already be applied somewhere).
  0010 may additionally be edited ONLY to make re-runs safer and to seed Genshin as casual, as long as
  "0010 then 0011" works both on a fresh database and on one that already ran the old 0010.

## Contract changes (all layers must match exactly)

### 1. Steam linking becomes a 2-step flow (fixes forwarded-link attack)
`steam_link_requests` gains: `steam_id text null check (steam_id ~ '^\d{17}$')`, `completion_code uuid null unique`,
`verified_at timestamptz null`.

- `POST { action: "start", redirect_to }` (JWT) → `200 { url }` — unchanged for the client. Server also caps
  pending requests: deletes the caller's older pending rows, so at most 1 pending per profile.
- `GET ?nonce=…` (Steam's redirect, no JWT) → verifies the OpenID assertion (strictly; see §2), then does NOT
  link. It stores `steam_id`, sets `verified_at = now()` and `completion_code = gen_random_uuid()` on the row and
  redirects to `redirect_to?steam=verified&code=<completion_code>`. Errors redirect as before with
  `steam=error&reason=<code>`; cancel with `steam=cancel`.
- NEW `POST { action: "complete", code }` (JWT) → atomically consumes the row where
  `completion_code = code` AND `profile_id = caller` AND `verified_at > now() - interval '5 minutes'`
  (delete … returning). No row → `400 { error: "invalid_code" }`. Steam id linked to another profile →
  `409 { error: "already_linked" }`. Otherwise sync + upsert → `200 { account }`.
- `POST { action: "sync" }` (JWT) → `429 { error: "too_soon", retry_after_seconds }` if `synced_at` is less than
  5 minutes ago; else as before.
- Error codes the client must map to friendly copy: `unauthorized` 401, `no_profile` 403, `not_linked` 404,
  `invalid_request` 400, `invalid_code` 400, `already_linked` 409, `too_soon` 429, `steam_unavailable` 502,
  `not_configured` 500, `internal` 500, `method_not_allowed` 405. Redirect reasons: `expired`, `invalid`,
  `already_linked`, `steam_unavailable`, `internal`.
- Client: after `openAuthSessionAsync` returns `success` with `steam=verified&code=…`, call `complete`.
  Because Android can return `dismiss` before the URL arrives, the `/steam-linked` route ALSO reads
  `steam`, `code`, `reason` params: if `steam=verified` and a code is present it calls `complete` itself
  (dedupe so the same code is never completed twice from both paths), shows the result, then goes back/home.
  Always refresh the Steam card after the browser closes, whatever the result.
- Hide the Steam linking UI on web (Platform.OS === 'web').

### 2. Strict OpenID verification (fixes the critical bug)
Reject if any `openid.*` key appears more than once. Read every trusted value from the same single-valued map
that is sent to Steam. Require `openid.mode === 'id_res'`, `openid.ns === 'http://specs.openid.net/auth/2.0'`,
`openid.op_endpoint === 'https://steamcommunity.com/openid/login'`, `claimed_id === identity`, claimed_id matching
`^https://steamcommunity\.com/openid/id/(\d{17})$`, `openid.signed` containing at least
`op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle`, and `return_to` EXACTLY equal to
`${callbackBase}?nonce=${nonce}`. `isValidAssertion` accepts LF or CRLF. Never log URLs containing the API key.
Validate Steam data before storing: `profile_url` must start with `https://steamcommunity.com/`, `avatar_url` with
`https://`; otherwise store null.

### 3. Atomic profile save (fixes silent loss of games / in-game IDs)
NEW RPC `save_profile_games(p_games jsonb) returns void`, SECURITY DEFINER, `search_path = public`, caller = auth.uid().
`p_games` = array of `{ game_id, rank, role, play_status, in_game_id }` (rank/role/play_status/in_game_id may be
null; in_game_id '' = none). In ONE transaction: validate (≤ 30 games, game ids exist, same CHECKs as the tables),
upsert the caller's profile_games, delete profile_games not in the list, upsert/delete profile_game_ids to match.
Raises a clear error on invalid input (nothing changes). Onboarding and Edit profile call this after the profile
row insert/update. If loading in-game IDs failed in Edit profile, the app must not offer to save ID changes
blindly: it shows a retry state for the games section (or passes `null` in_game_id meaning "keep existing" —
the RPC treats JSON null in_game_id as KEEP, '' as REMOVE, a string as SET).

### 4. Other database fixes (0011)
- `gg_can_see_game_ids`: friends, OR a shared GROUP conversation, OR a DM in which `p_target` has sent ≥ 1 message.
- `steam_accounts` select policy: own row OR `gg_can_see_game_ids(profile_id)` (blocks still respected).
- Profanity masking trigger on `steam_accounts.persona_name` (reuse gg_clean_text).
- `profile_game_ids.in_game_id`: raw length ≤ 64 and no control characters (guarded add-constraint).
- `profile_game_ids`: column-level grants (insert profile_id, game_id, in_game_id; update in_game_id) + BEFORE UPDATE
  trigger setting `updated_at = now()`.
- `steam_accounts`: CHECKs on profile_url / avatar_url formats (NOT VALID + VALIDATE after nulling bad rows).
- `find_squadmates`: return nothing for non-squadable games; otherwise identical to the 0009 version (keep ban,
  block, reputation, scoring).
- `list_community_posts`: when `p_search` is set, match spoiler posts on title only (body search only for
  non-spoiler posts); otherwise identical to the latest version.
- Explicit `grant all … to service_role` on the new Steam tables; indexes on `profile_game_ids(game_id)` and
  `steam_link_requests(profile_id)`.
- Genshin: `update games set category = 'casual' where id = 'genshin_impact' (or its real id) and category = 'story'`.
- All of 0011 is re-runnable; constraint adds guarded with pg_constraint checks.

### 5. Ops
- `supabase/config.toml` pins `verify_jwt = false` for `steam-link` and `send-push`.
- app.json `version` → `1.1.0` (new native modules: expo-image, expo-web-browser) — a new build is required;
  OTA updates from this version must not go to 1.0.0 builds (runtimeVersion policy appVersion handles it once bumped).
- Docs: run new migrations BEFORE publishing a build or update; migrations now 0001→0011; Steam setup in GO_LIVE.
- CI: type-check Deno functions (`denoland/setup-deno` + `deno check supabase/functions/*/index.ts`).
