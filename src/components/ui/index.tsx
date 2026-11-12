// Vinq UI kit. Every component reads the active theme (Protocol / Defuse / Ronin / custom),
// so screens built from these switch look instantly when the player changes theme.
// Feature code should compose these instead of styling raw React Native views.
// Design rules (tonal layers, no boxed borders, editorial headers): docs/DESIGN_SYSTEM.md.
import { Ionicons } from '@expo/vector-icons';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Path, Pattern, Polygon, Rect } from 'react-native-svg';
import { contrast, fontSize, mixHex, spacing, useDesign, useTheme, type AppTheme, type TextureId } from '../../theme';
import { displayLineHeight, Notch, Text, type IconName } from './base';
import { AccentRule, GlyphTile, GradientFill, Kicker } from './decor';

export { CornerMark, displayLineHeight, Notch, Text, textStyle, type IconName, type TextVariant } from './base';
export { AccentRule, AngledEdge, Badge, GlyphTile, GradientFill, Kicker } from './decor';
export { ListRow, SectionHeader, type ListRowProps } from './rows';
export { SegmentedControl, type SegmentOption } from './SegmentedControl';

// ── Screen ──────────────────────────────────────────────────────────────────
export function Screen({
  children,
  scroll,
  padded = true,
  edges = ['top'],
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  // undefined outside a navigator screen, 0 when the header is hidden.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const inner = [padded && { paddingHorizontal: spacing.lg }, style];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScreenTexture />
      {scroll ? (
        // Android is edge-to-edge (the window no longer resizes for the keyboard), so pad on
        // both platforms; under a navigator header, offset by its height.
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={headerHeight}>
          <ScrollView contentContainerStyle={[inner, { paddingBottom: spacing.xxl }]} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/**
 * Editorial screen header: optional kicker (with index number), a big display-font title, an
 * optional right-side action, subtitle, and the theme's accent rule.
 *  - Protocol: red slash bar + "/01" kicker, tight condensed capitals.
 *  - Defuse: "[01]" HUD index in gold, dashed rule with gold end blocks.
 *  - Ronin: red seal + quiet kicker, airy Mincho title, brush-stroke rule.
 */
export function ScreenHeader({
  title,
  right,
  subtitle,
  kicker,
  index,
  rule,
  size = 'lg',
}: {
  title: string;
  right?: ReactNode;
  subtitle?: string;
  /** Small tracked label above the title ("Live now", "Your crew"). */
  kicker?: string;
  /** Section number shown with the kicker ("/01", "[01]", "No.01"). */
  index?: number | string;
  /** Show the accent rule under the header. Defaults on for HUD and ink themes. */
  rule?: boolean;
  /** 'md' for stacked / secondary screens. */
  size?: 'md' | 'lg';
}) {
  const t = useTheme();
  const d = useDesign();
  const titleSize = size === 'md' ? 32 : d.lang.header === 'ink' ? 36 : 44;
  const showRule = rule ?? d.lang.header !== 'tactical';
  return (
    <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs }}>
      {kicker || index != null ? <Kicker index={index}>{kicker}</Kicker> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            flexShrink: 1,
            fontFamily: t.fonts.display,
            fontSize: titleSize,
            lineHeight: displayLineHeight(t, titleSize),
            color: t.colors.text,
            letterSpacing: t.shape.headingUppercase ? Math.min(t.shape.headingLetterSpacing, 1) : t.shape.headingLetterSpacing,
            textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
          }}
        >
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? <Text variant="label">{subtitle}</Text> : null}
      {showRule ? <AccentRule style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
/**
 * primary – filled primary (notched in Protocol, HUD highlight in Defuse)
 * secondary – tonal fill, no border (the de-boxed default for second actions)
 * outline – the old bordered secondary, for use on top of tonal cards that need separation
 * ghost – text only; danger – filled danger
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  size = 'md',
  /** Background behind the button, so the Protocol notch blends in. Defaults to the screen background. */
  backdrop,
  accessibilityLabel,
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
  backdrop?: string;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const d = useDesign();
  const c = t.colors;
  const isDisabled = disabled || loading;
  const dangerFg = contrast('#FFFFFF', c.danger) >= 4.5 ? '#FFFFFF' : '#111111';
  const fg =
    variant === 'primary' ? c.onPrimary : variant === 'danger' ? dangerFg : variant === 'secondary' || variant === 'outline' ? c.text : d.primaryText;
  const filled = variant === 'primary' || variant === 'danger';
  const radius = d.lang.corner === 'soft' ? Math.max(t.radius.md, 6) : t.radius.md;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      // Small buttons are 40 tall; the slop brings the touch target to 44+.
      hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
      style={({ pressed }) => [
        {
          minHeight: size === 'sm' ? 40 : 52,
          paddingHorizontal: size === 'sm' ? spacing.lg : spacing.xl,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        variant === 'primary' && { backgroundColor: pressed ? c.primaryPressed : c.primary },
        variant === 'danger' && { backgroundColor: c.danger, opacity: pressed ? 0.8 : 1 },
        variant === 'secondary' && { backgroundColor: pressed ? mixHex(d.chip.bg, c.text, 0.08) : d.chip.bg },
        variant === 'outline' && { backgroundColor: pressed ? c.surfaceRaised : 'transparent', borderWidth: 1, borderColor: c.border },
        variant === 'ghost' && { backgroundColor: pressed ? c.surfaceRaised : 'transparent' },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {/* Defuse-style HUD bevel: a lighter line along the top of filled square buttons. */}
      {filled && d.lang.corner === 'square' ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#FFFFFF', opacity: 0.22 }} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} style={{ marginRight: spacing.sm }} /> : null}
          <RNText
            style={{
              fontFamily: t.fonts.heading,
              fontSize: size === 'sm' ? 16 : 19,
              color: fg,
              letterSpacing: t.shape.headingLetterSpacing,
              textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
            }}
          >
            {title}
          </RNText>
        </View>
      )}
      {filled ? <Notch corner="topRight" color={backdrop ?? c.bg} size={size === 'sm' ? 8 : undefined} /> : null}
    </Pressable>
  );
}

// ── TextField ───────────────────────────────────────────────────────────────
/** Tonal input with an underline that lights up in primary on focus (no boxed border). */
export function TextField({
  label,
  error,
  hint,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const t = useTheme();
  const d = useDesign();
  const [focused, setFocused] = useState(false);
  const line = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Text variant="label" style={{ marginBottom: spacing.xs }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.colors.textFaint}
        selectionColor={t.colors.primary}
        cursorColor={t.colors.primary}
        style={[
          {
            backgroundColor: t.colors.surface,
            borderBottomWidth: 2,
            borderBottomColor: line,
            borderTopLeftRadius: t.radius.md,
            borderTopRightRadius: t.radius.md,
            borderBottomLeftRadius: d.lang.corner === 'soft' ? t.radius.md : 0,
            borderBottomRightRadius: d.lang.corner === 'soft' ? t.radius.md : 0,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minHeight: 50,
            color: t.colors.text,
            fontFamily: t.fonts.body,
            fontSize: fontSize.md,
          },
          rest.multiline && { minHeight: 96, textAlignVertical: 'top' },
          style,
        ]}
        accessibilityLabel={label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error ? (
        <Text variant="caption" style={{ color: t.colors.danger, marginTop: spacing.xs }}>{error}</Text>
      ) : hint ? (
        <Text variant="caption" style={{ marginTop: spacing.xs }}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
/**
 * A content block, separated from the page by TONE, not a border.
 *  - variant 'tonal' (default): surface fill, no border; Protocol cuts the top-right corner.
 *  - variant 'hero' (or tone="panel"): the dark media panel with the theme's hero gradient.
 *  - variant 'outline': the old bordered look, for nested content that needs a frame.
 *  - variant 'flat': no fill; just padding and press feedback.
 * `media` renders full-bleed at the top (clip thumbnail, game art). `accent` adds a primary
 * stripe along the top edge (featured / live items).
 */
export function Card({
  children,
  onPress,
  style,
  tone = 'surface',
  variant,
  accent,
  media,
  cut,
  backdrop,
  padded = true,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'panel';
  variant?: 'tonal' | 'hero' | 'outline' | 'flat';
  accent?: boolean;
  media?: ReactNode;
  /** Protocol corner cut. Defaults on for cut themes; turn off when the card sits on something other than the screen bg (or pass `backdrop`). */
  cut?: boolean;
  /** Colour behind the card, so the corner cut blends in. Defaults to the screen background. */
  backdrop?: string;
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const d = useDesign();
  const kind = variant ?? (tone === 'panel' ? 'hero' : 'tonal');
  const hero = kind === 'hero';
  const pad = padded ? spacing.lg : 0;
  const base: ViewStyle = {
    backgroundColor: hero ? t.colors.panel : kind === 'flat' ? 'transparent' : t.colors.surface,
    borderRadius: d.lang.corner === 'soft' ? Math.max(t.radius.lg, 8) : t.radius.lg,
    borderWidth: kind === 'outline' ? 1 : 0,
    borderColor: t.colors.border,
    padding: pad,
    overflow: 'hidden',
  };
  const showCut = (cut ?? d.lang.corner === 'cut') && kind !== 'flat';
  const inner = (
    <>
      {hero ? <GradientFill from={d.hero.from} to={d.hero.to} /> : null}
      {media ? <View style={{ marginHorizontal: -pad, marginTop: -pad, marginBottom: spacing.md }}>{media}</View> : null}
      {children}
      {accent ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: t.colors.primary }} /> : null}
      {showCut ? <Notch corner="topRight" color={backdrop ?? t.colors.bg} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={({ pressed }) => [
          base,
          pressed && (hero ? { opacity: 0.9 } : { backgroundColor: kind === 'flat' ? d.surface.high : t.colors.surfaceRaised }),
          style,
        ]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{inner}</View>;
}

// ── Media panel decoration + screen texture ─────────────────────────────────
/**
 * Media panel decoration, per the theme's `panelStyle`: corner brackets (Protocol / Defuse),
 * a thin accent frame (Ronin), or nothing. Put it last inside the panel. `theme` overrides the
 * active theme (theme previews).
 */
export function PanelFrame({ theme }: { theme?: AppTheme } = {}) {
  const active = useTheme();
  const t = theme ?? active;
  const style = t.panelStyle ?? 'bracket';
  if (style === 'plain') return null;
  if (style === 'frame') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: t.colors.accent, opacity: 0.5, margin: 8, borderRadius: Math.max(0, t.radius.lg - 4) }]} />;
  }
  const c = t.colors.primary;
  const L = 18;
  const w = 2;
  const corner = (pos: ViewStyle, d: string) => (
    <View pointerEvents="none" style={[{ position: 'absolute', width: L, height: L }, pos]}>
      <Svg width={L} height={L}>
        <Path d={d} stroke={c} strokeWidth={w} fill="none" />
      </Svg>
    </View>
  );
  return (
    <>
      {corner({ top: 8, left: 8 }, `M1 ${L} V1 H${L}`)}
      {corner({ top: 8, right: 8 }, `M0 1 H${L - 1} V${L}`)}
      {corner({ bottom: 8, left: 8 }, `M1 0 V${L - 1} H${L}`)}
      {corner({ bottom: 8, right: 8 }, `M${L - 1} 0 V${L - 1} H0`)}
    </>
  );
}

// ── Screen texture ──────────────────────────────────────────────────────────
type TextureTile = { w: number; h: number; draw: (c: string) => ReactNode };

/** One small repeating tile per texture id. Kept to a handful of shapes so they stay cheap. */
const TEXTURE_TILES: Record<Exclude<TextureId, 'none'>, TextureTile> = {
  grain: {
    w: 12,
    h: 12,
    draw: (c) => (
      <G fill={c}>
        <Circle cx={2} cy={3} r={0.7} />
        <Circle cx={8} cy={9} r={0.6} />
        <Circle cx={10} cy={2} r={0.5} />
        <Circle cx={5} cy={7} r={0.5} />
      </G>
    ),
  },
  scanlines: { w: 4, h: 4, draw: (c) => <Rect x={0} y={0} width={4} height={1} fill={c} /> },
  frost: {
    w: 36,
    h: 36,
    draw: (c) => (
      <G stroke={c} strokeWidth={1} strokeLinecap="round" fill="none">
        <Path d="M8 3v10M3 8h10M4.5 4.5l7 7M11.5 4.5l-7 7" />
        <Path d="M26 22v6M23 25h6" />
      </G>
    ),
  },
  ash: {
    w: 40,
    h: 40,
    draw: (c) => (
      <G fill={c}>
        <Circle cx={4} cy={6} r={1.2} />
        <Circle cx={19} cy={3} r={0.6} />
        <Circle cx={31} cy={14} r={1} />
        <Circle cx={11} cy={24} r={0.7} />
        <Circle cx={26} cy={33} r={1.4} />
        <Circle cx={37} cy={29} r={0.5} />
      </G>
    ),
  },
  rust: {
    w: 64,
    h: 64,
    draw: (c) => (
      <G fill={c}>
        <Ellipse cx={14} cy={16} rx={10} ry={7} />
        <Ellipse cx={46} cy={44} rx={8} ry={11} opacity={0.6} />
        <Circle cx={50} cy={12} r={3} opacity={0.8} />
        <Circle cx={18} cy={50} r={2} />
      </G>
    ),
  },
  moss: {
    w: 56,
    h: 56,
    draw: (c) => (
      <G fill={c}>
        <Circle cx={12} cy={14} r={9} opacity={0.5} />
        <Circle cx={18} cy={20} r={5} />
        <Circle cx={42} cy={40} r={11} opacity={0.4} />
        <Circle cx={38} cy={44} r={4} />
      </G>
    ),
  },
  stone: {
    w: 60,
    h: 60,
    draw: (c) => (
      <G stroke={c} strokeWidth={1} fill="none">
        <Polygon points="2,4 22,2 28,18 14,28 0,20" />
        <Polygon points="32,6 56,10 58,30 40,34 30,22" />
        <Polygon points="6,36 26,34 32,54 12,58" />
        <Polygon points="38,40 58,42 56,58 40,56" />
      </G>
    ),
  },
  paper: {
    w: 40,
    h: 40,
    draw: (c) => (
      <G stroke={c} strokeWidth={0.6} strokeLinecap="round">
        <Path d="M3 8l9 2M22 4l8 -1M14 22l10 3M30 30l7 -2M5 33l6 1" />
      </G>
    ),
  },
  hex: {
    w: 30,
    h: 51.96,
    draw: (c) => <Path d="M15 0L30 8.66V25.98L15 34.64L0 25.98V8.66ZM15 34.64V51.96" stroke={c} strokeWidth={1} fill="none" />,
  },
  circuit: {
    w: 48,
    h: 48,
    draw: (c) => (
      <G stroke={c} strokeWidth={1} fill="none">
        <Path d="M0 12H16L22 18V48M30 0V10L36 16H48" />
        <Circle cx={22} cy={30} r={2} fill={c} />
        <Circle cx={36} cy={16} r={2} fill={c} />
      </G>
    ),
  },
  waves: {
    w: 40,
    h: 16,
    draw: (c) => <Path d="M0 8Q10 2 20 8T40 8" stroke={c} strokeWidth={1} fill="none" />,
  },
};

/**
 * The theme's background texture as a faint full-size SVG pattern. Sits behind content
 * (Screen renders it first) and never takes touches. Renders nothing for 'none'.
 * `theme` overrides the active theme (previews); opacity is capped at 0.06.
 */
export function ScreenTexture({ theme, opacity = 0.05 }: { theme?: AppTheme; opacity?: number }) {
  const active = useTheme();
  const t = theme ?? active;
  const id = t.texture ?? 'none';
  if (id === 'none') return null;
  const tile = TEXTURE_TILES[id];
  // Unique per texture + colour: on web, pattern ids are document-global.
  const patternId = `gg-tex-${id}-${t.colors.text.replace(/[^0-9a-zA-Z]/g, '')}`;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: Math.min(opacity, 0.06) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={patternId} patternUnits="userSpaceOnUse" x={0} y={0} width={tile.w} height={tile.h}>
            {tile.draw(t.colors.text)}
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
/** Protocol / Defuse: square with a cut corner. Ronin (and round custom themes): round with an accent ring. */
export function Avatar({
  uri,
  name,
  size = 44,
  highlight,
  icon,
  backdrop,
  online,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  highlight?: boolean;
  /** Show an icon instead of initials (e.g. 'people' for group chats). */
  icon?: IconName;
  /** Colour behind the avatar, so the Protocol notch blends in (pass t.colors.panel on dark panels). */
  backdrop?: string;
  /** Small presence dot at the bottom-right. */
  online?: boolean;
}) {
  const t = useTheme();
  const d = useDesign();
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase();
  const round = !!t.shape.round;
  const box: ViewStyle = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : t.radius.sm,
    backgroundColor: highlight ? t.colors.primary : d.chip.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: round ? 2 : 0,
    borderColor: t.colors.accent,
  };
  const dot = Math.max(10, Math.round(size * 0.24));
  return (
    <View style={{ width: size, height: size }}>
      <View style={box}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
        ) : icon ? (
          <Ionicons name={icon} size={size * 0.5} color={highlight ? t.colors.onPrimary : t.colors.text} />
        ) : (
          <RNText style={{ color: highlight ? t.colors.onPrimary : t.colors.text, fontFamily: t.fonts.heading, fontSize: size * 0.4 }}>{initials}</RNText>
        )}
        {!round ? <Notch corner="bottomRight" color={backdrop ?? t.colors.bg} size={Math.round(size * 0.25)} /> : null}
      </View>
      {online ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            right: round ? 0 : -2,
            [round ? 'bottom' : 'top']: round ? 0 : -2,
            width: dot,
            height: dot,
            borderRadius: round ? dot / 2 : 0,
            backgroundColor: t.colors.accent,
            borderWidth: 2,
            borderColor: backdrop ?? t.colors.bg,
          }}
        />
      ) : null}
    </View>
  );
}

