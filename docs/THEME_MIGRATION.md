# Vinq – theme migration brief

The app is now called **Vinq** and has three player-selectable themes:

| Theme | Feel | Key traits |
| --- | --- | --- |
| **Protocol** (default) | 2020-era tactical shooter menus | Light cream screens, deep navy media panels, sharp red primary, tall condensed CAPS headings (Big Shoulders Display), Barlow body, near-square corners with a diagonal notch cut on buttons/avatars, corner brackets on media panels |
| **Defuse** | Counter-strike round HUD | Dark dusty olive-black, gold primary, CT-blue info, green accent, Saira Condensed CAPS headings, Saira body, hard square corners, corner brackets |
| **Ronin** | Samurai | Black lacquer, blood-red primary, old-gold accent, Shippori Mincho headings (not caps), Zen Kaku Gothic body, soft corners, round avatars with gold ring, thin gold frame on panels, words: "honours" instead of GGs, "clan" instead of squad, "Dojo" instead of Lobbies |

## What changed in the shared foundation (read these files)
- `src/theme/themes.ts` – the three `AppTheme` objects. Read the `AppTheme` interface.
- `src/theme/ThemeProvider.tsx` / `src/theme/index.ts` – `useTheme()`, `makeStyles()`, `useThemeSwitcher()`, plus static `spacing` and `fontSize`.
- `src/components/ui/index.tsx` – themed kit: `Text` (variants `display | title | heading | body | strong | label | caption`), `textStyle(t, variant)`, `Screen`, `ScreenHeader`, `Button`, `TextField`, `Card` (`tone="panel"` for dark media/hero areas), `PanelFrame`, `Notch`, `Avatar` (`highlight` prop), `Chip`, `ChipRow`, `Stat`, `SegmentBar`, `LiveDot`, `Wordmark`, `Crest`, `LoadingState`, `EmptyState`, `ErrorState`, `Divider`.
- **Removed exports:** `colors`, `radius`, `font` from `src/theme`. Every file that imported them must migrate.

## Rules
1. No hard-coded colours, font families, font weights or border radii. Use `useTheme()` → `t.colors.*`, `t.fonts.*`, `t.radius.*`, or the kit components. Static `StyleSheet.create` blocks that reference theme values must become `const useStyles = makeStyles((t) => StyleSheet.create({...}))` at module level and `const s = useStyles()` in the component.
2. **Never use `fontWeight`** with theme fonts (custom fonts on Android ignore/break it). Pick the family instead: `t.fonts.body | bodyMedium | bodyBold | heading | display`.
3. Text: prefer `<Text variant=…>`. Headings/titles/buttons automatically follow the theme's caps/letter-spacing. Don't call `.toUpperCase()` yourself.
4. Tab screens open with `<ScreenHeader title=… right=… />` (or the `Wordmark` + filters where it fits) instead of custom header rows.
5. Media/hero areas (clips, LFG post hero, squadmate highlight, profile header band, match overlay) use `<Card tone="panel">` with `<PanelFrame />` as last child; text inside uses `t.colors.onPanel`.
6. Use theme words: `t.words.gg`, `t.words.squad`, `t.words.squadUp`, `t.words.lobbies` wherever that concept appears in copy (e.g. buttons "Squad up" → `t.words.squadUp`, "Find your squad" → `` `Find your ${t.words.squad}` ``).
7. Pressed/selected states: `t.colors.surfaceRaised`; borders `t.colors.border`; muted text `t.colors.textMuted`; timestamps `t.colors.textFaint`; positive/online `t.colors.accent`.
8. Keep all existing behaviour, data access and accessibility. This is a visual migration, not a rewrite.
9. Check every screen reads well in all three themes (Protocol is LIGHT; Defuse and Ronin are DARK) — e.g. never assume white text on the background.
10. Run `npx tsc --noEmit`; fix every error in YOUR files. Other agents migrate other folders in parallel – ignore their errors.
