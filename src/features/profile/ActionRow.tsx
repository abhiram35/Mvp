import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, type IconName } from '../../components/ui';
import { makeStyles, spacing, useTheme } from '../../theme';

/** A full-width ruled row with icon, label, optional value and chevron. */
export function ActionRow({
  icon,
  label,
  value,
  onPress,
  danger,
  disabled,
  last,
}: {
  icon: IconName;
  label: string;
  /** Short current value shown before the chevron (e.g. the active theme). */
  value?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Omit the bottom rule on the last row of a group. */
  last?: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const color = danger ? t.colors.danger : t.colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.row, !last && s.rule, pressed && s.pressed, disabled && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={20} color={danger ? t.colors.danger : t.colors.textMuted} />
      <Text variant="strong" style={[s.label, { color }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      {value ? <Text variant="label" style={s.value}>{value}</Text> : null}
      {!danger ? <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.xs },
    rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.border },
    pressed: { backgroundColor: t.colors.surfaceRaised },
    label: { marginLeft: spacing.md },
    value: { marginRight: spacing.sm },
  }),
);