// ── Chip (selectable tag) ───────────────────────────────────────────────────
/**
 * Tonal tag, no border. Selected: ink-on-paper in light themes (with a primary tick in
 * Protocol), primary fill in dark themes. Pressable chips are ≥ 44pt tall to the touch.
 */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  const d = useDesign();
  const fg = selected ? d.selected.fg : d.chip.fg;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon ? <Ionicons name={icon} size={14} color={fg} style={{ marginRight: 4 }} /> : null}
      <RNText style={{ color: fg, fontSize: fontSize.sm, fontFamily: selected ? t.fonts.bodyBold : t.fonts.bodyMedium }}>{label}</RNText>
    </View>
  );
  const chipStyle: ViewStyle[] = [
    {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      minHeight: 36,
      justifyContent: 'center',
      borderRadius: t.radius.pill,
      backgroundColor: d.chip.bg,
      overflow: 'hidden',
    },
    selected ? { backgroundColor: d.selected.bg } : {},
  ];
  const tick =
    selected && d.lang.corner === 'cut' ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: t.colors.primary }} /> : null;
  if (!onPress) {
    return (
      <View style={chipStyle}>
        {content}
        {tick}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [...chipStyle, pressed && !selected && { backgroundColor: mixHex(d.chip.bg, t.colors.text, 0.08) }]}
    >
      {content}
      {tick}
    </Pressable>
  );
}

