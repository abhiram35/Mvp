# GG: go live (from zero to "my friends have the app")

This guide is for the owner. Follow the steps in order and copy-paste the commands. It assumes a computer with
**Node.js 22** (LTS) and **git** installed, and an **Android phone**.

You run every command in a terminal, inside the project folder (the one with `package.json`).

> Expo renamed its cloud services to **Expo Build** and **Expo Update** (they used to be "EAS Build" and "EAS
> Update"). The command-line tool and the `eas.json` file still use the name `eas`, so the commands below say
> `eas`. We run it with `npx eas-cli@latest …`, so you never need to install it globally.

---

## 1. Create the accounts (free)

| Account | Needed for | Link |
| --- | --- | --- |
| **Supabase** | database, sign-in, chat, images | <https://supabase.com> |
| **Expo** | building the Android app and sending fixes | <https://expo.dev/signup> |
| **Firebase** (Google) | Android push notifications only | <https://console.firebase.google.com> |
| **Anthropic** (optional) | AI custom themes only, costs a little money | <https://console.anthropic.com> |

You can skip Firebase at first. The app works without it, except that phones won't buzz for new messages
(the in-app inbox still works).

## 2. Set up Supabase

Follow **[supabase/README.md](../supabase/README.md)**. In short:

1. Create a project (region: **Mumbai** if your players are in India).
2. Run **every** file in `supabase/migrations/` **in order**: `0001` → `0002` → … → the last one (`0011` at the
   time of writing). Skipping or re-ordering breaks things. Running a file twice is safe.
   **Whenever the repo gets a new migration, run it before you publish a new build or update** — new app
   versions expect the new tables and columns and will fail (sign-up, Edit profile, game lists) without them.
3. **Authentication → Sign In / Providers → Email**: enabled, **Confirm email** on.
4. **Authentication → Email Templates**: in **Confirm signup** and **Reset password**, make sure the email
   contains the 6-digit code `{{ .Token }}` (the README has the exact text). The app asks players to type this
   code, so links in emails are not needed.
5. **Authentication → URL Configuration → Redirect URLs**: add `gg://**` and `exp://**`.
6. Optional: deploy the Edge Functions and set their secrets, as described in the README:
   - `generate-theme` for AI themes (`ANTHROPIC_API_KEY`),
   - `send-push` for push notifications,
   - `steam-link` for Steam account linking (README section 11). In short:
     1. Get a free Steam Web API key at <https://steamcommunity.com/dev/apikey> (any domain name is fine, e.g.
        `xxxx.supabase.co`; your Steam account must have spent US$5 on Steam).
     2. `supabase secrets set STEAM_API_KEY=<your key>`
     3. `supabase functions deploy steam-link`
     4. In the app: **Me → Sign in through Steam**. Linking is two steps on purpose (Steam proves who you are,
        then the app confirms it from your signed-in account), so a forwarded link can't hijack an account.
     A linked Steam account is only visible to the player, their accepted friends, people in a squad chat with
     them and people they have sent a DM to.

   Run the deploy commands from the project folder. `supabase/config.toml` already marks `send-push` and
   `steam-link` as "no JWT check" (Steam's browser redirect and the database trigger don't carry a login token),
   so a plain `supabase functions deploy <name>` is correct. If the function logs show `401` for Steam's redirect
   or for the database's calls, deploy again with `--no-verify-jwt` added (same effect). `generate-theme` must keep
   the check: never deploy it with `--no-verify-jwt`.

