# Vinq – Phase 2 spec (beta readiness)

Goal: make Vinq ready for a friends beta. Data contract: the "Phase 2" section at the end of `src/lib/types.ts`
(names there are exact). Video clips are intentionally NOT in this phase.

## 1. Notifications (in-app inbox + push)
- Server triggers insert `notifications` rows; the app never inserts them.
  | Event | Recipient | Title example | Route |
  | --- | --- | --- | --- |
  | lfg_requests insert | post author | "Rhea wants to join your lobby" | /lfg/[id] |
  | lfg_requests → accepted | requester | "You're in: Ranked grind" | /chat/[id] (post.conversation_id) |
  | messages insert | every other member | DM: sender name; group: "{sender} in {title}" + message preview | /chat/[id] |
  | friendships insert | addressee | "Arjun sent you a friend request" | /friends |
  | friendships → accepted | requester | "Arjun accepted your friend request" | /user/[id] |
  | community_replies insert | post author (not self) | "New reply on: {title}" | /community/[id] |
  | set_solution (non-null) | reply author (not self) | "Your answer was marked as the solution" | /community/[id] |
  | teammate rating with praise | ratee | "A teammate rated you: Clutch, Chill" (rater not named) | /user/[id] (own) |
  | moderation action | target user | "A moderator removed your post" / "Your account is paused until …" | /notifications |
  Message notifications are throttled: at most one push per conversation per recipient every 60 seconds (inbox row
  still updated: collapse into the latest unread row for that conversation instead of stacking). Never notify across
  a block. Never notify the actor themselves.
- **Push:** an AFTER INSERT trigger on `notifications` calls the `send-push` Edge Function via `pg_net`
  (`net.http_post`) using a URL and shared secret stored in **Supabase Vault** (`vault.decrypted_secrets` names
  `send_push_url` and `send_push_secret`). If the secrets are missing the trigger silently does nothing
  (inbox still works). The function checks the `x-gg-push-secret` header, looks up the recipient's
  `push_tokens`, sends via the Expo Push API (`https://exp.host/--/api/v2/push/send`, batches of ≤100,
  `sound: 'default'`, `data: { route }`, Android `channelId: 'default'`), and deletes tokens that come back
  `DeviceNotRegistered`.
- App: register for push after sign-in (permission prompt shown once, after onboarding, with a short reason
  screen/alert first), get the Expo push token with `projectId` from `Constants.expoConfig.extra.eas.projectId`
  (skip quietly if missing — e.g. before `eas init` — or on simulators), upsert into `push_tokens`; delete the
  token on sign-out. Android channel 'default'. Tapping a notification (cold start and warm) routes to `data.route`.
  Foreground notifications show as a banner. Bell with unread badge on the Lobbies tab header and the Me tab →
  `/notifications` (list newest first, unread styled, tap → mark read + navigate, "Mark all read").
  Note: remote push does not work in Expo Go on Android; it works in EAS builds.

## 2. Teammate ratings + XP (the anti-toxicity feature)
- Eligibility: both players were members of the lobby's squad chat (`lfg_posts.conversation_id` members),
  between the chat's creation and 7 days after the lobby was created. One rating per (rater, ratee, lobby);
  re-rating replaces tags. Tags: 1–4 of good_comms / chill / clutch / shotcaller, OR exactly ['toxic'].
- `toxic` is private: never returned in stats. If a player gets toxic from 3 distinct raters within 30 days,
  the server auto-files a report (`reports`, target_type 'profile', reason 'harassment', reporter = the
  latest rater, details "Auto: flagged toxic by 3+ teammates in 30 days") unless an open one exists.
- XP (server-maintained `player_stats` table, read via `get_player_stats`):
  +10 per praise tag received (max 30 per rating), +5 when accepted into a lobby, +15 when your lobby gets its
  first accepted player, +20 per community solution, +1 per Vinq received on community content (max 50/day).
  Removing/re-rating adjusts XP accordingly. level = floor(sqrt(xp/50)) + 1.
