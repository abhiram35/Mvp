// Vinq design language: the tokens and per-theme "personality" that sit on top of an
// AppTheme's raw colours. Everything here is DERIVED from fields every theme already has
// (built-in or AI-generated), so a custom ThemeSpec never needs new fields. Built-ins can
// pin their personality explicitly with `AppTheme.design`. See docs/DESIGN_SYSTEM.md.
import type { AppTheme } from './themes';

/** Corner language: diagonal notch (tactical), hard square (HUD), soft lacquer (ink). */
export type CornerStyle = 'cut' | 'square' | 'soft';
/** Screen / section header treatment. */
export type HeaderStyle = 'tactical' | 'hud' | 'ink';
/** Accent rule under headers: solid hairline with a primary tick, dashed HUD line, brush stroke. */
export type RuleStyle = 'tick' | 'dashed' | 'brush';
/** How section index numbers are written: "/01", "[01]", "No.01". */
export type IndexStyle = 'slash' | 'bracket' | 'numero';

export interface DesignLanguage {
  corner: CornerStyle;
  header: HeaderStyle;
  rule: RuleStyle;
  index: IndexStyle;
  /** Height in px of the diagonal cut on the bottom edge of hero bands. 0 = straight edge. */
  heroAngle: number;
}

export interface DesignTokens {
  lang: DesignLanguage;
  /** Tonal ladder used instead of borders. `base` is the screen bg. */
  surface: { sunken: string; base: string; raised: string; high: string };
  /** Divider colour: quieter than `colors.border`. */
  hairline: string;
  /** The primary colour adjusted (if needed) to read as normal-size text on bg AND surface (≥ 4.5:1). */
  primaryText: string;
  /** Solid fill: primary washed into bg. Selected / unread rows, icon tiles. */
  primaryTint: string;
  /** Selected chip / segment: high-contrast pair (≥ 4.5:1 guaranteed by the theme rules). */
  selected: { bg: string; fg: string };
  /** Unselected chip fill + its text (text guaranteed ≥ 4.5:1 on it). */
  chip: { bg: string; fg: string };
  /** Segmented control track. */
  track: string;
  /** The primary nudged to read as small text on panel / hero bands (≥ 4.5:1). */
  primaryOnPanel: string;
  /** Hero band gradient (both stops keep onPanel ≥ 4.5:1). */
  hero: { from: string; to: string };
}

// ── Colour helpers (hex only; anything else passes through untouched) ───────
type RGB = [number, number, number];

function parse(hex: string): RGB | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  const h = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function lum([r, g, b]: RGB): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast of two hex colours (1 when either can't be parsed). */
export function contrast(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 1;
  const la = lum(x);
  const lb = lum(y);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mix two hex colours; t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return a;
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** `#RRGGBB` + alpha → rgba() string. */
export function alpha(hex: string, a: number): string {
  const c = parse(hex);
  if (!c) return hex;
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Nudge `fg` toward white or black until it reaches `min` on every bg (smallest change wins). */
export function ensureContrast(fg: string, bgs: string[], min: number): string {
  const ok = (c: string) => bgs.every((b) => contrast(c, b) >= min);
  if (ok(fg)) return fg;
  let best: { i: number; c: string } | null = null;
  for (const target of ['#FFFFFF', '#000000']) {
    for (let i = 1; i <= 40; i++) {
      const c = mixHex(fg, target, i / 40);
      if (ok(c)) {
        if (!best || i < best.i) best = { i, c };
        break;
      }
    }
  }
  return best ? best.c : fg;
}

// ── Personality ─────────────────────────────────────────────────────────────
/** A theme's design language: pinned on built-ins, derived from shape for custom themes. */
export function designLanguage(t: AppTheme): DesignLanguage {
  if (t.design) return t.design;
  const cut = t.shape.cut;
  if (cut > 0) return { corner: 'cut', header: 'tactical', rule: 'tick', index: 'slash', heroAngle: Math.min(24, cut + 8) };
  if (t.shape.round || t.radius.md >= 8) return { corner: 'soft', header: 'ink', rule: 'brush', index: 'numero', heroAngle: 0 };
  return { corner: 'square', header: 'hud', rule: 'dashed', index: 'bracket', heroAngle: 0 };
}

/** "/01", "[01]" or "No.01" for a section index. */
export function formatIndex(lang: DesignLanguage, index: number | string): string {
  const n = typeof index === 'number' ? String(index).padStart(2, '0') : index;
  if (lang.index === 'bracket') return `[${n}]`;
  if (lang.index === 'numero') return `No.${n}`;
  return `/${n}`;
}

// ── Tokens ──────────────────────────────────────────────────────────────────
const cache = new WeakMap<AppTheme, DesignTokens>();

function build(t: AppTheme): DesignTokens {
  const c = t.colors;
  const lang = designLanguage(t);
  const ink = t.dark ? '#000000' : c.text;

  const primaryTint = mixHex(c.bg, c.primary, t.dark ? 0.16 : 0.1);
  // Also readable on the tint, which is used behind primary text for active filters / unread rows.
  const primaryText = ensureContrast(c.primary, [c.bg, c.surface, primaryTint], 4.5);

  // Chip: the raised tone when muted text still reads on it, else the plain surface.
  const chipBg = contrast(c.textMuted, c.surfaceRaised) >= 4.5 ? c.surfaceRaised : c.surface;

  // Light themes select with ink-on-paper (text/bg is always ≥ 4.5); dark themes with primary.
  const selected = t.dark ? { bg: c.primary, fg: c.onPrimary } : { bg: c.text, fg: c.bg };

  // Hero: the panel with a primary wash at the far corner, backed off until onPanel still reads.
  let wash = 0.22;
  let to = mixHex(c.panel, c.primary, wash);
  while (wash > 0 && contrast(c.onPanel, to) < 4.5) {
    wash -= 0.04;
    to = mixHex(c.panel, c.primary, Math.max(0, wash));
  }

  const track = t.dark ? mixHex(c.bg, '#000000', 0.3) : mixHex(c.bg, c.text, 0.07);

  return {
    lang,
    surface: {
      sunken: mixHex(c.bg, ink, t.dark ? 0.35 : 0.035),
      base: c.bg,
      raised: c.surface,
      high: c.surfaceRaised,
    },
    hairline: mixHex(c.border, c.bg, 0.35),
    primaryText,
    primaryTint,
    selected,
    chip: { bg: chipBg, fg: c.textMuted },
    track: contrast(c.textMuted, track) >= 4.5 ? track : c.bg,
    hero: { from: c.panel, to },
    primaryOnPanel: ensureContrast(c.primary, [c.panel, to], 4.5),
  };
}

/** Design tokens for a theme (cached per theme object, like makeStyles). */
export function designTokens(t: AppTheme): DesignTokens {
  let d = cache.get(t);
  if (!d) {
    d = build(t);
    cache.set(t, d);
  }
  return d;
}