/** Horizontal wrap of chips. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

// ── Stat, segment bar, section title ────────────────────────────────────────
/** A big display-font number over a small tracked label (squads joined, rating, clips). */
export function Stat({
  value,
  label,
  highlight,
  size = 'md',
  align = 'left',
}: {
  value: string;
  label: string;
  highlight?: boolean;
  size?: 'md' | 'lg';
  align?: 'left' | 'center';
}) {
  const t = useTheme();
  const px = size === 'lg' ? 40 : 28;
  return (
    <View style={{ gap: 2, alignItems: align === 'center' ? 'center' : 'flex-start' }} accessible accessibilityLabel={`${value} ${label}`}>
      <RNText style={{ fontFamily: t.fonts.display, fontSize: px, lineHeight: displayLineHeight(t, px), color: highlight ? t.colors.primary : t.colors.text }}>{value}</RNText>
      <Text variant="kicker" style={{ fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/** Row of blocks: filled = taken slots / earned XP. */
export function SegmentBar({ filled, total, height = 8 }: { filled: number; total: number; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`${filled} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, minWidth: 8, height, backgroundColor: i < filled ? t.colors.primary : t.colors.border }} />
      ))}
    </View>
  );
}

/** Online / live indicator. */
export function LiveDot({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: t.shape.round ? 4 : 0, backgroundColor: t.colors.accent }} />
      {label ? <Text variant="label">{label}</Text> : null}
    </View>
  );
}

// ── Wordmark ────────────────────────────────────────────────────────────────
/** The Vinq logo in the active theme's style. Ronin adds the clan crest. */
export function Wordmark({ size = 30 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} accessibilityRole="header" accessibilityLabel="Vinq">
      <VinqMark size={size * 1.25} />
      <RNText style={{ fontFamily: t.fonts.display, fontSize: size, color: t.colors.text, letterSpacing: t.id === 'ronin' ? 3 : 2 }}>VINQ</RNText>
    </View>
  );
}

/**
 * The Vinq crest (brand logo): a team badge with the "last slot" V carved out.
 * Coloured from the active theme: light themes use a navy panel shield with a primary-colour slot,
 * dark themes use a primary shield with an info-colour slot. Master files: assets/brand/vinq-crest*.svg.
 */
export function VinqMark({ size = 40 }: { size?: number }) {
  const t = useTheme();
  const shield = t.dark ? t.colors.primary : t.colors.panel;
  const slot = t.dark ? t.colors.info : t.colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M50 6 L88 18 L88 50 C88 72 72 86 50 95 C28 86 12 72 12 50 L12 18 Z" fill={shield} />
      <Polygon points="28.72,32.2 39.92,32.2 50,52.36 54.73,42.91 63.69,47.39 53.36,68.04 46.64,68.04" fill={t.colors.bg} />
      <Polygon points="60.08,32.2 71.28,32.2 64.56,45.64 55.6,41.16" fill={slot} />
    </Svg>
  );
}

/** Ronin family crest (mon). */
export function Crest({ size = 40, color }: { size?: number; color?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={20} cy={20} r={18} fill="none" stroke={c} strokeWidth={2} />
      <Circle cx={20} cy={20} r={12} fill="none" stroke={c} strokeWidth={1} />
      <Polygon points="20,4 23,17 36,20 23,23 20,36 17,23 4,20 17,17" fill={c} />
    </Svg>
  );
}

// ── States ──────────────────────────────────────────────────────────────────
export function LoadingState({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator color={t.colors.primary} size="large" />
      {label ? <Text variant="kicker" style={{ marginTop: spacing.lg }}>{label}</Text> : null}
    </View>
  );
}

/**
 * Empty screen / list. A large tonal glyph tile in the theme's shape, a heading, a sentence,
 * and one action. `kicker` adds a small label above the title.
 */
export function EmptyState({
  icon = 'game-controller-outline',
  title,
  message,
  action,
  kicker,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
  kicker?: string;
}) {
  return (
    <View style={styles.center}>
      <GlyphTile icon={icon} size={72} tone="primary" />
      {kicker ? <Kicker style={{ marginTop: spacing.lg }}>{kicker}</Kicker> : null}
      <Text variant="heading" style={{ marginTop: kicker ? spacing.xs : spacing.lg, textAlign: 'center', fontSize: fontSize.xl + 2 }} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text muted style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 320 }}>{message}</Text> : null}
      {action ? <View style={{ marginTop: spacing.xl }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <GlyphTile icon="cloud-offline-outline" size={72} tone="danger" />
      <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: 'center', fontSize: fontSize.xl + 2 }}>
        Couldn&apos;t load this
      </Text>
      <Text muted style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 320 }}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: spacing.xl }}>
          <Button title="Try again" icon="refresh" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** Hairline divider. `inset` indents it from the left; `accent` uses the theme's AccentRule. */
export function Divider({ inset = 0, accent, spacing: gap = spacing.md }: { inset?: number; accent?: boolean; spacing?: number } = {}) {
  const d = useDesign();
  if (accent) return <AccentRule style={{ marginVertical: gap }} />;
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: d.hairline, marginVertical: gap, marginLeft: inset }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
