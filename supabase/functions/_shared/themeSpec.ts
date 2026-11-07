// GG custom themes: ThemeSpec schema, validation, contrast repair and denylists.
// Pure TypeScript with no Deno / Node imports, so it runs in the Edge Function and
// in plain Node tests. Mirrors docs/CUSTOM_THEMES.md ("Validation").

// ── Allowed values ──────────────────────────────────────────────────────────

export const DISPLAY_FONTS = [
  'big-shoulders', 'saira-condensed', 'shippori-mincho', 'cinzel', 'bebas-neue', 'oswald',
  'orbitron', 'black-ops-one', 'special-elite', 'rajdhani', 'metal-mania', 'creepster',
] as const;
export const BODY_FONTS = ['barlow', 'saira', 'zen-kaku-gothic-new', 'atkinson-hyperlegible', 'ibm-plex-sans'] as const;
export const TEXTURES = [
  'none', 'grain', 'scanlines', 'frost', 'ash', 'rust', 'moss', 'stone', 'paper', 'hex', 'circuit', 'waves',
] as const;
export const PANEL_STYLES = ['bracket', 'frame', 'plain'] as const;
export const COLOR_KEYS = [
  'bg', 'surface', 'surfaceRaised', 'border',
  'text', 'textMuted', 'textFaint',
  'primary', 'primaryPressed', 'onPrimary',
  'accent', 'info', 'warning', 'danger',
  'panel', 'onPanel',
] as const;
export const WORD_KEYS = ['gg', 'squad', 'squadUp', 'lobbies', 'community'] as const;

export type DisplayFontId = (typeof DISPLAY_FONTS)[number];
export type BodyFontId = (typeof BODY_FONTS)[number];
export type TextureId = (typeof TEXTURES)[number];
export type PanelStyle = (typeof PANEL_STYLES)[number];
export type ColorKey = (typeof COLOR_KEYS)[number];
export type WordKey = (typeof WORD_KEYS)[number];

export interface ThemeSpec {
  version: 1;
  name: string;
  vibe: string;
  dark: boolean;
  colors: Record<ColorKey, string>;
  fonts: { display: DisplayFontId; heading: DisplayFontId; body: BodyFontId };
  shape: {
    radius: number;
    cut: number;
    panelStyle: PanelStyle;
    headingUppercase: boolean;
    headingLetterSpacing: number;
  };
  texture: TextureId;
  words: Record<WordKey, string>;
}

export const LIMITS = {
  nameMin: 2, nameMax: 24, vibeMax: 60, wordMin: 1, wordMax: 16,
  radius: [0, 12], cut: [0, 14], letterSpacing: [0, 3],
  promptMin: 3, promptMax: 300,
} as const;

// Contrast requirements: [foreground, background(s), minimum ratio].
export const CONTRAST_RULES: { fg: ColorKey; bgs: ColorKey[]; min: number }[] = [
  { fg: 'text', bgs: ['bg', 'surface'], min: 4.5 },
  { fg: 'textMuted', bgs: ['bg', 'surface'], min: 4.5 },
  { fg: 'textFaint', bgs: ['bg'], min: 3 },
  { fg: 'primary', bgs: ['bg'], min: 3 },
  // after primary may have moved:
  { fg: 'onPrimary', bgs: ['primary'], min: 4.5 },
  { fg: 'onPanel', bgs: ['panel'], min: 4.5 },
];

// ── JSON schema (Anthropic tool input) ──────────────────────────────────────

const hex = { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' };

export const THEME_SPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 24, description: 'Suggested theme name, 2–24 chars. Original, no brand or character names.' },
    vibe: { type: 'string', maxLength: 60, description: 'One short line (≤ 60 chars) describing the look.' },
    dark: { type: 'boolean', description: 'true when bg is dark.' },
    colors: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(COLOR_KEYS.map((k) => [k, hex])),
      required: [...COLOR_KEYS],
    },
    fonts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        display: { type: 'string', enum: [...DISPLAY_FONTS] },
        heading: { type: 'string', enum: [...DISPLAY_FONTS] },
        body: { type: 'string', enum: [...BODY_FONTS] },
      },
      required: ['display', 'heading', 'body'],
    },
    shape: {
      type: 'object',
      additionalProperties: false,
      properties: {
        radius: { type: 'integer', minimum: 0, maximum: 12 },
        cut: { type: 'integer', minimum: 0, maximum: 14 },
        panelStyle: { type: 'string', enum: [...PANEL_STYLES] },
        headingUppercase: { type: 'boolean' },
        headingLetterSpacing: { type: 'number', minimum: 0, maximum: 3 },
      },
      required: ['radius', 'cut', 'panelStyle', 'headingUppercase', 'headingLetterSpacing'],
    },
    texture: { type: 'string', enum: [...TEXTURES] },
    words: {
      type: 'object',
      additionalProperties: false,
      properties: {
        gg: { type: 'string', minLength: 1, maxLength: 16, description: 'What a like is called, plural noun. e.g. "GGs", "honours".' },
        squad: { type: 'string', minLength: 1, maxLength: 16, description: 'Lowercase noun for a group. e.g. "squad", "clan", "warband".' },
        squadUp: { type: 'string', minLength: 1, maxLength: 16, description: 'Main call to action, 1–2 words. e.g. "Squad up", "Join clan".' },
        lobbies: { type: 'string', minLength: 1, maxLength: 16, description: 'Tab name for looking-for-group lobbies. e.g. "Lobbies", "Dojo".' },
        community: { type: 'string', minLength: 1, maxLength: 16, description: 'Tab name for discussion. e.g. "Community", "Scrolls".' },
      },
      required: [...WORD_KEYS],
    },
  },
  required: ['name', 'vibe', 'dark', 'colors', 'fonts', 'shape', 'texture', 'words'],
} as const;

