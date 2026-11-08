// GG custom AI themes (client side). A ThemeSpec is the JSON the generate-theme Edge
// Function stores in custom_themes.spec — see docs/CUSTOM_THEMES.md. The server already
// validates and repairs every spec; the app re-checks it here (without repairing) so a
// bad row can never break the app — anything that fails is simply ignored.
import type { AppTheme, PanelStyle, TextureId, ThemeId } from './themes';

// ── Allowed values (must match docs/CUSTOM_THEMES.md) ───────────────────────
export const DISPLAY_FONT_IDS = [
  'big-shoulders', 'saira-condensed', 'shippori-mincho', 'cinzel', 'bebas-neue', 'oswald',
  'orbitron', 'black-ops-one', 'special-elite', 'rajdhani', 'metal-mania', 'creepster',
] as const;
export const BODY_FONT_IDS = ['barlow', 'saira', 'zen-kaku-gothic-new', 'atkinson-hyperlegible', 'ibm-plex-sans'] as const;
export const TEXTURE_IDS = [
  'none', 'grain', 'scanlines', 'frost', 'ash', 'rust', 'moss', 'stone', 'paper', 'hex', 'circuit', 'waves',
] as const satisfies readonly TextureId[];
export const PANEL_STYLES = ['bracket', 'frame', 'plain'] as const satisfies readonly PanelStyle[];
export const SPEC_COLOR_KEYS = [
  'bg', 'surface', 'surfaceRaised', 'border',
  'text', 'textMuted', 'textFaint',
  'primary', 'primaryPressed', 'onPrimary',
  'accent', 'info', 'warning', 'danger',
  'panel', 'onPanel',
] as const;
export const SPEC_WORD_KEYS = ['gg', 'squad', 'squadUp', 'lobbies', 'community'] as const;

export type DisplayFontId = (typeof DISPLAY_FONT_IDS)[number];
export type BodyFontId = (typeof BODY_FONT_IDS)[number];
export type SpecColorKey = (typeof SPEC_COLOR_KEYS)[number];
export type SpecWordKey = (typeof SPEC_WORD_KEYS)[number];

export interface ThemeSpec {
  version: 1;
  name: string;
  vibe: string;
  dark: boolean;
  colors: Record<SpecColorKey, string>;
  fonts: { display: DisplayFontId; heading: DisplayFontId; body: BodyFontId };
  shape: {
    radius: number; // 0–12
    cut: number; // 0–14
    panelStyle: PanelStyle;
    headingUppercase: boolean;
    headingLetterSpacing: number; // 0–3
  };
  texture: TextureId;
  words: Record<SpecWordKey, string>;
}

export const SPEC_LIMITS = {
  nameMin: 2,
  nameMax: 24,
  vibeMax: 60,
  wordMin: 1,
  wordMax: 16,
  radius: [0, 12],
  cut: [0, 14],
  letterSpacing: [0, 3],
  promptMin: 3,
  promptMax: 300,
} as const;

/**
 * Same pairs and thresholds as the server (docs/CUSTOM_THEMES.md → Validation).
 * `legacyRepair`: rules added after themes were already being saved. A stored theme that
 * predates them is repaired here (same algorithm as the server) instead of being rejected,
 * so a player's existing theme never disappears; the server repairs every new theme.
 */
const CONTRAST_RULES: { fg: SpecColorKey; bgs: SpecColorKey[]; min: number; legacyRepair?: true }[] = [
  { fg: 'text', bgs: ['bg', 'surface'], min: 4.5 },
  { fg: 'textMuted', bgs: ['bg', 'surface'], min: 4.5 },
  { fg: 'textFaint', bgs: ['bg'], min: 3 },
  { fg: 'primary', bgs: ['bg'], min: 3 },
  // Status icons / borders (spoiler tag, "Verified", online dots) sit on bg and surface.
  { fg: 'accent', bgs: ['bg', 'surface'], min: 3, legacyRepair: true },
  { fg: 'warning', bgs: ['bg', 'surface'], min: 3, legacyRepair: true },
  { fg: 'onPrimary', bgs: ['primary'], min: 4.5 },
  { fg: 'onPanel', bgs: ['panel'], min: 4.5 },
];

// ── Fonts: spec font id → family names registered in THEME_FONTS ────────────
type DisplayFamilies = { display: string; heading: string };
type BodyFamilies = { body: string; bodyMedium: string; bodyBold: string };

