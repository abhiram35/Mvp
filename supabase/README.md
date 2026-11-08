# GG backend (Supabase)

Everything the app needs lives in `migrations/`. Run the files **in order**:

| File | What it does |
| --- | --- |
| `0001_schema.sql` | Tables, constraints, indexes |
| `0002_security.sql` | Row Level Security (who can read/write what), block rules |
| `0003_functions.sql` | Server functions the app calls (`get_or_create_dm`, `accept_lfg_request`, `find_squadmates`, …) |
| `0004_realtime_storage.sql` | Live updates for chat/requests/friends + the `avatars` image bucket |
| `0005_seed_games.sql` | The list of games (BGMI, Free Fire MAX, Valorant, …) |
| `0006_community.sql` | Community (blog / forum): takes, questions, replies, GGs, solutions, plus their server functions |
| `0007_custom_themes.sql` | Custom AI themes: saved themes, generation log, monthly quota (`get_theme_quota`) |
| `0008_engagement.sql` | Notifications (inbox + push), teammate ratings, XP / levels, reputation in squad finder |
| `0009_safety_telemetry.sql` | Moderators + bans, profanity filter, report queue, product events, crash reports, beta metrics |
| `0010_games_steam.sql` | Game categories (Competitive / Story / Co-op & Casual), story games, game artwork, private in-game IDs, "playing now", spoiler tags, Steam accounts |
| `0011_review_fixes.sql` | Privacy and safety fixes for 0010: in-game IDs and Steam accounts only visible to friends / squad chats / DMs where the player wrote to you, safer Steam linking (2 steps), one-call profile game saving, Steam name filter, Genshin Impact moved to Co-op & Casual |

All files are safe to run again. Re-running them will not create duplicates, and it will not undo your own edits
to the game list.

> **Important: run new migrations BEFORE you publish a new app build or an over-the-air update.**
> A new version of the app expects the new database functions (for example `save_profile_games`). If the app
> goes out first, players get errors until the SQL is run. So the order is always: 1) run the new SQL files,
> 2) deploy changed Edge Functions, 3) publish the build or update.

## 1. Create a free Supabase project
1. Go to <https://supabase.com>, sign up, then click **New project**.
2. Pick a name (e.g. `gg`), set a strong database password (save it somewhere), and choose the region closest to your players. For India that's **Mumbai (ap-south-1)**.
3. Wait about 2 minutes while the project is created.

## 2. Run the migrations
**Option A: SQL Editor (easiest)**
1. In the dashboard open **SQL Editor → New query**.
2. Open `migrations/0001_schema.sql`, copy the whole file, paste it, and click **Run**.
3. Do the same for `0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0008`, `0009`, `0010` and `0011`, in that order
   (so the full run order is **0001 → 0011**). Already ran some of them earlier? Just run the newer ones, in order.

**Option B: Supabase CLI**
```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>   # the ref is in your project URL
supabase db push              # runs everything in supabase/migrations
```

To check it worked, open **Table Editor**. You should see tables like `profiles`, `lfg_posts` and `messages`, and `games` should have 27 rows.

## 3. Turn on email sign-in
1. **Authentication → Sign In / Providers → Email**: make sure it is **enabled**. Keep **Confirm email** on for real users. You can turn it off while testing.
2. **Authentication → URL Configuration**:
   - **Site URL**: your app's URL. During development `exp://localhost:8081` is fine.
   - **Redirect URLs**: add `gg://**` and `exp://**`. Password-reset and confirmation links will open the app.

