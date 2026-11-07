import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

/** Underline segmented control: heading-font labels, 2px primary bar under the selected one. */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.row} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [s.segment, pressed && { backgroundColor: t.colors.surfaceRaised }]}
          >
            <Text style={[s.text, { color: active ? t.colors.text : t.colors.textMuted }]} numberOfLines={1}>
              {o.label}
            </Text>
            <View style={[s.bar, active && { backgroundColor: t.colors.primary }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    segment: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'flex-end' },
    text: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.md,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
      paddingBottom: spacing.sm,
    },
    bar: { alignSelf: 'stretch', height: 2, marginBottom: -StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
  }),
);
