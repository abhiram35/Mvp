// GG UI kit. Every component reads the active theme (Protocol / Defuse / Ronin),
// so screens built from these switch look instantly when the player changes theme.
// Feature code should compose these instead of styling raw React Native views.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
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
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { fontSize, spacing, useTheme, type AppTheme } from '../../theme';

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
  const inner = [padded && { paddingHorizontal: spacing.lg }, style];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: spacing.xxl }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
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

/** Corner brackets (Protocol / Defuse) or a thin gold frame (Ronin) drawn over a media panel. Put it last inside the panel. */
export function PanelFrame() {
  const t = useTheme();
  if (t.id === 'ronin') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: t.colors.accent, opacity: 0.5, margin: 8 }]} />;
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

// ── Avatar ──────────────────────────────────────────────────────────────────
/** Protocol / Defuse: square with a cut corner. Ronin: round with a gold ring. */
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
  const round = t.id === 'ronin';
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

/** Online / live indicator. */
export function LiveDot({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: t.id === 'ronin' ? 4 : 0, backgroundColor: t.colors.accent }} />
      {label ? <Text variant="label">{label}</Text> : null}
    </View>
  );
}

// ── Wordmark ────────────────────────────────────────────────────────────────
/** The GG logo in the active theme's style. Ronin adds the clan crest. */
export function Wordmark({ size = 30 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} accessibilityRole="header" accessibilityLabel="GG">
      {t.id === 'ronin' ? <Crest size={size * 1.25} /> : null}
      <RNText style={{ fontFamily: t.fonts.display, fontSize: size, color: t.colors.text, letterSpacing: t.id === 'ronin' ? 3 : 2 }}>GG</RNText>
    </View>
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