## 4. Connect the app
1. **Project Settings → API** (or **Data API / API Keys**): copy the **Project URL** and the **anon / publishable** key.
2. In the project root, create `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. Restart `npx expo start`.

> Never put the **service_role** key in the app or in `.env` for the app. It bypasses all security.

## 5. Moderation: seeing and acting on reports
> Since `0009` there is an in-app **Moderation** screen (see [Moderation](#8-moderation) below). The dashboard steps
> here still work as a fallback.

Users can create reports, but they can never read them. Only you can, from the dashboard (the dashboard bypasses RLS).

1. **Table Editor → reports**. Sort by `created_at` and filter `status = open`.
2. `target_type` + `target_id` tell you what was reported:
   - `profile` → look up `target_id` in **profiles** (`id`)
   - `message` → **messages** (`id`)
   - `lfg_post` → **lfg_posts** (`id`)
   - `community_post` → **community_posts** (`id`)
   - `community_reply` → **community_replies** (`id`)
3. Take action, for example:
   - Delete the bad message or post row.
   - Ban a user: **Authentication → Users →** find them **→ Ban user**. To remove them completely, choose **Delete user**, which also removes all their data.
4. Set the report's `status` to `reviewed` (no action needed) or `actioned` (you did something).

### Moderating the Community
Reports on Community content have `target_type` = `community_post` or `community_reply`.
1. **Table Editor → reports**, filter `target_type` to `community_post` or `community_reply`.
2. Find the row with that `id` in **community_posts** or **community_replies** and delete it.
   Deleting a post also deletes its replies and GGs. Deleting the reply that was marked as the answer clears the answer.
3. For repeat offenders, ban the user (see above).

Handy SQL (SQL Editor):
```sql
select r.*, p.username as reporter
from reports r join profiles p on p.id = r.reporter_id
where r.status = 'open' order by r.created_at desc;
```

## 6. Custom AI themes
Players can type a vibe ("cold Norse war, blood and gold") and an AI designs a theme for them. This runs in a
small server program called an **Edge Function** (`functions/generate-theme`). It holds your AI key, so the app
never sees it. You need to deploy it once.

1. Run `migrations/0007_custom_themes.sql` (see step 2) if you haven't yet.
2. Get an AI key: go to <https://console.anthropic.com>, sign up, add a little credit under **Billing**, then
   **API Keys → Create key**. Copy it (it starts with `sk-ant-`).
3. Install the Supabase CLI and connect it to your project (in a terminal, from the project folder):
   ```bash
   npm i -g supabase            # or: brew install supabase/tap/supabase
   supabase login               # opens the browser
   supabase link --project-ref <your-project-ref>   # the ref is in your project URL: https://<ref>.supabase.co
   ```
4. Save the key as a secret (it is stored on Supabase, not in the app):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   # optional: pick another model (default claude-sonnet-5-5)
   supabase secrets set THEME_MODEL=claude-sonnet-5-5
   ```
5. Deploy the function:
   ```bash
   supabase functions deploy generate-theme
   ```
   Run this again whenever files in `supabase/functions` change.
6. Try it in the app: **Profile → Theme → Create with AI**.

