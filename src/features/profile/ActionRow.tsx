import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, type IconName } from '../../components/ui';
import { colors, spacing } from '../../theme';

/** A full-width settings-style row with icon, label and chevron. */
export function ActionRow({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }, disabled && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      {!danger ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.lg },
  label: { marginLeft: spacing.md },
});
