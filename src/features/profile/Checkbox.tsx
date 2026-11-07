import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { colors, radius, spacing } from '../../theme';

export function Checkbox({
  checked,
  onChange,
  label,
  accessibilityLabel,
  error,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  accessibilityLabel: string;
  error?: string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxOn, !!error && !checked && { borderColor: colors.danger }]}>
          {checked ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
        </View>
        <View style={{ flex: 1 }}>{typeof label === 'string' ? <Text>{label}</Text> : label}</View>
      </Pressable>
      {error ? <Text variant="caption" style={{ color: colors.danger, marginLeft: 36 }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm / 2,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
