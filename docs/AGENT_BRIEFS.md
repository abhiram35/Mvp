# SquadUp – build briefs for the agent team

SquadUp is a mobile social app for gamers (India-first, many games): find teammates,
post "looking for group" (LFG) requests, chat, add friends — with zero tolerance for
toxicity (report, block, moderation built in from day one).

Stack: **Expo SDK 58 + React Native 0.88 + TypeScript (strict) + Expo Router** (routes in
`src/app/`), **Supabase** (Postgres, Auth with email+password, Realtime, Storage).

## Rules for every agent

1. **Only create or edit files inside the folders you own** (listed below). Never edit
   another agent's files or the shared foundation. If you need a change in a shared file,
   write it under "Requests for the lead" in your final report instead.
2. **Shared foundation (read-only for you):**
   - `src/lib/types.ts` – the data contract. Table/column/RPC names are exact. Use these types.
   - `src/lib/supabase.ts` – `supabase` client and `errorMessage(err)`.
   - `src/lib/actions.ts` – `openDm(otherId)` and `openReport(type, id)`.
   - `src/theme/index.ts` – colours, spacing, radius, font. Never hard-code colours.
   - `src/components/ui/index.tsx` – `Screen, Text, Button, TextField, Card, Avatar, Chip,
     ChipRow, LoadingState, EmptyState, ErrorState, Divider`. Build screens from these.
   - `src/features/games/` – `useGames()`, `fetchGames()`, `<GamePicker />`.
   - `src/providers/AuthProvider.tsx` – `useAuth()` → `{ session, profile, refreshProfile, signOut }`, `useUserId()`.
   - `src/app/_layout.tsx` and `src/app/(tabs)/_layout.tsx` – navigation is already declared;
     you create the screen files those layouts name.
3. Every screen handles **loading, error, empty and success** states.
4. Icons: `import { Ionicons } from '@expo/vector-icons'`. Navigation: `import { router, Link,
   useLocalSearchParams, Stack } from 'expo-router'`. Use `<Stack.Screen options={{ title }} />`
   inside a screen to set its header title dynamically.
5. Accessibility: tappable things have `accessibilityRole`/`accessibilityLabel`; touch targets ≥ 44px.
6. Never put secrets in code. Never use the service_role key in the app.
7. Before finishing, run `npx tsc --noEmit` from the project root and fix every error **in your
   own files** (other agents work in parallel, so errors in their folders are not yours — ignore
   them). Do not install new packages; if you truly need one, list it under "Requests for the lead".
8. Final report (short): files created, anything not done, requests for the lead.

## Ownership

### Backend agent — owns `supabase/**`
SQL migrations implementing exactly `src/lib/types.ts`: tables, CHECK constraints, indexes,
row-level security on every table, RPC functions, realtime, storage bucket `avatars`,
seed data for `games`, and `supabase/README.md` with setup steps.

### Auth & Profile agent — owns
`src/app/(auth)/**`, `src/app/onboarding.tsx`, `src/app/(tabs)/profile.tsx`,
`src/app/user/[id].tsx`, `src/app/settings/**`, `src/app/report.tsx`,
`src/features/profile/**`, `src/features/safety/**`.

### LFG & Squad agent — owns
`src/app/(tabs)/index.tsx`, `src/app/(tabs)/squad.tsx`, `src/app/lfg/**`,
`src/features/lfg/**`, `src/features/squad/**`.

### Chat & Friends agent — owns
`src/app/(tabs)/chats.tsx`, `src/app/chat/[id].tsx`, `src/app/friends.tsx`,
`src/features/chat/**`, `src/features/friends/**`.

## Cross-agent interfaces (build to these exact signatures)

| Provided by | Export | Used by |
| --- | --- | --- |
| Chat & Friends | `src/features/friends/FriendButton.tsx` → `export function FriendButton({ profileId }: { profileId: string })` — shows Add friend / Requested / Accept / Friends and does the action | Auth & Profile (`user/[id]`) |
| Auth & Profile | `src/features/safety/blocks.ts` → `export async function blockUser(id: string): Promise<void>`, `unblockUser(id)`, and `export function useBlockedIds(): { blockedIds: Set<string>; reload(): void }` | Chat & Friends, LFG & Squad (hide blocked users' content) |
| Lead (exists) | `openDm(otherId)`, `openReport(type, id)` in `src/lib/actions.ts` | everyone |

Routes (already declared in the root layout):
`/(auth)/sign-in`, `/(auth)/sign-up`, `/onboarding`, `/(tabs)` (`index`=LFG board, `squad`,
`chats`, `profile`), `/lfg/new`, `/lfg/[id]`, `/user/[id]`, `/settings/edit-profile`,
`/settings/blocked`, `/report?type=profile|message|lfg_post&id=<uuid>`, `/chat/[id]`, `/friends`.

## Product details

- **Auth:** email + password sign up / sign in, "forgot password" sends a reset email.
  Users must confirm they are 18+ or 13–17 with a parent's permission at sign-up (checkbox),
  and accept the Terms + Community Guidelines (links can be placeholders).
- **Onboarding (after first sign-in, before the app):** username (check
  `is_username_available`), display name, region, languages, play style, mic yes/no,
  play times, pick games and optional rank/role per game, optional avatar (upload to
  `avatars/<userId>/avatar.jpg`, store public URL). Inserts `profiles` + `profile_games`,
  then calls `refreshProfile()`.
- **LFG board (home tab):** open, unexpired posts newest first, filter by game/region/
  language; tap → detail; "Request to join" with optional message; author sees requests
  and accepts/declines (`accept_lfg_request`); after acceptance both can open the group chat
  (`conversation_id`). Author can close the post. Report button on every post.
  Hide posts by blocked users.
- **Squad finder tab:** choose game + optional region/language/style filters →
  `find_squadmates` → cards with avatar, name, rank, languages, mic, match %; tap → `/user/[id]`;
  "Message" → `openDm`.
- **Chats:** list via `list_my_conversations` (unread badges), conversation screen with
  realtime messages (Supabase channel on `messages` filtered by `conversation_id`),
  send box, mark read, long-press message → Report. Friends screen: requests in/out,
  accept/decline, friends list → open DM.
- **Profile:** own profile with games, edit profile, friends link, blocked players,
  sign out, delete account (confirm twice, `delete_my_account`). Other user's profile:
  FriendButton, Message, Block, Report.
- **Safety:** report screen with reasons from `REPORT_REASON_LABELS` and optional details,
  inserts into `reports`. Blocking hides each other everywhere.
