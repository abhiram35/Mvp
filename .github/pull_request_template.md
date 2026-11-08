## What and why

<!-- What does this change, and which issue does it close? e.g. "Fixes #12" -->

## Screenshots / recording

<!-- For UI changes. Ideally in two themes (e.g. Protocol and Ronin). -->

## Checklist

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass
- [ ] Changed `supabase/functions/`? `deno check */index.ts`, `deno lint` and `deno test` pass (in `supabase/functions`)
- [ ] No hard-coded colours, fonts or radii (uses `useTheme()` / kit components)
- [ ] Tested on a phone (Expo Go or a build), against my **own** Supabase project
- [ ] New pure logic has a test in `__tests__/`
- [ ] Database change? New migration file (old ones untouched), RLS kept, `supabase/README.md` + `src/lib/types.ts` updated
- [ ] Adds a native library? (needs a new app build, can't ship as an OTA update)
- [ ] No secrets, keys or `.env` committed
