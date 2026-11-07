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

All files are safe to run again. Re-running them will not create duplicates.

## 1. Create a free Supabase project
1. Go to <https://supabase.com>, sign up, then click **New project**.
2. Pick a name (e.g. `gg`), set a strong database password (save it somewhere), and choose the region closest to your players. For India that's **Mumbai (ap-south-1)**.
3. Wait about 2 minutes while the project is created.

## 2. Run the migrations
**Option A: SQL Editor (easiest)**
1. In the dashboard open **SQL Editor → New query**.
2. Open `migrations/0001_schema.sql`, copy the whole file, paste it, and click **Run**.
3. Do the same for `0002`, `0003`, `0004`, `0005`, `0006` and `0007`, in that order.

**Option B: Supabase CLI**
```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>   # the ref is in your project URL
supabase db push              # runs everything in supabase/migrations
```

To check it worked, open **Table Editor**. You should see tables like `profiles`, `lfg_posts` and `messages`, and `games` should have 14 rows.

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

## Notes for developers
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