const DISPLAY_FAMILIES: Record<DisplayFontId, DisplayFamilies> = {
  'big-shoulders': { display: 'BigShouldersDisplay_900Black', heading: 'BigShouldersDisplay_700Bold' },
  'saira-condensed': { display: 'SairaCondensed_800ExtraBold', heading: 'SairaCondensed_700Bold' },
  'shippori-mincho': { display: 'ShipporiMincho_800ExtraBold', heading: 'ShipporiMincho_700Bold' },
  cinzel: { display: 'Cinzel_800ExtraBold', heading: 'Cinzel_700Bold' },
  'bebas-neue': { display: 'BebasNeue_400Regular', heading: 'BebasNeue_400Regular' },
  oswald: { display: 'Oswald_700Bold', heading: 'Oswald_600SemiBold' },
  orbitron: { display: 'Orbitron_800ExtraBold', heading: 'Orbitron_700Bold' },
  'black-ops-one': { display: 'BlackOpsOne_400Regular', heading: 'BlackOpsOne_400Regular' },
  'special-elite': { display: 'SpecialElite_400Regular', heading: 'SpecialElite_400Regular' },
  rajdhani: { display: 'Rajdhani_700Bold', heading: 'Rajdhani_600SemiBold' },
  'metal-mania': { display: 'MetalMania_400Regular', heading: 'MetalMania_400Regular' },
  creepster: { display: 'Creepster_400Regular', heading: 'Creepster_400Regular' },
};

const BODY_FAMILIES: Record<BodyFontId, BodyFamilies> = {
  barlow: { body: 'Barlow_400Regular', bodyMedium: 'Barlow_500Medium', bodyBold: 'Barlow_600SemiBold' },
  saira: { body: 'Saira_400Regular', bodyMedium: 'Saira_500Medium', bodyBold: 'Saira_600SemiBold' },
  'zen-kaku-gothic-new': { body: 'ZenKakuGothicNew_400Regular', bodyMedium: 'ZenKakuGothicNew_500Medium', bodyBold: 'ZenKakuGothicNew_700Bold' },
  // Atkinson Hyperlegible only ships 400 and 700: medium uses the regular cut.
  'atkinson-hyperlegible': { body: 'AtkinsonHyperlegible_400Regular', bodyMedium: 'AtkinsonHyperlegible_400Regular', bodyBold: 'AtkinsonHyperlegible_700Bold' },
  'ibm-plex-sans': { body: 'IBMPlexSans_400Regular', bodyMedium: 'IBMPlexSans_500Medium', bodyBold: 'IBMPlexSans_600SemiBold' },
};

/** Loaded family names for a spec's font ids. */
export function specFonts(fonts: ThemeSpec['fonts']): AppTheme['fonts'] {
  return {
    display: DISPLAY_FAMILIES[fonts.display].display,
    // A heading uses the heading cut of its font (display and heading may share a font id).
    heading: DISPLAY_FAMILIES[fonts.heading].heading,
    ...BODY_FAMILIES[fonts.body],
  };
}

