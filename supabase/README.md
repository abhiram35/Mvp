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

All files are safe to run again. Re-running them will not create duplicates.

## 1. Create a free Supabase project
1. Go to <https://supabase.com>, sign up, then click **New project**.
2. Pick a name (e.g. `gg`), set a strong database password (save it somewhere), and choose the region closest to your players. For India that's **Mumbai (ap-south-1)**.
3. Wait about 2 minutes while the project is created.

## 2. Run the migrations
**Option A: SQL Editor (easiest)**
1. In the dashboard open **SQL Editor → New query**.
2. Open `migrations/0001_schema.sql`, copy the whole file, paste it, and click **Run**.
3. Do the same for `0002`, `0003`, `0004`, `0005` and `0006`, in that order.

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
