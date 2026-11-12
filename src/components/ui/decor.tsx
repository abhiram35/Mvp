// Decorative primitives that carry each theme's personality: gradients, accent rules,
// angled edges, icon tiles, kickers and count badges. All SVG is react-native-svg (no
// native gradient/blur deps). Import from '../../components/ui'.
import { Ionicons } from '@expo/vector-icons';
import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { fontSize, formatIndex, spacing, useDesign, useTheme } from '../../theme';
import { CornerMark, Text, type IconName } from './base';

// ── GradientFill ────────────────────────────────────────────────────────────
/**
 * Absolute-fill linear gradient behind content (put it FIRST inside a relatively positioned
 * container with overflow hidden). Never takes touches; hidden from screen readers.
 */
export function GradientFill({
  from,
  to,
  direction = 'diagonal',
  fromOpacity = 1,
  toOpacity = 1,
  style,
}: {
  from: string;
  to: string;
  direction?: 'vertical' | 'horizontal' | 'diagonal';
  fromOpacity?: number;
  toOpacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Pattern / gradient ids are document-global on web and must be plain identifiers.
  const id = `vg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const x2 = direction === 'vertical' ? '0' : '1';
  const y2 = direction === 'horizontal' ? '0' : '1';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
            <Stop offset="0" stopColor={from} stopOpacity={fromOpacity} />
            <Stop offset="1" stopColor={to} stopOpacity={toOpacity} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// ── AccentRule ──────────────────────────────────────────────────────────────
/**
 * The theme's signature divider: a hairline with a primary tick (Protocol), a dashed HUD line
 * with a gold block (Defuse), or a tapering brush stroke (Ronin). Decorative only.
 */
export function AccentRule({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const d = useDesign();
  const common = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };
  if (d.lang.rule === 'brush') {
    return (
      <View {...common} style={[{ height: 8, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>
        <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: t.colors.primary }} />
        <Svg width="70%" height={8} viewBox="0 0 200 8" preserveAspectRatio="none">
          <Path d="M0 4.4 C30 2.2 90 1.6 200 3.6 L200 4.1 C110 5.4 40 6.6 0 5.2 Z" fill={t.colors.accent} opacity={0.75} />
        </Svg>
      </View>
    );
  }
  if (d.lang.rule === 'dashed') {
    return (
      <View {...common} style={[{ height: 4, alignSelf: 'stretch', justifyContent: 'center' }, style]}>
        <Svg width="100%" height={2}>
          <Line x1={0} y1={1} x2="100%" y2={1} stroke={t.colors.border} strokeWidth={1} strokeDasharray="6 4" />
        </Svg>
        <View style={{ position: 'absolute', left: 0, width: 18, height: 3, backgroundColor: t.colors.primary }} />
        <View style={{ position: 'absolute', right: 0, width: 3, height: 4, backgroundColor: t.colors.primary }} />
      </View>
    );
  }
  return (
    <View {...common} style={[{ height: 3, alignSelf: 'stretch', justifyContent: 'center' }, style]}>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: d.hairline }} />
      <View style={{ position: 'absolute', left: 0, width: 28, height: 3, backgroundColor: t.colors.primary }} />
    </View>
  );
}

// ── AngledEdge ──────────────────────────────────────────────────────────────
/**
 * Cuts the bottom edge of a hero band on a diagonal by painting the backdrop colour over it.
 * Put it last inside the band. Height 0 (themes without a hero angle) renders nothing.
 */
export function AngledEdge({ color, height, side = 'right' }: { color: string; height?: number; side?: 'left' | 'right' }) {
  const d = useDesign();
  const h = height ?? d.lang.heroAngle;
  if (!h) return null;
  const points = side === 'right' ? `0,${h} 100,0 100,${h}` : `0,0 100,${h} 0,${h}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -0.5, height: h + 0.5 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={h + 0.5} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none">
        <Polygon points={points} fill={color} />
      </Svg>
    </View>
  );
}

