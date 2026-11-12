import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { Notch, Text } from '../../components/ui';
import { designTokens, fontSize, makeStyles, mixHex, spacing, useTheme } from '../../theme';
import { communityErrorMessage, isOwnGgError, toggleGg, useGgState, type GgState, type GgTarget } from './api';
import { compactCount } from './format';

/**
 * GG toggle with count. Filled primary when I've given one; disabled on my own content.
 * Optimistic: the count changes on tap and rolls back if the server refuses.
 */
export function GgButton({
  target,
  id,
  base,
  own,
  compact,
  backdrop,
}: {
  target: GgTarget;
  id: string;
  /** Server values from the row. */
  base: GgState;
  /** My own post / reply: shows the count but can't be tapped. */
  own?: boolean;
  /** Smaller variant for replies. */
  compact?: boolean;
  /** Colour behind the button (for the Protocol notch). */
  backdrop?: string;
}) {
  const t = useTheme();
  const s = useStyles();
  const state = useGgState(target, id, base);
  const active = state.has_gg;
  const fg = active ? t.colors.onPrimary : own ? t.colors.textFaint : t.colors.textMuted;
  const what = target === 'post' ? 'post' : 'reply';

  const onPress = async () => {
    try {
      await toggleGg(target, id, { has_gg: state.has_gg, gg_count: state.gg_count });
    } catch (e) {
      Alert.alert(
        `Couldn't update ${t.words.gg}`,
        isOwnGgError(e) ? `You can't give ${t.words.gg} to your own ${what}.` : communityErrorMessage(e),
      );
    }
  };

  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={own}
      hitSlop={compact ? 6 : 0}
      accessibilityRole="button"
      accessibilityLabel={`${state.gg_count} ${t.words.gg}`}
      accessibilityHint={
        own ? `You can't give ${t.words.gg} to your own ${what}` : active ? `Takes back your ${t.words.gg}` : `Gives this ${what} ${t.words.gg}`
      }
      accessibilityState={{ selected: active, disabled: !!own }}
      style={({ pressed }) => [
        s.button,
        compact && s.compact,
        active
          ? { backgroundColor: pressed ? t.colors.primaryPressed : t.colors.primary }
          : pressed && { backgroundColor: mixHex(designTokens(t).chip.bg, t.colors.text, 0.08) },
      ]}
    >
      <Ionicons name={active ? 'ribbon' : 'ribbon-outline'} size={compact ? 14 : 16} color={fg} />
      <Text style={[s.label, compact && s.labelCompact, { color: fg }]}>
        {compactCount(state.gg_count)} {t.words.gg}
      </Text>
      {active ? <Notch corner="topRight" color={backdrop ?? t.colors.bg} size={compact ? 6 : 8} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      backgroundColor: designTokens(t).chip.bg,
      borderRadius: designTokens(t).lang.corner === 'soft' ? 22 : t.radius.md,
      overflow: 'hidden',
    },
    compact: { minHeight: 32, paddingHorizontal: spacing.sm },
    label: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.md,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    labelCompact: { fontSize: fontSize.sm },
  }),
);