**Cost.** Each generation is one AI call and costs a little API money (a few cents at most; check current prices on the console's pricing page). Failed attempts
cost too but don't use up the player's quota, so each player is also limited to 10 failed attempts per 24 hours.

**Limits.** Each player gets **2 themes per month** (the month resets at 00:00 India time on the 1st) and can keep
**6 saved themes**. Deleting a theme does not give a generation back. To change the numbers, edit the one function
`theme_limit` at the top of `migrations/0007_custom_themes.sql` (`'monthly' then 2`, `'saved' then 6`,
`'failed_per_day' then 10`) and run that file again. No function redeploy is needed.

**Seeing what happened.** In **Table Editor**:
- `theme_generations`: one row per attempt. `status` is `succeeded`, `failed` (AI error, timeout, unreadable
  colours) or `rejected` (bad prompt or brand names in the result). `error` is a short code like `upstream_429`,
  `timeout`, `contrast:text`, `denylisted:words.squadUp`, `prompt_denylist`.
- `custom_themes`: saved themes, with the player's prompt (private, only you and the player can see it) and the
  full `spec`.
- Function logs: **Edge Functions → generate-theme → Logs**.

If every attempt fails with `not_configured`, the `ANTHROPIC_API_KEY` secret is missing. `upstream_401` means the
key is wrong; `upstream_400` with a valid key usually means the `THEME_MODEL` name is wrong.

## 7. Push notifications
The inbox (bell icon) works as soon as `0008` is run. Phone push notifications need three more things: the
`send-push` Edge Function, a shared secret, and two Vault secrets that tell the database where the function is.

1. Install and link the Supabase CLI (see step 6.3) if you haven't yet.
2. Make a random secret (any long random string). In a terminal:
   ```bash
   openssl rand -hex 32
   ```
   Copy the output. Below it is called `<secret>`.
3. Save it for the function and deploy the function (run this from the project folder). The database calls the
   function without a user login, so the login (JWT) check must be off; the secret protects it instead.
   `supabase/config.toml` already turns the check off for `send-push`, and `--no-verify-jwt` does the same thing
   (keep it as a safety net in case the CLI doesn't pick up the file).
   ```bash
   supabase secrets set PUSH_SHARED_SECRET=<secret>
   supabase functions deploy send-push --no-verify-jwt
   ```
4. Tell the database where the function is. In **SQL Editor** run (replace `<ref>` with your project ref and
   `<secret>` with the same secret):
   ```sql
   select vault.create_secret('https://<ref>.functions.supabase.co/send-push', 'send_push_url');
   select vault.create_secret('<secret>', 'send_push_secret');
   ```
   To change one later: **Project Settings → Vault** (or `select vault.update_secret(id, 'new value')`).
   If the secrets are missing, nothing breaks: the inbox still fills, only phone pushes are skipped.
5. **Android** push also needs Firebase (FCM) credentials uploaded to Expo/EAS. Follow Expo's guide:
   <https://docs.expo.dev/push-notifications/push-notifications-setup/> (section "Android: FCM credentials").
   iOS push credentials are created for you by `eas build` (paid Apple developer account required).
6. Remote push does **not** work in Expo Go on Android. Test it with an EAS build (development or preview).

**Checking it works.** Send yourself a friend request from a second account. Then:
- **Table Editor → notifications** should have a row.
- **Edge Functions → send-push → Logs** shows each call (`{ sent, removed }`). `401` means the two secrets don't match.
- `select * from net._http_response order by created desc limit 5;` shows the database's HTTP calls.

Chat messages push at most once per conversation per minute; newer messages update the same inbox row.
Optional: if you turned on Expo's "Enhanced push security", also `supabase secrets set EXPO_ACCESS_TOKEN=...`.

## 8. Moderation
1. Make yourself a moderator (SQL Editor, use your own username):
   ```sql
   insert into moderators(profile_id) select id from profiles where username = 'yourname';
   ```
   Restart the app. **Me → Moderation** appears.
2. Reports show up under **Open**. For each one you can **Dismiss**, **Remove content** (deletes the message / lobby /
   post / reply; for a profile it clears the bio and photo) or **Ban** for 1, 7 or 30 days. The player gets a
   notification. Banned players can still read and browse, but cannot post, message, host, join, reply, add friends
   or rate.
3. Lift a ban early from the app, or in SQL: `update profiles set banned_until = null where username = 'name';`
4. If a player is flagged "toxic" by 3 different teammates within 30 days, a report is filed automatically
   ("Auto: flagged toxic by 3+ teammates in 30 days").
5. The profanity filter masks abuse automatically ("f***"). Add a word:
   `insert into gg_blocked_words (word) values ('newword');` (lowercase; leetspeak and plurals are handled).
   Only new or edited text is masked.

To remove a moderator: `delete from moderators where profile_id = (select id from profiles where username = 'name');`

## 9. Beta metrics
As a moderator, open the in-app metrics screen, or run in SQL Editor:
```sql
select get_beta_metrics(14);
```
You get total and new players, daily active players (India time), lobbies, join requests,
squads formed, messages, community posts, ratings, day-1 / day-7 retention and errors in the last 24 hours. Raw data:
**Table Editor → app_events** and **app_errors** (crash reports with stack traces).

## 10. Email codes (sign-up and password reset without links)
The app asks for the 6-digit code from the email, so the emails must contain it.
1. **Authentication → Emails → Templates** (older dashboards: **Email Templates**).
2. **Confirm signup**: add a line such as `Your GG code is {{ .Token }}`.
3. **Reset password** (sometimes "Reset Password" / "Recovery"): add `Your GG reset code is {{ .Token }}`.
4. Save both. You can keep the links in the emails too; the app only needs the code.

## 11. Steam linking ("Sign in through Steam")
Players link Steam on **Me** (profile) **→ Steam**. They sign in on Steam's own page (GG never sees their password), so a
linked account is verified. GG then shows their most-played games and lets them add matching games in one tap.

1. Run `migrations/0010_games_steam.sql` and then `migrations/0011_review_fixes.sql` if you haven't yet.
2. Get a free Steam Web API key: <https://steamcommunity.com/dev/apikey>. Sign in, type any domain name (for
   example your Supabase project domain `xxxx.supabase.co`), accept the terms, and copy the key.
   Your Steam account must have spent at least US$5 on Steam to get a key.
3. Install and link the Supabase CLI (see step 6.3) if you haven't yet, then, from the project folder:
   ```bash
   supabase secrets set STEAM_API_KEY=<your key>
   supabase functions deploy steam-link --no-verify-jwt
   ```
   The login (JWT) check must be off for this function: Steam sends the browser back to it without a GG login.
   `supabase/config.toml` already turns it off for `steam-link`; `--no-verify-jwt` does the same and is a safety
   net. The function checks the GG login itself for every other request and verifies every sign-in with Steam.
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically; don't set them.)
4. Try it in the app: **Me → Sign in through Steam**. The browser opens Steam's page, you sign in, then you come
   back to GG and it finishes linking. Linking is two steps on purpose: Steam's answer only proves who you are on
   Steam, and the app then confirms it from your own signed-in GG account (within 5 minutes). That way a forwarded
   or stolen link can't attach someone's Steam account to a different GG profile. If linking doesn't finish (for
   example you closed the browser), just tap the button again.

