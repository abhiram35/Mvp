import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

/** Big "SquadUp" brand mark used on the auth screens. */
export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <View style={styles.wrap} accessible accessibilityRole="header" accessibilityLabel="SquadUp. Find your squad. No toxicity.">
      <View style={styles.badge}>
        <Ionicons name="game-controller" size={compact ? 26 : 34} color={colors.onPrimary} />
      </View>
      <Text style={[styles.word, compact && { fontSize: 36 }]}>
        Squad<Text style={[styles.word, styles.up, compact && { fontSize: 36 }]}>Up</Text>
      </Text>
      <Text style={styles.tagline}>
        Find your squad. <Text style={[styles.tagline, { color: colors.accent }]}>No toxicity.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: spacing.xxl },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    transform: [{ rotate: '-8deg' }],
  },
  word: {
    fontSize: 48,
    fontWeight: font.weight.bold,
    color: colors.text,
    letterSpacing: -1.5,
  },
  up: { color: colors.primary, fontStyle: 'italic' },
  tagline: {
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    color: colors.textMuted,
    marginTop: spacing.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