## 3. Connect the app to Supabase

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. In Supabase open **Project Settings → API** (or **API Keys**). Put the **Project URL** and the
   **anon / publishable** key into `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   Never use the `service_role` key in the app. `.env` is in `.gitignore`, so it is never committed.

## 4. Install and try it on your phone (Expo Go)

```bash
npm install
npx expo start
```

1. Install **Expo Go** from the Play Store.
2. Scan the QR code shown in the terminal with Expo Go.
3. Sign up, finish onboarding, host a lobby, send a chat message.

Expo Go is only for trying things out. **Push notifications do not work in Expo Go on Android.** They need a
real build (step 8).

Before you build, check that everything is green:
```bash
npm run typecheck
npm run lint
npm test
```

## 5. Connect the project to Expo

```bash
npx eas-cli@latest login          # your Expo username + password
npx eas-cli@latest init           # creates the project on expo.dev
```

`eas init` writes your project's ID into `app.json` (`expo.extra.eas.projectId`) and sets `owner`. **Do not type
a project ID by hand.** Commit the change:
```bash
git add app.json && git commit -m "Link Expo project"
```

## 6. Turn on over-the-air fixes (Expo Update)

```bash
npx eas-cli@latest update:configure
```

This adds `expo.updates.url` to `app.json` (a URL with your project ID). `app.json` already has
`runtimeVersion: { "policy": "appVersion" }`, and `eas.json` already gives each build a channel
(`development`, `preview`, `production`). Commit `app.json` again afterwards.

Do this **before your first build**. A build made without `updates.url` can never receive fixes.

## 7. Give the cloud builds your Supabase keys

`.env` is not uploaded to Expo's build servers (it is git-ignored), so add the two values as Expo environment
variables for the `preview` environment (and `production` later):

```bash
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co" --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --visibility plaintext
```

(Or on **expo.dev → your project → Environment variables**.) The anon key is meant to be public, so
"plaintext" is fine. If the installed app can never sign in (but works in Expo Go), this step was missed.

Each build profile in `eas.json` names the environment it reads (`"environment": "preview"` for the
`preview` profile, and so on), so variables created for `preview` end up in preview builds.

## 8. Android push notifications (optional, needs Firebase)

Do this **before** step 9 if you want push in the first build: `google-services.json` is baked into the
build, so adding it later means building again.

Expo's guides: [push notifications setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
and [FCM V1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/). Short version:

1. **Firebase console → Add project** (any name, Analytics not needed).
2. **Add app → Android**, package name **`com.abhiram35.gg`** (must match `app.json`). Download
   **`google-services.json`** and put it in the project root.
3. Tell the app about it: in `app.json`, inside `"android": { … }`, add
   `"googleServicesFile": "./google-services.json"`. Commit both files. Only add this line once the file is
   really there: a build with the line but without the file fails. (`google-services.json` is not a secret;
   it must be committed, because cloud builds only see committed files.)
4. **Firebase → Project settings → Service accounts → Generate new private key**. This downloads a JSON key.
   **This one is secret.** Keep it outside the project folder and never commit it.
5. Upload it to Expo:
   ```bash
   npx eas-cli@latest credentials
   ```
   Choose **Android** → the build profile (`preview`) → **Google Service Account** →
   **Manage your Google Service Account Key for Push Notifications (FCM V1)** →
   **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account
   key** → pick the JSON file. (Menu wording can change slightly between CLI versions.)
6. Make sure the `send-push` Edge Function and its Vault secrets are set up (supabase/README.md).

## 9. Build the Android app and share it

```bash
npx eas-cli@latest build -p android --profile preview
```

- The first time, answer **Yes** when it offers to create an Android keystore. Expo stores it for you.
- The build runs in the cloud (often 10–30 minutes on the free plan; you can close the terminal).
- When it finishes you get a link and a QR code to an **.apk** file. That's the app.

**Share it:** send your friends the build link (also on **expo.dev → your project → Builds**). On Android they
open the link, download the APK, and allow "Install unknown apps" for their browser when asked. Internal builds
are not on the Play Store, so this is expected.

## 10. Ship fixes without a new build

For changes to **JavaScript/TypeScript only** (screens, text, logic, styles). If the change came with a new file in
`supabase/migrations/`, run it in Supabase **first** (step 2).

```bash
npx eas-cli@latest update --channel preview --environment preview --message "Fix chat scroll"
```

`--environment preview` bundles the same Supabase keys the preview build uses (step 7).

Friends get the fix the next time they open the app (it downloads in the background, then applies on the
following launch, so ask them to close and reopen twice).

You **need a new build** (step 9) instead when you:
- add or upgrade a library with native code (anything installed with `npx expo install` that isn't pure JS),
- change `app.json` plugins, permissions, icons, package name, or `googleServicesFile`,
- upgrade the Expo SDK.

When you do, bump `"version"` in `app.json` (e.g. `1.0.0` → `1.1.0`). With the `appVersion` runtime policy this
keeps old builds from receiving updates that need the new native code.

### Releasing 1.1.0 (story games + Steam)

`app.json` is already at `1.1.0`, because this release added two native libraries (`expo-image` and
`expo-web-browser`). That means:

1. Run `0010_games_steam.sql` and `0011_review_fixes.sql` in Supabase first (step 2), if you haven't.
2. Deploy `steam-link` (step 2.6) if you want Steam linking.
3. Make a **new build**: `npx eas-cli@latest build -p android --profile preview` (step 9) and send friends the
   new link. They install it over the old app (same package name, their login stays).
4. `eas update` alone will **not** reach phones that still have a `1.0.0` build: updates only go to builds with
   the same `version`. Friends on `1.0.0` keep the old app until they install the new build.

### Release order (every time)

1. Run new files from `supabase/migrations/` (in order).
2. Deploy any changed Edge Functions (`supabase functions deploy <name>`).
3. Then publish the build or the update.

The other way round, players get errors until the database catches up.

## 11. Make yourself a moderator

After signing up in the app, run this in Supabase **SQL Editor** (replace the username):

```sql
insert into moderators (profile_id)
select id from profiles where username = 'your_username'
on conflict do nothing;
```

Restart the app. **Me → Moderation** now shows reports, and you can dismiss, remove content, or pause accounts.

## 12. Watch the beta

- **Metrics:** in the app (moderators) or in **SQL Editor**:
  ```sql
  select get_beta_metrics(14);
  ```
  If the SQL Editor says you are not allowed (it doesn't run as your app user), look at the **app_events** table
  in **Table Editor** instead (sort by `created_at`).
- **Crashes and errors:** **Table Editor → app_errors**, newest first. Each row has the message, stack and
  screen. A burst of the same message after an update means that update broke something: fix it and publish
  another update.
- **Reports:** the Moderation screen, or **Table Editor → reports** (supabase/README.md section 5).
- **Function logs:** **Edge Functions → generate-theme / send-push / steam-link → Logs**.
- **Builds and updates:** expo.dev → your project → **Builds** / **Updates**.

## 13. Free-plan limits to watch

**Supabase (Free):**
- A free project is **paused after about a week with no activity**. Paused = the app can't sign in or load
  anything. Open the dashboard and click **Restore**. During a beta, open the app or the dashboard every few days.
- Database size, storage, bandwidth and monthly-user limits apply; see <https://supabase.com/pricing>.

**Expo (Free), from <https://expo.dev/pricing> (checked November 2026):**
- **Up to 15 Android builds** (and 15 iOS) per billing period. Unused builds don't roll over. Use
  `eas update` for fixes instead of rebuilding.
- **Low-priority build queue** and a **45-minute build timeout**, so builds can wait in line.
- **Expo Update: 1,000 monthly active users**, 100 GiB bandwidth, 20 GiB storage. Plenty for a friends beta.

**Anthropic:** each AI theme generation is a paid API call (a few cents at most). Players are limited to 2 per
month by the server.

## 14. Troubleshooting

| Problem | Fix |
| --- | --- |
| Can't sign in / nothing loads | Locally: check `.env`, then restart `npx expo start`. In a build: step 7, then rebuild. |
| Everything suddenly fails, "Failed to fetch" | The Supabase project is paused. Restore it in the dashboard. |
| Sign-up email has no code | Add `{{ .Token }}` to the email templates (step 2.4). Free Supabase email is rate-limited; wait or set up custom SMTP. |
| A migration fails with "does not exist" | You skipped one. Run the files in order from `0001`. |
| `eas build` fails at "Install dependencies" | Run `npm install` locally, commit `package-lock.json`, try again. |
| Friends don't get an update | Same channel? (`preview` build ⇄ `--channel preview`). Same `version` in `app.json` as the build? Did the update change native code (then it needs a build)? Ask them to reopen the app twice. |
| No push notifications | Needs a real build (not Expo Go), step 8 done, notification permission allowed on the phone, `send-push` deployed. Check its logs. |
| Steam linking fails | **Edge Functions → steam-link → Logs**. `not_configured` = `STEAM_API_KEY` missing. `401` on Steam's redirect = redeploy with `--no-verify-jwt`. Errors about `save_profile_games` or Steam columns = `0011` not run. |
| "Install blocked" on the phone | Allow installs from unknown sources for the browser/Files app. |
| Play Protect warns about the APK | Normal for apps not from the Play Store. Tap "Install anyway". |
| `npx expo start` QR doesn't connect | Phone and computer on the same Wi-Fi, or run `npx expo start --tunnel`. |

---

## Beta checklist

- [ ] All migrations run in order `0001` → `0011` (including `0010_games_steam.sql` and `0011_review_fixes.sql`),
      `games` table has rows
- [ ] Email confirm + reset templates contain `{{ .Token }}`; redirect URLs `gg://**`, `exp://**` added
- [ ] `.env` filled; app works in Expo Go (sign up, lobby, chat, community post)
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all pass (CI is green on GitHub)
- [ ] `eas init` and `eas update:configure` done, `app.json` committed
- [ ] Supabase keys added as Expo environment variables (`preview`)
- [ ] (Optional) Firebase + FCM V1 key uploaded, `send-push` deployed; a test push arrives
- [ ] (Optional) `generate-theme` deployed with `ANTHROPIC_API_KEY`
- [ ] (Optional) `STEAM_API_KEY` set and `steam-link` deployed; **Me → Sign in through Steam** links your
      account, and a friend sees your Steam card while a stranger does not
- [ ] App version bumped and a NEW build made whenever native modules changed (1.1.0 added expo-image and
      expo-web-browser: `npx eas-cli@latest build -p android --profile preview`, then share the new link)
- [ ] Migrations run and functions deployed BEFORE the build or update went out
- [ ] Preview APK built, installed on your own phone first, smoke-tested
- [ ] You are in the `moderators` table and can open Moderation
- [ ] Community guidelines visible; you know how to ban and remove content
- [ ] Build link shared with friends; a feedback channel (e.g. Discord) set up
- [ ] Check `app_errors` and reports every day or two; open Supabase at least weekly so it doesn't pause