Notes:
- A player's library only shows if their Steam **Game details** privacy setting is **Public**. The app tells them how
  to change it.
- One Steam account can be linked to one GG profile.
- A linked Steam account is private in the same way as in-game IDs: only the player, accepted friends, people in a
  squad chat with them, and people they have sent a DM to can see it. Nobody else (not strangers, not anyone across
  a block). Steam names go through the profanity filter.
- "Refresh" from Steam works at most once every 5 minutes per player (`too_soon`).
- Steam linking is not shown in the web version of the app, only on phones.
- Errors: **Edge Functions → steam-link → Logs**. `not_configured` means the `STEAM_API_KEY` secret is missing.

## 12. Game list and artwork
- `games.category` is `competitive`, `story` or `casual` (shown as "Co-op & Casual"). Story games only appear in
  Squad Finder and lobbies when `is_coop` is true (`squadable` is computed from both).
- Artwork: games with a `steam_appid` automatically use their Steam store image. For other games (BGMI, Free Fire,
  Valorant…), upload an image (about 460×215, wide) to **Storage → game-art**, copy its public URL and put it in
  `games.logo_url`. Use official press-kit images from the publisher. Games without artwork show their emoji.
- To add a game, insert a row in **Table Editor → games** (or add it to `0010` and re-run it).

## Notes for developers
- In-game IDs live in `profile_game_ids`, not `profile_games`, so they stay private: only the player, accepted
  friends, members of a squad (group) chat with them, and people in a DM **where the player has sent at least one
  message** can read them (never across a block). Just opening a DM with `get_or_create_dm` is not enough.
  `steam_accounts` uses exactly the same rule (`gg_can_see_game_ids`). Rows are deleted with the matching
  `profile_games` row. IDs are max 64 characters with no control characters (line breaks, tabs…); `updated_at` is
  set by the server (users can insert `profile_id, game_id, in_game_id` and update `in_game_id` only).
- Saving a player's games: call `rpc('save_profile_games', { p_games })` instead of writing `profile_games` /
  `profile_game_ids` yourself. `p_games` is the full list (max 30) of `{ game_id, rank, role, play_status,
  in_game_id }`. Games not in the list are removed. `in_game_id`: `null` = keep the saved one, `''` = remove it,
  text = set it (spaces at the ends are trimmed). `rank` / `role` / `play_status` `''` count as none. Everything
  happens in one transaction: on bad input it raises an error with code `22023` (or `42501` when signed out / no
  profile) and nothing changes. Returns null.
