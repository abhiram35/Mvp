// Editorial building blocks: SectionHeader (index + kicker + display title + accent rule) and
// ListRow (a divided row instead of a boxed card). Import from '../../components/ui'.
import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { fontSize, spacing, useDesign, useTheme } from '../../theme';
import { Text, type IconName } from './base';
import { AccentRule, GlyphTile, Kicker } from './decor';

// ── SectionHeader ───────────────────────────────────────────────────────────
/**
 * Opens a section of a screen. Anatomy: [index · kicker] / TITLE ··· action → / accent rule.
 * Use instead of `<Text variant="heading">` + a bordered container.
 */
export function SectionHeader({
  title,
  index,
  kicker,
  action,
  actionLabel,
  onAction,
  rule = true,
  style,
}: {
  title: string;
  /** Section number: rendered "/02", "[02]" or "No.02" by theme. */
  index?: number | string;
  /** Small tracked label above the title. */
  kicker?: string;
  /** Custom right-side element (overrides actionLabel). */
  action?: ReactNode;
  /** Text link on the right ("See all"), with onAction. */
  actionLabel?: string;
  onAction?: () => void;
  /** Show the theme's accent rule under the title. Default true. */
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const d = useDesign();
  const right =
    action ??
    (actionLabel && onAction ? (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}, ${title}`}
        hitSlop={8}
        style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]}
      >
        <Text style={{ color: d.primaryText, fontFamily: t.fonts.bodyBold, fontSize: fontSize.sm }}>{actionLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color={d.primaryText} />
      </Pressable>
    ) : null);
  return (
    <View style={[{ marginTop: spacing.xl, marginBottom: spacing.md }, style]}>
      {kicker || index != null ? <Kicker index={index} tone="muted" style={{ marginBottom: 2 }}>{kicker}</Kicker> : null}
      <View style={s.titleRow}>
        <Text variant="heading" accessibilityRole="header" style={{ flexShrink: 1, fontSize: fontSize.xl, lineHeight: Math.round(fontSize.xl * (t.shape.headingUppercase ? 1.1 : 1.35)) }}>
          {title}
        </Text>
        {right}
      </View>
      {rule ? <AccentRule style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

// ── ListRow ─────────────────────────────────────────────────────────────────
export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Third, quiet line (timestamps, meta). */
  meta?: string;
  /** Left element (Avatar, GameLogo…). Overrides `icon`. */
  leading?: ReactNode;
  /** Width of `leading` (for the inset divider). Default 40. */
  leadingWidth?: number;
  /** Shows a tonal GlyphTile on the left. */
  icon?: IconName;
  /** Short value before the chevron (e.g. the active theme). */
  value?: string;
  /** Right element (badge, button). Shown after `value`. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Chevron on the right. Defaults to true when pressable and not danger. */
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Unread / active row: primary edge bar, bolder title, tinted icon. */
  highlight?: boolean;
  /** Bottom divider: 'inset' (after the leading element, default), 'full' or 'none'. */
  divider?: 'inset' | 'full' | 'none';
  titleLines?: number;
  /** Row sits inside an already padded container: no horizontal padding of its own. */
  flush?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A divided list row: leading tile/avatar, title + subtitle + meta, value/trailing/chevron.
 * Rows live directly on the screen background, separated by hairlines — no card boxes.
 * Memoised; pass stable props in long lists. ≥ 56pt tall.
 */
export const ListRow = memo(function ListRow({
  title,
  subtitle,
  meta,
  leading,
  leadingWidth = 40,
  icon,
  value,
  trailing,
  onPress,
  chevron,
  danger,
  disabled,
  highlight,
  divider = 'inset',
  titleLines = 1,
  flush,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ListRowProps) {
  const t = useTheme();
  const d = useDesign();
  const hasLead = !!(leading || icon);
  const showChevron = chevron ?? (!!onPress && !danger);
  const titleColor = danger ? t.colors.danger : t.colors.text;
  const padX = flush ? 0 : spacing.lg;
  const inset = divider === 'full' ? 0 : padX + (hasLead ? (leading ? leadingWidth : 40) + spacing.md : 0);

  const content = (
    <>
      {highlight ? <View style={[s.edge, { backgroundColor: t.colors.primary, left: flush ? -spacing.md : 0 }]} /> : null}
      {leading ?? (icon ? <GlyphTile icon={icon} tone={danger ? 'danger' : 'muted'} active={highlight} /> : null)}
      <View style={s.body}>
        <Text numberOfLines={titleLines} style={{ color: titleColor, fontFamily: highlight ? t.fonts.bodyBold : t.fonts.bodyMedium, fontSize: fontSize.md, lineHeight: 21 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" numberOfLines={2} style={{ lineHeight: 19, color: highlight ? t.colors.text : t.colors.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text variant="caption" numberOfLines={1}>{meta}</Text> : null}
      </View>
      {value ? (
        <Text variant="label" numberOfLines={1} style={s.value}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} /> : null}
      {divider !== 'none' ? <View style={[s.divider, { left: inset, backgroundColor: d.hairline }]} /> : null}
    </>
  );

  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View style={[s.row, flush && s.flush, style]} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.row, flush && s.flush, pressed && { backgroundColor: d.surface.high }, disabled && { opacity: 0.5 }, style]}
    >
      {content}
    </Pressable>
  );
});

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  flush: { paddingHorizontal: 0 },
  body: { flex: 1, gap: 2 },
  value: { flexShrink: 1, maxWidth: '40%', textAlign: 'right' },
  edge: { position: 'absolute', left: 0, top: spacing.sm, bottom: spacing.sm, width: 3 },
  divider: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