/** Tool input schema = ThemeSpec + refusal flag. */
export const CREATE_THEME_TOOL_SCHEMA = {
  ...THEME_SPEC_JSON_SCHEMA,
  properties: {
    refuse: {
      type: 'boolean',
      description: 'true ONLY if the request is hateful, sexual, or harassing. Otherwise false.',
    },
    refuse_reason: { type: 'string', maxLength: 120 },
    ...THEME_SPEC_JSON_SCHEMA.properties,
  },
  required: ['refuse', ...THEME_SPEC_JSON_SCHEMA.required],
};

// ── Colour maths (WCAG 2.x) ─────────────────────────────────────────────────

export type RGB = [number, number, number];

/** "#RRGGBB" → [r,g,b] 0–255, or null if not exactly that format. */
export function parseHex(value: unknown): RGB | null {
  if (typeof value !== 'string') return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  const h = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function relativeLuminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const STEPS = 40; // 2.5% per step

function passesAll(fg: RGB, bgs: RGB[], min: number): boolean {
  // Compare on the rounded colour that will actually be stored.
  const f = parseHex(toHex(fg))!;
  return bgs.every((bg) => contrastRatio(f, bg) >= min);
}

/**
 * Nudge `fg` toward white or black until it reaches `min` contrast against every
 * colour in `bgs`. Tries both directions and keeps the smallest change (the
 * direction that increases contrast). Returns the repaired "#RRGGBB", or null if
 * neither direction can pass.
 */
export function repairAgainst(fg: RGB, bgs: RGB[], min: number): string | null {
  if (passesAll(fg, bgs, min)) return toHex(fg);
  let best: { steps: number; color: RGB } | null = null;
  for (const target of [WHITE, BLACK]) {
    for (let i = 1; i <= STEPS; i++) {
      const c = mix(fg, target, i / STEPS);
      if (passesAll(c, bgs, min)) {
        if (!best || i < best.steps) best = { steps: i, color: c };
        break;
      }
    }
  }
  return best ? toHex(best.color) : null;
}

/** Single-background form: repair(fg, bg, min). */
export function repair(fg: string, bg: string, min: number): string | null {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return null;
  return repairAgainst(f, [b], min);
}

// ── Denylists ───────────────────────────────────────────────────────────────

/** Brand / franchise / studio / platform / character names. Never allowed in `name` or `words`. */
export const BRAND_DENYLIST: string[] = [
  // Sony / PlayStation studios
  'playstation', 'ps4', 'ps5', 'sony', 'god of war', 'kratos', 'atreus', 'the last of us', 'last of us',
  'joel', 'ellie', 'naughty dog', 'uncharted', 'nathan drake', 'ghost of tsushima', 'jin sakai',
  'horizon zero dawn', 'horizon forbidden west', 'aloy', 'bloodborne', 'spider man', 'spiderman',
  // Riot / Valve / shooters
  'valorant', 'riot', 'riot games', 'league of legends', 'counter strike', 'counterstrike', 'csgo', 'cs go',
  'cs2', 'valve', 'steam', 'half life', 'gordon freeman', 'dota', 'team fortress', 'left 4 dead',
  'call of duty', 'modern warfare', 'black ops', 'activision', 'warzone', 'halo', 'master chief', 'cortana',
  'apex legends', 'overwatch', 'rainbow six', 'battlefield', 'titanfall', 'destiny 2', 'bungie', 'doomguy',
  'doom slayer',
  // Mobile / India
  'pubg', 'battlegrounds mobile', 'bgmi', 'krafton', 'free fire', 'freefire', 'garena', 'fortnite',
  'epic games', 'clash of clans', 'clash royale', 'supercell', 'candy crush', 'genshin', 'genshin impact',
  'honkai', 'hoyoverse', 'mihoyo', 'roblox', 'among us', 'mobile legends', 'brawl stars',
  // Nintendo / Microsoft / Sega / others
  'nintendo', 'xbox', 'microsoft', 'zelda', 'hyrule', 'mario', 'luigi', 'bowser', 'pokemon', 'pikachu',
  'kirby', 'metroid', 'samus', 'minecraft', 'mojang', 'sega', 'sonic', 'tekken', 'street fighter',
  'mortal kombat', 'final fantasy', 'sephiroth', 'cloud strife', 'kingdom hearts', 'resident evil',
  'silent hill', 'metal gear', 'solid snake', 'konami', 'capcom', 'square enix', 'bandai namco',
  // Open world / RPG
  'gta', 'grand theft auto', 'rockstar games', 'red dead', 'elden ring', 'fromsoftware', 'from software',
  'dark souls', 'sekiro', 'malenia', 'witcher', 'geralt', 'cd projekt', 'cyberpunk 2077', 'skyrim',
  'elder scrolls', 'fallout', 'bethesda', 'world of warcraft', 'warcraft', 'starcraft', 'diablo',
  'blizzard entertainment', 'assassins creed', 'ubisoft', 'far cry', 'mass effect', 'dragon age', 'bioware',
  'hollow knight', 'tomb raider', 'lara croft', 'ea sports', 'electronic arts', 'fifa', 'ea fc',
  // Comics tie-ins
  'marvel', 'batman', 'arkham',
];

/** Small hate / sexual denylist, applied to the player's prompt (and to output). */
export const ABUSE_DENYLIST: string[] = [
  'nigger', 'nigga', 'faggot', 'fag', 'kike', 'chink', 'spic', 'gook', 'wetback', 'raghead', 'tranny',
  'retard', 'paki', 'nazi', 'hitler', 'swastika', 'sieg heil', 'heil', 'kkk', 'white power', '1488',
  'porn', 'porno', 'pornhub', 'hentai', 'nsfw', 'nude', 'nudes', 'naked', 'sex', 'sexual', 'xxx',
  'boobs', 'tits', 'pussy', 'penis', 'vagina', 'blowjob', 'cum', 'onlyfans', 'rape', 'rapist',
  'pedo', 'paedo', 'pedophile', 'paedophile', 'loli', 'lolicon', 'incest',
  'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'randi',
];

/** Lowercase, strip accents (Pokémon → pokemon), apostrophes removed, other non-alphanumerics → spaces. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Case-insensitive, word-ish match. A term matches when it appears as whole
 * word(s) ("Join Kratos", "kratos-war"), or, for terms of 6+ letters, glued to
 * other words ("KratosClan", "callofduty").
 */
export function findDenylisted(text: string, list: string[]): string | null {
  const norm = normalizeForMatch(text);
  if (!norm) return null;
  const spaced = ` ${norm} `;
  const compact = norm.replace(/ /g, '');
  for (const term of list) {
    const t = normalizeForMatch(term);
    if (!t) continue;
    if (spaced.includes(` ${t} `)) return term;
    const tc = t.replace(/ /g, '');
    if (tc.length >= 6 && compact.includes(tc)) return term;
  }
  return null;
}

// ── Strings ─────────────────────────────────────────────────────────────────

/** Trim, drop control chars, collapse whitespace. */
export function cleanText(s: string): string {
  // deno-lint-ignore no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Cut to `max` chars, preferring a word boundary. */
export function limitText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp >= Math.floor(max / 2) ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '').trim();
}

