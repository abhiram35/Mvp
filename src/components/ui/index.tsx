// GG UI kit. Every component reads the active theme (Protocol / Defuse / Ronin),
// so screens built from these switch look instantly when the player changes theme.
// Feature code should compose these instead of styling raw React Native views.
import { Ionicons } from '@expo/vector-icons';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, type ComponentProps, type ReactNode } from 'react';
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
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Path, Pattern, Polygon, Rect } from 'react-native-svg';
import { fontSize, spacing, useTheme, type AppTheme, type TextureId } from '../../theme';

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
 */
export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'strong' | 'label' | 'caption';

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

/** Screen header used at the top of tab screens: big themed title, optional right-side action. */
export function ScreenHeader({ title, right, subtitle }: { title: string; right?: ReactNode; subtitle?: string }) {
  return (
    <View style={{ paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? <Text variant="label">{subtitle}</Text> : null}
    </View>
  );
}

// ── Notch: the diagonal cut used by the Protocol theme ──────────────────────
/** Paints a triangle in `color` over a corner, making the element look cut. Renders nothing when the theme has no cut. */
export function Notch({ corner, color, size }: { corner: 'topRight' | 'bottomLeft' | 'topLeft' | 'bottomRight'; color: string; size?: number }) {
  const t = useTheme();
  const s = size ?? t.shape.cut;
  if (!s) return null;
  const pos: ViewStyle = { position: 'absolute', width: s, height: s };
  const points = {
    topRight: `0,0 ${s},0 ${s},${s}`,
    bottomLeft: `0,0 0,${s} ${s},${s}`,
    topLeft: `0,0 ${s},0 0,${s}`,
    bottomRight: `${s},0 ${s},${s} 0,${s}`,
  }[corner];
  if (corner === 'topRight') Object.assign(pos, { top: 0, right: 0 });
  if (corner === 'bottomLeft') Object.assign(pos, { bottom: 0, left: 0 });
  if (corner === 'topLeft') Object.assign(pos, { top: 0, left: 0 });
  if (corner === 'bottomRight') Object.assign(pos, { bottom: 0, right: 0 });
  return (
    <View pointerEvents="none" style={pos}>
      <Svg width={s} height={s}>
        <Polygon points={points} fill={color} />
      </Svg>
    </View>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
  const c = t.colors;
  const isDisabled = disabled || loading;
  const fg = variant === 'primary' ? c.onPrimary : variant === 'danger' ? '#FFFFFF' : variant === 'secondary' ? c.text : c.primary;
  const filled = variant === 'primary' || variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          minHeight: size === 'sm' ? 38 : 50,
          paddingHorizontal: size === 'sm' ? spacing.lg : spacing.xl,
          borderRadius: t.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        variant === 'primary' && { backgroundColor: pressed ? c.primaryPressed : c.primary },
        variant === 'danger' && { backgroundColor: c.danger, opacity: pressed ? 0.8 : 1 },
        variant === 'secondary' && { backgroundColor: pressed ? c.surfaceRaised : 'transparent', borderWidth: 1, borderColor: c.border },
        variant === 'ghost' && { backgroundColor: pressed ? c.surfaceRaised : 'transparent' },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
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
export function TextField({
  label,
  error,
  hint,
  style,
  ...rest
}: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Text variant="label" style={{ marginBottom: spacing.xs }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.colors.textFaint}
        style={[
          {
            backgroundColor: t.colors.surface,
            borderWidth: 1,
            borderColor: error ? t.colors.danger : t.colors.border,
            borderRadius: t.radius.md,
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
/** A content block. `tone="panel"` gives the dark media panel used behind clips and hero areas. */
export function Card({
  children,
  onPress,
  style,
  tone = 'surface',
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'panel';
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: tone === 'panel' ? t.colors.panel : t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: tone === 'panel' ? 0 : 1,
    borderColor: t.colors.border,
    padding: spacing.lg,
    overflow: 'hidden',
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { backgroundColor: tone === 'panel' ? t.colors.panel : t.colors.surfaceRaised, opacity: tone === 'panel' ? 0.9 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

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
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  highlight?: boolean;
  /** Show an icon instead of initials (e.g. 'people' for group chats). */
  icon?: IconName;
  /** Colour behind the avatar, so the Protocol notch blends in (pass t.colors.panel on dark panels). */
  backdrop?: string;
}) {
  const t = useTheme();
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase();
  const round = !!t.shape.round;
  const box: ViewStyle = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : t.radius.sm,
    backgroundColor: highlight ? t.colors.primary : t.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: round ? 2 : 0,
    borderColor: t.colors.accent,
  };
  return (
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
  );
}

// ── Chip (selectable tag) ───────────────────────────────────────────────────
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  const fg = selected ? t.colors.onPrimary : t.colors.textMuted;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon ? <Ionicons name={icon} size={14} color={fg} style={{ marginRight: 4 }} /> : null}
      <RNText style={{ color: fg, fontSize: fontSize.sm, fontFamily: t.fonts.bodyMedium }}>{label}</RNText>
    </View>
  );
  const chipStyle: ViewStyle[] = [
    {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      minHeight: 36,
      justifyContent: 'center',
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    selected ? { backgroundColor: t.colors.primary, borderColor: t.colors.primary } : {},
  ];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={chipStyle}>
      {content}
    </Pressable>
  );
}

/** Horizontal wrap of chips. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

// ── Stat, segment bar, section title ────────────────────────────────────────
/** A number with a small label underneath (squads joined, rating, clips). */
export function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <RNText style={{ fontFamily: t.fonts.display, fontSize: 28, color: highlight ? t.colors.primary : t.colors.text }}>{value}</RNText>
      <Text variant="caption">{label}</Text>
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

/** Online / live indicator, e.g. "Playing Valorant". */
export function LiveDot({ label, numberOfLines }: { label?: string; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      <View style={{ width: 8, height: 8, borderRadius: t.shape.round ? 4 : 0, backgroundColor: t.colors.accent }} />
      {label ? (
        <Text variant="label" numberOfLines={numberOfLines} style={{ color: t.colors.accent, flexShrink: 1 }}>
          {label}
        </Text>
      ) : null}
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
    <View style={styles.center}>
      <ActivityIndicator color={t.colors.primary} size="large" />
      {label ? <Text muted style={{ marginTop: spacing.md }}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon = 'game-controller-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={t.colors.textFaint} />
      <Text variant="heading" style={{ marginTop: spacing.md, textAlign: 'center' }}>{title}</Text>
      {message ? <Text muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>{message}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this"
      message={message}
      action={onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginVertical: spacing.md }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