// ── Colour maths (WCAG 2.x) ─────────────────────────────────────────────────
type RGB = [number, number, number];

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function parseHex(value: unknown): RGB | null {
  if (typeof value !== 'string') return null;
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: RGB): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toHex([r, g, b]: RGB): string {
  const h = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Port of the server's repairAgainst (supabase/functions/_shared/themeSpec.ts): nudge `fg`
 * toward white or black (2.5% steps) until it reaches `min` on every bg; smallest change wins.
 */
function repairAgainst(fg: RGB, bgs: RGB[], min: number): RGB | null {
  const passes = (c: RGB) => {
    const rounded = parseHex(toHex(c))!;
    return bgs.every((bg) => contrastRatio(rounded, bg) >= min);
  };
  if (passes(fg)) return fg;
  let best: { steps: number; color: RGB } | null = null;
  for (const target of [[255, 255, 255], [0, 0, 0]] as RGB[]) {
    for (let i = 1; i <= 40; i++) {
      const c = mix(fg, target, i / 40);
      if (passes(c)) {
        if (!best || i < best.steps) best = { steps: i, color: c };
        break;
      }
    }
  }
  return best ? parseHex(toHex(best.color)) : null;
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Validation ──────────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function clamp(v: unknown, [lo, hi]: readonly [number, number], integer: boolean): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.min(hi, Math.max(lo, v));
  return integer ? Math.round(n) : Math.round(n * 10) / 10;
}

function cleanText(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function limited(raw: unknown, min: number, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = cleanText(raw).slice(0, max).trim();
  return s.length >= min ? s : null;
}

/**
 * Name and words: letters (any script, each with up to 3 combining marks such as Devanagari
 * matras or accents), digits, spaces and ' ’ - ! & . only. Keep identical to the server's copy
 * in supabase/functions/_shared/themeSpec.ts.
 */
const PLAIN_WORDS = /^(?:[\p{L}\p{N}]\p{M}{0,3}|[ '’\-!&.])+$/u;

/**
 * Checks an untrusted ThemeSpec (from the database or the Edge Function). Returns a
 * clean spec, or null if anything required is missing, out of the allowed lists, or fails
 * contrast. Numbers are clamped and strings trimmed / length-limited; colours are never
 * repaired here (the server repairs), except accent / warning on themes saved before those
 * rules existed (see CONTRAST_RULES).
 */
export function validateSpec(raw: unknown): ThemeSpec | null {
  if (!isObj(raw)) return null;
  if (raw.version !== undefined && raw.version !== 1) return null;

  if (!isObj(raw.colors)) return null;
  const rgb = {} as Record<SpecColorKey, RGB>;
  const colors = {} as Record<SpecColorKey, string>;
  for (const k of SPEC_COLOR_KEYS) {
    const c = parseHex(raw.colors[k]);
    if (!c) return null;
    rgb[k] = c;
    colors[k] = (raw.colors[k] as string).trim().toUpperCase();
  }
  for (const rule of CONTRAST_RULES) {
    if (rule.bgs.every((b) => contrastRatio(rgb[rule.fg], rgb[b]) >= rule.min)) continue;
    const fixed = rule.legacyRepair ? repairAgainst(rgb[rule.fg], rule.bgs.map((b) => rgb[b]), rule.min) : null;
    if (!fixed) return null;
    rgb[rule.fg] = fixed;
    colors[rule.fg] = toHex(fixed);
  }
  // `dark` always follows the actual background.
  const dark = luminance(rgb.bg) < 0.2;

  if (!isObj(raw.fonts)) return null;
  const display = oneOf(raw.fonts.display, DISPLAY_FONT_IDS);
  const heading = oneOf(raw.fonts.heading, DISPLAY_FONT_IDS);
  const body = oneOf(raw.fonts.body, BODY_FONT_IDS);
  if (!display || !heading || !body) return null;

  const texture = oneOf(raw.texture, TEXTURE_IDS);
  if (!texture) return null;

  if (!isObj(raw.shape)) return null;
  const panelStyle = oneOf(raw.shape.panelStyle, PANEL_STYLES);
  const radius = clamp(raw.shape.radius, SPEC_LIMITS.radius, true);
  const cut = clamp(raw.shape.cut, SPEC_LIMITS.cut, true);
  const headingLetterSpacing = clamp(raw.shape.headingLetterSpacing, SPEC_LIMITS.letterSpacing, false);
  if (!panelStyle || radius === null || cut === null || headingLetterSpacing === null) return null;
  if (typeof raw.shape.headingUppercase !== 'boolean') return null;

  const name = limited(raw.name, SPEC_LIMITS.nameMin, SPEC_LIMITS.nameMax);
  if (!name || !PLAIN_WORDS.test(name)) return null;
  const vibe = limited(raw.vibe, 0, SPEC_LIMITS.vibeMax) ?? '';

  if (!isObj(raw.words)) return null;
  const words = {} as Record<SpecWordKey, string>;
  for (const k of SPEC_WORD_KEYS) {
    const w = limited(raw.words[k], SPEC_LIMITS.wordMin, SPEC_LIMITS.wordMax);
    if (!w || !PLAIN_WORDS.test(w)) return null;
    words[k] = w;
  }

  return {
    version: 1,
    name,
    vibe,
    dark,
    colors,
    fonts: { display, heading, body },
    shape: { radius, cut, panelStyle, headingUppercase: raw.shape.headingUppercase, headingLetterSpacing },
    texture,
    words,
  };
}

// ── Spec → AppTheme ─────────────────────────────────────────────────────────
export const CUSTOM_PREFIX = 'custom:';

/** ThemeId for a custom_themes row id. */
export function customThemeId(rowId: string): ThemeId {
  return `${CUSTOM_PREFIX}${rowId}`;
}

/** custom_themes row id from a ThemeId, or null for built-ins. */
export function customRowId(id: ThemeId): string | null {
  return id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : null;
}

/** Builds the full AppTheme the app renders from a validated spec. */
export function specToAppTheme(spec: ThemeSpec, id: ThemeId, name: string): AppTheme {
  const r = spec.shape.radius;
  return {
    id,
    name: name.trim() || spec.name,
    vibe: spec.vibe,
    dark: spec.dark,
    colors: { ...spec.colors, overlay: hexToRgba(spec.colors.bg, 0.72) },
    fonts: specFonts(spec.fonts),
    radius: {
      sm: r,
      md: r,
      lg: r,
      pill: r >= 8 ? 999 : r,
    },
    shape: {
      cut: spec.shape.cut,
      headingUppercase: spec.shape.headingUppercase,
      headingLetterSpacing: spec.shape.headingLetterSpacing,
      round: r >= 8,
    },
    panelStyle: spec.shape.panelStyle,
    texture: spec.texture,
    words: { ...spec.words },
  };
}