- `find_squadmates` returns no one for single-player story games (`squadable = false`).
- `list_community_posts` search matches a spoiler post's title only, never its hidden body.
- Steam linking is two steps (see `docs/REVIEW_FIXES.md` §1): `steam_link_requests` has `steam_id`,
  `completion_code` and `verified_at`; the app finishes with `{ action: "complete", code }`. The table is service-role
  only. `steam_accounts.profile_url` must start with `https://steamcommunity.com/` and `avatar_url` with `https://`.
- `lfg_posts` rejects games where `squadable` is false.
- Expired LFG posts are not closed automatically. The app should query
  `.gt('expires_at', new Date().toISOString())` together with `status = 'open'`.
- `reports` has no SELECT permission. Insert without `.select()`.
- Accepting a join request must go through `rpc('accept_lfg_request')`, because it creates the group chat. The author can set a request to `declined` directly.
- Blocking someone automatically removes any friendship between you and declines pending LFG requests between you.
- Community RPCs (`list_community_posts`, `get_community_post`, `list_community_replies`) return `setof jsonb`, same as `find_squadmates`: supabase-js gives you an array of objects shaped like `CommunityPostSummary` / `CommunityReplyItem`. `toggle_post_gg` / `toggle_reply_gg` return one jsonb object (`GgToggleResult`); `set_solution` returns null.
- Community counters (`gg_count`, `reply_count`, `last_activity_at`) and `solved_reply_id` are server-maintained. Users can edit only `title`, `body`, `game_id` of their own post and `body` of their own reply. GGs go through the toggle RPCs only (you cannot GG your own content).
- Community posts and replies by someone you blocked (or who blocked you) are hidden everywhere, including direct table selects and realtime; replying across a block is rejected. `community_replies` is in the realtime publication.
- `updated_at` on community posts/replies changes only when the text (or game) is edited, so `updated_at > created_at` means "edited".
- `delete_my_account` deletes the user's DMs, then the auth user. Everything else cascades. The app removes the avatar file through the Storage API first, because Supabase doesn't allow deleting storage objects with SQL.
- Custom themes: the app never inserts into `custom_themes` or `theme_generations`; it calls
  `supabase.functions.invoke('generate-theme', { body: { prompt } })`. Players can select, rename (`name` only)
  and delete their own themes, and read their own `theme_generations`. `get_theme_quota()` returns
  `{ used, limit, remaining, resets_at, saved, saved_limit }` (`resets_at` is UTC ISO, e.g.
  `2026-11-30T18:30:00Z` = 1 Dec 00:00 IST). `begin_theme_generation` / `finish_theme_generation` /
  `theme_quota_for` are service-role only (used by the function; they also stop two parallel generations).
- `supabase/functions` is Deno code with its own `deno.json`; the app's root `tsconfig.json` excludes it.
  Pure theme logic (validation, contrast repair, denylists) is in `functions/_shared/themeSpec.ts` with no imports.
- Phase 2 (`0008`, `0009`): notifications are created only by server triggers; the app selects its own rows and may
  update `read_at` only (or call `mark_notifications_read`). Register devices with
  `rpc('register_push_token', { p_token, p_platform })` (reassigns the token to the caller); owners can also
  select/insert/update/delete their own `push_tokens` rows directly.
- `rate_teammate`, `get_player_stats`, `get_my_status`, `get_beta_metrics` return one jsonb object;
  `list_rateable_teammates` and `list_reports` return `setof jsonb`; `count_unread_notifications` returns an integer;
  `mark_notifications_read`, `resolve_report`, `unban_user`, `register_push_token` return null.
  `find_squadmates` rows now also carry `reputation: { level, ratings_received, top_tags }`.
- XP lives in `player_stats` (server only). It is event-based: deleting a lobby does not take back XP; un-GGs,
  re-ratings and changed solutions do. `select rebuild_player_stats();` recomputes everything from the tables.
- `app_events` / `app_errors` are insert-only for clients (no `.select()`). `profiles.banned_until` cannot be written
  by users. `reports.target_user_id` is filled by the server.

