// Shared UI building blocks. Feature code should compose these rather than
// re-styling raw React Native views, so the whole app stays consistent.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
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
import { colors, font, radius, spacing } from '../../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ── Text ────────────────────────────────────────────────────────────────────
type TextVariant = 'title' | 'heading' | 'body' | 'label' | 'caption';
const textVariants: Record<TextVariant, TextStyle> = {
  title: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.text },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.text },
  body: { fontSize: font.size.md, color: colors.text },
  label: { fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.textMuted },
  caption: { fontSize: font.size.xs, color: colors.textFaint },
};

export function Text({
  variant = 'body',
  muted,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; muted?: boolean }) {
  return <RNText style={[textVariants[variant], muted && { color: colors.textMuted }, style]} {...rest} />;
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
  const inner = [padded && { paddingHorizontal: spacing.lg }, style];
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
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
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
}) {
  const isDisabled = disabled || loading;
  const fg =
    variant === 'primary' || variant === 'danger' ? colors.onPrimary : variant === 'secondary' ? colors.text : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        variant === 'primary' && { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
        variant === 'secondary' && { backgroundColor: pressed ? colors.surfaceRaised : colors.surface, borderWidth: 1, borderColor: colors.border },
        variant === 'ghost' && { backgroundColor: pressed ? colors.surface : 'transparent' },
        variant === 'danger' && { backgroundColor: pressed ? '#E04461' : colors.danger },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} style={{ marginRight: spacing.sm }} /> : null}
          <RNText style={[styles.buttonText, size === 'sm' && { fontSize: font.size.sm }, { color: fg }]}>{title}</RNText>
        </View>
      )}
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
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Text variant="label" style={{ marginBottom: spacing.xs }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={[styles.input, rest.multiline && { minHeight: 96, textAlignVertical: 'top' }, !!error && { borderColor: colors.danger }, style]}
        accessibilityLabel={label}
        {...rest}
      />
      {error ? (
        <Text variant="caption" style={{ color: colors.danger, marginTop: spacing.xs }}>{error}</Text>
      ) : hint ? (
        <Text variant="caption" style={{ marginTop: spacing.xs }}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceRaised }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[box, { backgroundColor: colors.surfaceRaised }]} accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, styles.avatarFallback]}>
      <RNText style={{ color: colors.text, fontWeight: font.weight.bold, fontSize: size * 0.38 }}>{initials}</RNText>
    </View>
  );
}

// ── Chip (selectable tag) ───────────────────────────────────────────────────
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const content = (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={14} color={selected ? colors.onPrimary : colors.textMuted} style={{ marginRight: 4 }} /> : null}
      <RNText style={{ color: selected ? colors.onPrimary : colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
        {label}
      </RNText>
    </View>
  );
  const chipStyle = [styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={chipStyle}>
      {content}
    </Pressable>
  );
}

/** Horizontal wrap of chips. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

// ── States ──────────────────────────────────────────────────────────────────
export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text muted style={{ marginTop: spacing.md }}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = 'game-controller-outline',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.textFaint} />
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
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  buttonText: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  avatarFallback: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 32,
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
