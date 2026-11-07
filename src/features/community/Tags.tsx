import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { COMMUNITY_KIND_LABELS, type CommunityPostKind } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

/** Small outlined tag: Question (info), Take (muted). */
export function KindTag({ kind }: { kind: CommunityPostKind }) {
  const t = useTheme();
  const s = useStyles();
  const color = kind === 'question' ? t.colors.info : t.colors.textMuted;
  return (
    <View style={[s.tag, { borderColor: kind === 'question' ? t.colors.info : t.colors.border }]}>
      <Text style={[s.text, { color }]}>{COMMUNITY_KIND_LABELS[kind]}</Text>
    </View>
  );
}

/** Accent tag shown on solved questions and on the solution reply. */
export function SolvedTag({ label = 'Solved' }: { label?: string }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={[s.tag, s.row, { borderColor: t.colors.accent }]}>
      <Ionicons name="checkmark" size={12} color={t.colors.accent} />
      <Text style={[s.text, { color: t.colors.accent }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    tag: {
      borderWidth: 1,
      borderRadius: t.radius.sm,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 1,
      alignSelf: 'flex-start',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    text: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.xs,
      lineHeight: fontSize.xs + 4,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
  }),
);
