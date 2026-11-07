# Contributing to GG

Thanks for helping build GG, a social app for gamers with no toxicity. This guide gets you from clone to pull
request.

## 1. Run it locally with your own Supabase

**Use your own free Supabase project.** Never ask for, share, or commit the production keys, and never put a
`service_role` key in the app.

1. Install Node.js 22 (LTS) and git. Fork the repo on GitHub, then:
   ```bash
   git clone https://github.com/<you>/Mvp.git gg && cd gg
   npm install
   ```
2. Create a Supabase project and run every file in `supabase/migrations/` **in order** (`0001` first). Follow
   [supabase/README.md](supabase/README.md) steps 1–4, including the email code templates and the redirect URLs
   `gg://**` and `exp://**`.
3. `cp .env.example .env` and fill in **your** project URL and anon key.
4. `npx expo start`, then scan the QR code with **Expo Go** on your phone.

Push notifications need a real build and Firebase, so you can skip them for most work. AI themes need the
`generate-theme` Edge Function and your own Anthropic key (README section 6). Skip that too unless you work on
themes.

## 2. Branches and pull requests

1. Pick or open an issue first, so two people don't build the same thing. Small fixes can go straight to a PR.
2. Branch from `main`: `git checkout -b fix/chat-scroll` (prefixes: `feat/`, `fix/`, `docs/`, `chore/`).
3. Keep each PR focused on one thing. Screenshots or a short screen recording help a lot for UI changes.
4. Before pushing, run all three. CI runs them too and must be green:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```
5. Open the PR against `main` and fill in the template. The owner reviews and merges.

## 3. Code style

- **TypeScript strict.** No `any` unless there is a comment explaining why. Prefer `unknown` and narrow it.
- **Expo Router:** every file in `src/app/` is a screen. Components, hooks and helpers go in `src/features/…`,
  `src/components/…` or `src/lib/…`.
- **Themes:** GG has several themes, including AI-made ones, so **never hard-code colours, fonts, font weights
  or border radii**. Use `useTheme()` (`t.colors.*`, `t.fonts.*`, `t.radius.*`), `makeStyles`, and the kit in
  `src/components/ui`. Read the rules in [docs/THEME_MIGRATION.md](docs/THEME_MIGRATION.md) and
  [docs/CUSTOM_THEMES.md](docs/CUSTOM_THEMES.md). Use theme words (`t.words.*`) for "GG", "squad", "lobbies"
  and similar labels.
- **Native libraries:** add them with `npx expo install <package>`, never plain `npm install`. Say in the PR if
  a library has native code, because it needs a new app build and can't ship as an over-the-air update.
- **Database changes** go in a **new** numbered file in `supabase/migrations/` (never edit an old one that
  already shipped). Keep Row Level Security on every table, and update `supabase/README.md` and
  `src/lib/types.ts`.
- **Tests:** pure logic (formatting, validation, mapping) gets a Jest test in a `__tests__` folder next to it,
  e.g. `src/features/lfg/__tests__/format.test.ts`.
- Keep the community safe: no features that expose private data, reports, or `toxic` ratings to other players.

## 4. Where things are documented

| What | Where |
| --- | --- |
| Product specs (current phase) | [docs/PHASE2.md](docs/PHASE2.md) |
| Custom AI themes | [docs/CUSTOM_THEMES.md](docs/CUSTOM_THEMES.md) |
| Theme rules for UI code | [docs/THEME_MIGRATION.md](docs/THEME_MIGRATION.md) |
| Backend setup, RPCs, moderation | [supabase/README.md](supabase/README.md) |
| Releasing (owner) | [docs/GO_LIVE.md](docs/GO_LIVE.md) |
| Notes for AI coding agents | [AGENTS.md](AGENTS.md) |

## 5. Be nice

Same rule as the app: no toxicity. Disagree about code, not people.
