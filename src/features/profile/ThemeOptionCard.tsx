import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Text } from '../../components/ui';
import { THEMES, THEME_ORDER, fontSize, makeStyles, spacing, useTheme, type ThemeId } from '../../theme';

/**
 * A large tappable theme card. The mini preview is drawn from the TARGET theme's own
 * values (THEMES[id]) so players see each look before switching; the card chrome
 * (border, checkmark) follows the active theme.
 */
export function ThemeOptionCard({ id, selected, onPress }: { id: ThemeId; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const s = useStyles();
  const p = THEMES[id];
  const tt = p.shape.headingUppercase ? 'uppercase' : 'none';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${p.name} theme. ${p.vibe}`}
      style={({ pressed }) => [s.card, selected && { borderColor: t.colors.primary, borderWidth: 2 }, pressed && s.pressed]}
    >
      {/* Preview: the target theme's background, panel, display font and primary button. */}
      <View style={[s.preview, { backgroundColor: p.colors.bg, borderRadius: p.radius.md }]}>
        <View style={[s.panel, { backgroundColor: p.colors.panel, borderRadius: p.radius.lg }, p.id === 'ronin' && { borderWidth: 1, borderColor: p.colors.accent }]}>
          <RNText style={{ fontFamily: p.fonts.display, fontSize: 40, lineHeight: 44, color: p.colors.onPanel, letterSpacing: p.shape.headingLetterSpacing, textTransform: tt }}>
            Ace
          </RNText>
          <RNText style={{ fontFamily: p.fonts.body, fontSize: fontSize.xs, color: p.colors.onPanel, opacity: 0.75 }}>
            5 {p.words.gg} · {p.words.squad}
          </RNText>
        </View>
        <View style={s.previewRow}>
          <View style={[s.sampleBtn, { backgroundColor: p.colors.primary, borderRadius: p.radius.md }]}>
            <RNText style={{ fontFamily: p.fonts.heading, fontSize: fontSize.sm, color: p.colors.onPrimary, letterSpacing: p.shape.headingLetterSpacing, textTransform: tt }}>
              {p.words.squadUp}
            </RNText>
          </View>
          <View style={[s.dot, { backgroundColor: p.colors.accent, borderRadius: p.id === 'ronin' ? 5 : 0 }]} />
          <View style={[s.dot, { backgroundColor: p.colors.info, borderRadius: p.id === 'ronin' ? 5 : 0 }]} />
        </View>
      </View>

      <View style={s.info}>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{p.name}</Text>
          <Text variant="label" style={{ marginTop: 2 }}>{p.vibe}</Text>
        </View>
        {selected ? (
          <View style={s.check}>
            <Ionicons name="checkmark" size={18} color={t.colors.onPrimary} />
          </View>
        ) : (
          <View style={s.checkEmpty} />
        )}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.lg,
      padding: spacing.md,
      gap: spacing.md,
    },
    pressed: { backgroundColor: t.colors.surfaceRaised },
    preview: { padding: spacing.md, gap: spacing.sm },
    panel: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sampleBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    dot: { width: 10, height: 10 },
    info: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    check: {
      width: 28,
      height: 28,
      borderRadius: t.id === 'ronin' ? 14 : t.radius.sm,
      backgroundColor: t.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkEmpty: {
      width: 28,
      height: 28,
      borderRadius: t.id === 'ronin' ? 14 : t.radius.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
  }),
);

/** All three themes, stacked. Tapping one re-themes the app instantly. */
export function ThemePickerList({ themeId, onSelect }: { themeId: ThemeId; onSelect: (id: ThemeId) => void }) {
  return (
    <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
      {THEME_ORDER.map((id) => (
        <ThemeOptionCard key={id} id={id} selected={themeId === id} onPress={() => onSelect(id)} />
      ))}
    </View>
  );
}
