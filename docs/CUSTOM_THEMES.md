# Vinq – Custom AI themes (spec)

Players describe a vibe ("cold Norse war, blood and gold", "overgrown ruined city, rust and moss") and an AI
design agent turns it into a full Vinq theme. Layouts never change — only the look: colours, fonts, shapes,
panel frames, background texture and theme words.

## Rules
- **Quota:** 2 successful generations per player per calendar month, months counted in **Asia/Kolkata** time
  (reset at 00:00 IST on the 1st). Failed or rejected generations do not count.
- **Switching is free:** players can switch between the 3 built-in themes and their saved custom themes any time.
- **Storage:** max 6 saved custom themes per player; deleting one does not refund quota.
- **Brands:** themes may be *inspired by* a game's mood but must never contain trademarked names, character
  names, logos, official fonts or art. The AI is instructed accordingly AND the server rejects any `words.*`
  or `name` suggestion containing a denylisted term (see function). The player's own description is stored
  privately (never shown to others).
- **Readability is enforced server-side AND client-side** (see validation). A theme that fails is repaired
  (colours nudged until they pass) or rejected — it can never break the app.
- The AI API key lives only in the Supabase Edge Function secrets. The app never sees it.

## ThemeSpec (JSON produced by the AI, stored in `custom_themes.spec`)
```jsonc
{
  "version": 1,
  "name": "Frost Warlord",            // 2–24 chars, the AI's suggested theme name (player can rename)
  "vibe": "Cold Norse war, blood and gold.", // ≤ 60 chars, shown under the name in the picker
  "dark": true,                        // true = dark background
  "colors": {                          // every value "#RRGGBB"
    "bg": "#…", "surface": "#…", "surfaceRaised": "#…", "border": "#…",
    "text": "#…", "textMuted": "#…", "textFaint": "#…",
    "primary": "#…", "primaryPressed": "#…", "onPrimary": "#…",
    "accent": "#…", "info": "#…", "warning": "#…", "danger": "#…",
    "panel": "#…", "onPanel": "#…"
  },
  "fonts": {
    "display": "<DisplayFontId>",      // huge moment titles
    "heading": "<DisplayFontId>",      // titles, buttons, tabs (may equal display)
    "body": "<BodyFontId>"
  },
  "shape": {
    "radius": 0,                       // integer 0–12, used for sm/md/lg (pill = 999 if radius ≥ 8 else radius)
    "cut": 0,                          // integer 0–14, diagonal notch size; 0 = none
    "panelStyle": "bracket",           // "bracket" | "frame" | "plain"
    "headingUppercase": true,
    "headingLetterSpacing": 1          // number 0–3
  },
  "texture": "frost",                  // background texture id, see list
  "words": {                           // each 1–16 chars, plain words, no brand/character names
    "gg": "GGs", "squad": "warband", "squadUp": "Join warband", "lobbies": "Halls", "community": "Sagas"
  }
}
```
`overlay` is derived by the app (`bg` at 72% opacity). Ronin-style round avatars are used when `radius ≥ 8`.

### Allowed font ids
Display/heading (`DisplayFontId`):
| id | family (Google Fonts) | feel |
| --- | --- | --- |
| `big-shoulders` | Big Shoulders Display 900/700 | tall tactical shooter |
| `saira-condensed` | Saira Condensed 800/700 | HUD, esports |
| `shippori-mincho` | Shippori Mincho 800/700 (Latin subset) | samurai, elegant brush-serif |
| `cinzel` | Cinzel 800/700 | epic, mythic, ancient |
| `bebas-neue` | Bebas Neue 400 | bold poster |
| `oswald` | Oswald 700/600 | clean condensed |
| `orbitron` | Orbitron 800/700 | sci-fi, space |
| `black-ops-one` | Black Ops One 400 | military stencil |
| `special-elite` | Special Elite 400 | typewriter, survival, found-notes |
| `rajdhani` | Rajdhani 700/600 | tech, cyber |
| `metal-mania` | Metal Mania 400 | heavy metal, dark fantasy |
| `creepster` | Creepster 400 | horror |

