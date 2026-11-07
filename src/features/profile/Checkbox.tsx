import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { makeStyles, spacing, useTheme } from '../../theme';

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
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        style={s.row}
      >
        <View style={[s.box, checked && s.boxOn, !!error && !checked && { borderColor: t.colors.danger }]}>
          {checked ? <Ionicons name="checkmark" size={16} color={t.colors.onPrimary} /> : null}
        </View>
        <View style={{ flex: 1 }}>{typeof label === 'string' ? <Text>{label}</Text> : label}</View>
      </Pressable>
      {error ? <Text variant="caption" style={{ color: t.colors.danger, marginLeft: 36 }}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    box: {
      width: 24,
      height: 24,
      borderRadius: t.radius.sm,
      borderWidth: 2,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    boxOn: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
  }),
);
