# Vinq design system

Goal: stop looking like "boxes in boxes". Screens read like an editorial esports site (big
display type, numbered sections, full-bleed bands, divided lists) while every colour still
comes from the active theme, including players' AI-generated themes.

Code: `src/theme/design.ts` (tokens + personality), `src/components/ui/*` (primitives).
Read tokens with `useDesign()`; read colours with `useTheme()`.

## Principles

1. **Tone, not borders.** Separate things with a tonal ladder (`surface.sunken → base → raised →
   high`) and hairline dividers. Borders only where a control needs an edge (inputs, outline buttons).
2. **Lists are rows, not cards.** Use `ListRow` (icon tile, title, meta, trailing, divider). Cards
   are for things you open: a post, a lobby, a scrim, a tournament.
3. **Sections are headlines.** Every section starts with `SectionHeader`: index + kicker, display
   title, optional "See all", the theme's accent rule.
4. **One loud thing per screen.** The primary colour marks the main action and the selection.
   Everything else is ink and muted ink.
5. **Hero bands for "the thing".** A tournament, a match, a profile: a full-bleed panel band with
   the hero gradient (and an angled bottom edge in Protocol).
6. **Accessible by construction.** `primaryText` is the primary nudged until it reads ≥ 4.5:1 on
   bg and surface; selected chips are ink-on-paper on light themes; hero gradients back off until
   `onPanel` still reads ≥ 4.5:1. Targets ≥ 44pt. Motion respects Reduce Motion.

## Personality per theme

| | Protocol (light, tactical) | Defuse (dark, HUD) | Ronin (dark, ink) | Custom AI themes |
|---|---|---|---|---|
| Corners | 45° cut notches | hard square | soft lacquer radius | derived from `shape` |
| Headers | uppercase tactical, `/01` index | uppercase HUD, `[01]` index | sentence case, `No.01` | derived |
| Accent rule | hairline with a primary tick | dashed HUD line | brush stroke | derived |
| Hero edge | angled bottom (22 px) | straight | straight | angled if `cut > 0` |
| Texture | none | grain | (theme setting) | from spec |

`designLanguage(theme)`: built-ins pin it via `AppTheme.design`; custom themes derive it
(`cut > 0` → tactical, round or radius ≥ 8 → ink, else HUD). No new ThemeSpec fields needed.

## Tokens (`useDesign()`)

`lang` (personality) · `surface.{sunken,base,raised,high}` · `hairline` · `primaryText` ·
`primaryTint` (selected/unread rows, icon tiles) · `selected.{bg,fg}` · `chip.{bg,fg}` ·
`track` (segmented controls) · `hero.{from,to}`. Spacing adds `spacing.section = 40` for the gap
between major sections.

## Primitives

| primitive | use |
|---|---|
| `Text` variants | `display`, `title`, `heading`, `body`, `strong`, `label`, `caption`, `kicker` |
| `SectionHeader` | `title`, `index`, `kicker`, `actionLabel`+`onAction` or `action`, `rule` |
| `ListRow` | divided row: icon/avatar tile, title, meta, trailing, chevron, `onPress` |
| `SegmentedControl` | `value`, `options` (`label`, `badge`), `onChange`, `variant: 'pill' \| 'underline'`; sliding thumb, Reduce-Motion aware |
| `Card` | tonal, borderless by default; `tone="panel"` for hero bands |
| `Kicker`, `AccentRule`, `GlyphTile`, `Badge`, `GradientFill`, `AngledEdge`, `CornerMark`, `Notch` | decoration helpers (react-native-svg gradients, no native deps) |
| `Chip`, `Button`, `TextField`, `Avatar`, `Stat`, `EmptyState`, `ErrorState`, `LoadingState`, `ScreenHeader` | restyled, same props as before |

## Screens using the new language

Lobbies, Community (feed + post rows), Chats, Profile, Notifications, Friends, user profiles,
chat, Duo, Scrims (Practice | Tournaments), scrim and tournament rooms, teams.