Body (`BodyFontId`): `barlow`, `saira`, `zen-kaku-gothic-new`, `atkinson-hyperlegible`, `ibm-plex-sans`.

### Allowed textures
`none`, `grain`, `scanlines`, `frost`, `ash`, `rust`, `moss`, `stone`, `paper`, `hex`, `circuit`, `waves`.
(Rendered in the app as subtle low-opacity SVG patterns behind screens; never behind body text at more than ~6% opacity.)

### Validation (server and client both apply it)
- All 16 colours present and `#RRGGBB`.
- Contrast (WCAG): `text` vs `bg` and vs `surface` ≥ 4.5; `textMuted` vs `bg` and `surface` ≥ 4.5;
  `textFaint` vs `bg` ≥ 3; `onPrimary` vs `primary` ≥ 4.5; `onPanel` vs `panel` ≥ 4.5; `primary` vs `bg` ≥ 3.
  Server **repairs** failing pairs by moving the foreground lightness toward white/black until it passes;
  if it still fails, the generation is rejected (not counted).
- `dark` must match: relative luminance of `bg` < 0.2 ⇒ true.
- Font ids, texture, panelStyle must be from the lists; numbers clamped to ranges; strings trimmed and length-limited.
- `words.*` and `name` must not contain denylisted terms (case-insensitive).

## Database (migration `0007_custom_themes.sql`)
- `custom_themes`: `id uuid pk`, `owner_id uuid → profiles on delete cascade`, `name text (2–24)`,
  `prompt text (3–300)`, `spec jsonb not null`, `created_at`, `updated_at`.
  RLS: owner can select, update (`name` only), delete own rows. **No client insert** — only the Edge Function
  (service role) inserts.
- `theme_generations`: `id`, `profile_id`, `status text check in ('succeeded','failed','rejected')`,
  `error text null`, `created_at`. RLS: owner can select own rows; no client writes.
- RPC `get_theme_quota()` → jsonb `{ "used": int, "limit": 2, "remaining": int, "resets_at": "<ISO timestamp of next 1st 00:00 IST>", "saved": int, "saved_limit": 6 }`.

## Edge Function `generate-theme` (Deno, `supabase/functions/generate-theme/index.ts`)
- `POST` with the user's JWT (`Authorization: Bearer …`) and body `{ "prompt": string }` (3–300 chars).
- Verifies the user; checks quota (succeeded generations this IST month < 2) and saved count (< 6);
  returns `429 { error: "quota", quota }` or `409 { error: "storage_full" }` otherwise.
- Calls the Anthropic Messages API (model from env `THEME_MODEL`, default `claude-sonnet-5-5`; key from env
  `ANTHROPIC_API_KEY`) with a designer system prompt and a tool whose input schema is the ThemeSpec, forcing
  that tool, so output is structured JSON.
- Validates/repairs per above; on failure logs `theme_generations(status='failed'|'rejected')` and returns
  `422 { error: "invalid_theme" }` (not counted).
- On success inserts `custom_themes` (name = spec.name) and `theme_generations(status='succeeded')`, returns
  `200 { theme: { id, name, spec, created_at }, quota }`.
- Simple abuse guard: prompt is trimmed; prompts that are clearly not about a visual style are still fine (the AI
  just designs something), but obviously hateful/sexual prompts are rejected with `400 { error: "prompt_rejected" }`
  (the AI is told to return a refusal flag; the function also checks a small denylist).

## App
- `src/theme/custom.ts`: `ThemeSpec` types, `validateSpec`, `specToAppTheme(spec, id, name)`, font id → loaded
  family names. `ThemeId` widens to `'protocol' | 'defuse' | 'ronin' | \`custom:${string}\``.
- ThemeProvider loads the player's saved custom themes (select from `custom_themes`) and can activate them;
  fonts for all allowed ids are bundled (Latin only).
- Theme picker: built-ins + "Your themes" + a **Create with AI** card: text box with example prompts, quota line,
  Generate → loading state → preview card → "Use this theme" / "Discard". Rename and delete saved themes.
