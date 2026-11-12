// Lowest layer of the Vinq UI kit: themed text and the Protocol notch. Everything else in
// src/components/ui builds on these. Import from '../../components/ui', not this file.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Text as RNText, View, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { fontSize, useTheme, type AppTheme } from '../../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ── Text ────────────────────────────────────────────────────────────────────
/**
 * display  – huge moment titles (ACE, 1v3 RETAKE, One Blade)
 * title    – screen titles
 * heading  – section titles, card titles
 * body     – normal text
 * strong   – emphasised body text
 * label    – form labels, secondary info
 * caption  – timestamps, hints
 * kicker   – small tracked capitals above a title ("LIVE NOW", "SEASON 3")
 */
export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'strong' | 'label' | 'caption' | 'kicker';

/** Line height that suits the theme's display font (Mincho needs air, condensed fonts sit tight). */
export function displayLineHeight(t: AppTheme, size: number): number {
  return Math.round(size * (t.shape.headingUppercase ? 1.0 : 1.22));
}

export function textStyle(t: AppTheme, variant: TextVariant): TextStyle {
  const heading = (size: number, family: string): TextStyle => ({
    fontFamily: family,
    fontSize: size,
    color: t.colors.text,
    letterSpacing: t.shape.headingLetterSpacing,
    textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
  });
  switch (variant) {
    case 'display':
      return { ...heading(fontSize.moment, t.fonts.display), lineHeight: fontSize.moment * 0.95 };
    case 'title':
      return heading(fontSize.xxl + 4, t.fonts.heading);
    case 'heading':
      return heading(fontSize.lg + 2, t.fonts.heading);
    case 'body':
      return { fontFamily: t.fonts.body, fontSize: fontSize.md, color: t.colors.text, lineHeight: 22 };
    case 'strong':
      return { fontFamily: t.fonts.bodyBold, fontSize: fontSize.md, color: t.colors.text, lineHeight: 22 };
    case 'label':
      return { fontFamily: t.fonts.bodyMedium, fontSize: fontSize.sm, color: t.colors.textMuted };
    case 'caption':
      return { fontFamily: t.fonts.body, fontSize: fontSize.xs, color: t.colors.textFaint };
    case 'kicker':
      return {
        fontFamily: t.fonts.bodyBold,
        fontSize: fontSize.xs,
        lineHeight: 16,
        color: t.colors.textMuted,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
      };
  }
}

export function Text({
  variant = 'body',
  muted,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; muted?: boolean }) {
  const t = useTheme();
  return <RNText style={[textStyle(t, variant), muted && { color: t.colors.textMuted }, style]} {...rest} />;
}

// ── Notch: the diagonal cut used by the Protocol theme ──────────────────────
/** Paints a triangle in `color` over a corner, making the element look cut. Renders nothing when the theme has no cut. */
export function Notch({ corner, color, size }: { corner: 'topRight' | 'bottomLeft' | 'topLeft' | 'bottomRight'; color: string; size?: number }) {
  const t = useTheme();
  const s = size ?? t.shape.cut;
  if (!s) return null;
  // A border triangle (plain View, no SVG): cheap enough for every card in a long list.
  const top = corner === 'topRight' || corner === 'topLeft';
  const right = corner === 'topRight' || corner === 'bottomRight';
  const style: ViewStyle = {
    position: 'absolute',
    width: 0,
    height: 0,
    [top ? 'top' : 'bottom']: 0,
    [right ? 'right' : 'left']: 0,
    [top ? 'borderTopWidth' : 'borderBottomWidth']: s,
    [top ? 'borderTopColor' : 'borderBottomColor']: color,
    [right ? 'borderLeftWidth' : 'borderRightWidth']: s,
    [right ? 'borderLeftColor' : 'borderRightColor']: 'transparent',
  };
  return <View pointerEvents="none" style={style} />;
}

/**
 * A small solid corner triangle in `color` (a "marker", the inverse of a Notch). Plain Views,
 * no SVG, so it is cheap enough for list rows and needs no backdrop colour.
 */
export function CornerMark({ color, size = 8, corner = 'topLeft' }: { color: string; size?: number; corner?: 'topLeft' | 'topRight' }) {
  const left = corner === 'topLeft';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        [left ? 'left' : 'right']: 0,
        width: 0,
        height: 0,
        borderTopWidth: size,
        borderTopColor: color,
        [left ? 'borderRightWidth' : 'borderLeftWidth']: size,
        [left ? 'borderRightColor' : 'borderLeftColor']: 'transparent',
      }}
    />
  );
}