- Squad finder: `find_squadmates` adds `reputation` to each match and boosts score by
  `least(15, positive_ratings * 2)` (still capped at 100); unrated players are not penalised.
- App: "Rate your squad" entry on the lobby screen (for squad members, once the squad chat exists) and in the
  squad chat's menu → a sheet listing teammates with tag chips (praise chips multi-select; a separate, clearly
  private "Report as toxic" toggle that is mutually exclusive with praise). Profile/player card shows level, a
  segmented XP bar ("1,580 XP to level 28"), teammate rating ("92% positive from 38 teammates" — only when
  ≥ 3 ratings), praise tag counts as badges, solutions count. Squad finder cards show level + top tags.

## 3. Moderation
- `moderators` table (profile_id PK) — owner adds rows in the SQL editor (README explains). `profiles.banned_until`.
- RLS: banned users (banned_until > now()) cannot insert messages, lfg_posts, lfg_requests, community posts/replies,
  friendships, or ratings. `get_my_status` tells the app.
- Profanity filter: `gg_clean_text(text)` masks a word list (English + common Hindi/Hinglish abuses and slurs,
  whole-word, case-insensitive, light leetspeak like @→a, 0→o, 1→i, $→s, 3→e) as first letter + asterisks.
  BEFORE INSERT/UPDATE triggers apply it to messages.body, lfg_posts.title/description, community post
  title/body, reply body, profiles.bio/display_name, lfg_requests.message.
- RPCs `list_reports`, `resolve_report`, `unban_user` (moderators only) per types.ts; actions notify the target.
- App: `/moderation` screen (only reachable when `is_moderator`; Me tab shows a "Moderation" row for moderators):
  tabs Open / Reviewed / Actioned, each item shows reason, details, preview, target user, counts; actions Dismiss /
  Remove content / Ban (1, 7, 30 days) with confirm. Banned players see a clear banner ("Your account is paused
  until 12 Dec. You can still read and browse.") and composers/host buttons are disabled.

## 4. Telemetry (no third-party services)
- `app_events(id, profile_id, name, props jsonb, created_at)`: clients insert only ClientEventName rows for
  themselves; triggers log server events (signup, lobby_created, join_requested, squad_formed, message_sent,
  community_post, community_reply, rating_given). `get_beta_metrics(p_days default 14)` for moderators.
- `app_errors`: insert allowed for anon and authenticated with length limits, profile_id = auth.uid() or null;
  no client select. App: root ErrorBoundary (themed "Something broke. Restart" screen with a Try again button),
  `ErrorUtils.setGlobalHandler` wrapper (call the previous handler), and unhandled promise rejection capture
  where available; throttle to 10 reports per session, dedupe identical messages.
- App logs `app_open` once per foreground session (min 30 min apart), `theme_changed`, `onboarding_completed`.

## 5. Password reset without deep links
Supabase "Reset password" email template must include the 6-digit code (`{{ .Token }}`) — README step.
App: Sign-in → "Forgot password?" → screen `/(auth)/reset-password`: enter email → "Send code" →
enter the code + new password (8+) + confirm on the same step → `verifyOtp({ email, token, type: 'recovery' })`
then immediately `updateUser({ password })` (the session from verifyOtp signs them in; do both calls before
any navigation). Same idea for sign-up confirmation: show "Enter the 6-digit code we emailed you"
(`verifyOtp type 'email'`) instead of relying on a link (README: add `{{ .Token }}` to the Confirm signup template).

## 6. Tooling
ESLint (eslint-config-expo flat config), Jest (jest-expo) unit tests for pure logic, GitHub Actions CI
(typecheck, lint, test on PRs and main), `eas.json` (development, preview = internal Android APK on channel
`preview`, production = store builds), expo-updates configured, `docs/GO_LIVE.md` step-by-step for the owner.