// ── GlyphTile ───────────────────────────────────────────────────────────────
type GlyphTone = 'muted' | 'primary' | 'accent' | 'danger';
/**
 * A tonal icon tile (rows, empty states). Shape follows the theme: round (soft), square with a
 * primary corner marker (cut), plain square (HUD). No SVG, list-safe.
 */
export function GlyphTile({ icon, size = 40, tone = 'muted', active }: { icon: IconName; size?: number; tone?: GlyphTone; active?: boolean }) {
  const t = useTheme();
  const d = useDesign();
  const fg =
    tone === 'primary' ? d.primaryText : tone === 'accent' ? t.colors.accent : tone === 'danger' ? t.colors.danger : active ? d.primaryText : t.colors.textMuted;
  const bg = tone === 'primary' || active ? d.primaryTint : d.chip.bg;
  const round = d.lang.corner === 'soft';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : t.radius.sm,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={fg} />
      {d.lang.corner === 'cut' && (active || tone === 'primary') ? <CornerMark color={t.colors.primary} size={Math.max(5, Math.round(size / 7))} /> : null}
      {round && (active || tone === 'primary') ? (
        <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 1, borderColor: t.colors.accent, opacity: 0.6 }]} />
      ) : null}
    </View>
  );
}

// ── Kicker ──────────────────────────────────────────────────────────────────
/**
 * Small tracked capitals above a title, with the theme's mark: a red bar (Protocol), a
 * bracketed index in gold (Defuse), a red seal (Ronin). `index` adds "/01", "[01]", "No.01".
 */
export function Kicker({
  children,
  index,
  tone = 'primary',
  style,
}: {
  children?: string;
  index?: number | string;
  /** 'primary' colours the text with the readable primary; 'muted' keeps it quiet (mark stays coloured). */
  tone?: 'primary' | 'muted' | 'onPanel';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const d = useDesign();
  const color = tone === 'onPanel' ? t.colors.onPanel : tone === 'muted' ? t.colors.textMuted : d.primaryText;
  const markColor = tone === 'onPanel' ? t.colors.primary : t.colors.primary;
  const mark =
    d.lang.header === 'tactical' ? (
      <View style={{ width: 3, height: 12, backgroundColor: markColor, transform: [{ skewX: '-12deg' }] }} />
    ) : d.lang.header === 'ink' ? (
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: markColor }} />
    ) : null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>
      {index == null || d.lang.header !== 'hud' ? mark : null}
      {index != null ? (
        <Text variant="kicker" style={{ color: tone === 'onPanel' ? t.colors.onPanel : d.lang.header === 'hud' ? d.primaryText : t.colors.textMuted, opacity: tone === 'onPanel' ? 0.85 : 1 }}>
          {formatIndex(d.lang, index)}
        </Text>
      ) : null}
      {children ? (
        <Text variant="kicker" style={{ color, flexShrink: 1 }} numberOfLines={1}>
          {children}
        </Text>
      ) : null}
    </View>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
/**
 * Count badge (unread messages, requests). Renders nothing for 0. `neutral` uses the selected
 * ink pair; `inverse` flips it (for a badge sitting on a selected segment).
 */
export function Badge({ count, max = 99, tone = 'primary', style }: { count: number; max?: number; tone?: 'primary' | 'neutral' | 'inverse'; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const d = useDesign();
  if (!count || count < 0) return null;
  const bg = tone === 'primary' ? t.colors.primary : tone === 'inverse' ? d.selected.fg : d.selected.bg;
  const fg = tone === 'primary' ? t.colors.onPrimary : tone === 'inverse' ? d.selected.bg : d.selected.fg;
  return (
    <View
      style={[
        {
          minWidth: 22,
          height: 22,
          paddingHorizontal: 6,
          borderRadius: d.lang.corner === 'soft' ? 11 : t.radius.sm,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, lineHeight: 16 }}>{count > max ? `${max}+` : String(count)}</Text>
    </View>
  );
}