// Plain words: letters (any script), digits, spaces and a little punctuation.
const PLAIN_WORDS = /^[\p{L}\p{N} '’\-!&.]+$/u;

/** Cleans the player's prompt. Returns null if the length is out of range. */
export function cleanPrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = cleanText(raw);
  if (p.length < LIMITS.promptMin || p.length > LIMITS.promptMax) return null;
  return p;
}

/** true if the player's prompt is obviously hateful / sexual. Brand names are fine here. */
export function isAbusivePrompt(prompt: string): boolean {
  return findDenylisted(prompt, ABUSE_DENYLIST) !== null;
}

// ── Validation + repair ─────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; spec: ThemeSpec; repaired: string[] }
  | { ok: false; status: 'failed' | 'rejected'; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function clampNum(v: unknown, [lo, hi]: readonly [number, number], integer: boolean): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.min(hi, Math.max(lo, v));
  return integer ? Math.round(n) : Math.round(n * 10) / 10;
}

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Validates an untrusted ThemeSpec (e.g. the AI's tool input) and repairs what
 * can be repaired. `status` on failure: 'rejected' = brand / abuse terms,
 * 'failed' = malformed or unrepairable.
 */
export function validateAndRepair(input: unknown): ValidationResult {
  const fail = (reason: string): ValidationResult => ({ ok: false, status: 'failed', reason });
  const reject = (reason: string): ValidationResult => ({ ok: false, status: 'rejected', reason });
  if (!isObj(input)) return fail('not_an_object');

  // Colours
  if (!isObj(input.colors)) return fail('colors_missing');
  const rgb = {} as Record<ColorKey, RGB>;
  for (const k of COLOR_KEYS) {
    const c = parseHex(input.colors[k]);
    if (!c) return fail(`bad_color:${k}`);
    rgb[k] = c;
  }
  const colors = Object.fromEntries(COLOR_KEYS.map((k) => [k, toHex(rgb[k])])) as Record<ColorKey, string>;

  // Contrast repair (foreground moves toward white/black)
  const repaired: string[] = [];
  for (const rule of CONTRAST_RULES) {
    const fg = parseHex(colors[rule.fg])!;
    const bgs = rule.bgs.map((b) => parseHex(colors[b])!);
    const fixed = repairAgainst(fg, bgs, rule.min);
    if (!fixed) return fail(`contrast:${rule.fg}`);
    if (fixed !== colors[rule.fg]) {
      colors[rule.fg] = fixed;
      repaired.push(rule.fg);
    }
  }
  // If primary moved, onPrimary was checked after it (rule order). Final re-check of everything:
  for (const rule of CONTRAST_RULES) {
    const fg = parseHex(colors[rule.fg])!;
    if (!rule.bgs.every((b) => contrastRatio(fg, parseHex(colors[b])!) >= rule.min)) {
      return fail(`contrast:${rule.fg}`);
    }
  }
  const dark = relativeLuminance(parseHex(colors.bg)!) < 0.2;

  // Fonts / enums
  if (!isObj(input.fonts)) return fail('fonts_missing');
  const display = oneOf(input.fonts.display, DISPLAY_FONTS);
  const heading = oneOf(input.fonts.heading, DISPLAY_FONTS);
  const body = oneOf(input.fonts.body, BODY_FONTS);
  if (!display || !heading || !body) return fail('bad_font');
  const texture = oneOf(input.texture, TEXTURES);
  if (!texture) return fail('bad_texture');

  // Shape
  if (!isObj(input.shape)) return fail('shape_missing');
  const panelStyle = oneOf(input.shape.panelStyle, PANEL_STYLES);
  if (!panelStyle) return fail('bad_panel_style');
  const radius = clampNum(input.shape.radius, LIMITS.radius, true);
  const cut = clampNum(input.shape.cut, LIMITS.cut, true);
  const headingLetterSpacing = clampNum(input.shape.headingLetterSpacing, LIMITS.letterSpacing, false);
  if (radius === null || cut === null || headingLetterSpacing === null) return fail('bad_shape_number');
  if (typeof input.shape.headingUppercase !== 'boolean') return fail('bad_heading_uppercase');

  // Name / vibe
  if (typeof input.name !== 'string') return fail('name_missing');
  const name = limitText(cleanText(input.name), LIMITS.nameMax);
  if (name.length < LIMITS.nameMin || !PLAIN_WORDS.test(name)) return fail('bad_name');
  let vibe = typeof input.vibe === 'string' ? limitText(cleanText(input.vibe), LIMITS.vibeMax) : '';

  // Words
  if (!isObj(input.words)) return fail('words_missing');
  const words = {} as Record<WordKey, string>;
  for (const k of WORD_KEYS) {
    const raw = input.words[k];
    if (typeof raw !== 'string') return fail(`word_missing:${k}`);
    const w = limitText(cleanText(raw), LIMITS.wordMax);
    if (w.length < LIMITS.wordMin || !PLAIN_WORDS.test(w)) return fail(`bad_word:${k}`);
    words[k] = w;
  }

  // Denylists
  for (const [field, text] of [['name', name], ...WORD_KEYS.map((k) => [`words.${k}`, words[k]])] as [string, string][]) {
    const hit = findDenylisted(text, BRAND_DENYLIST) ?? findDenylisted(text, ABUSE_DENYLIST);
    if (hit) return reject(`denylisted:${field}`);
  }
  // vibe is private to the player; blank it instead of wasting the generation.
  if (vibe && (findDenylisted(vibe, BRAND_DENYLIST) || findDenylisted(vibe, ABUSE_DENYLIST))) vibe = '';

  return {
    ok: true,
    repaired,
    spec: {
      version: 1,
      name,
      vibe,
      dark,
      colors,
      fonts: { display, heading, body },
      shape: { radius, cut, panelStyle, headingUppercase: input.shape.headingUppercase, headingLetterSpacing },
      texture,
      words,
    },
  };
}
