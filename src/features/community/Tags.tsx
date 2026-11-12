import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { COMMUNITY_KIND_LABELS, type CommunityPostKind } from '../../lib/types';
import { designTokens, ensureContrast, fontSize, makeStyles, mixHex, spacing, type AppTheme } from '../../theme';

/** Tinted (not outlined) tag colours, cached per theme. Text is nudged to ≥ 4.5:1 on its tint. */
function tagColors(t: AppTheme) {
  const tint = (c: string) => mixHex(t.colors.bg, c, t.dark ? 0.2 : 0.14);
  const info = tint(t.colors.info);
  const accent = tint(t.colors.accent);
  const warning = tint(t.colors.warning);
  return {
    question: { bg: info, fg: ensureContrast(t.colors.info, [info], 4.5) },
    take: { bg: designTokens(t).chip.bg, fg: t.colors.textMuted },
    solved: { bg: accent, fg: ensureContrast(t.colors.accent, [accent], 4.5) },
    spoiler: { bg: warning, fg: ensureContrast(t.colors.text, [warning], 4.5), icon: ensureContrast(t.colors.warning, [warning], 3) },
  };
}
const useTagColors = makeStyles(tagColors);

/** Small tinted tag: Question (info), Take (muted). */
export function KindTag({ kind }: { kind: CommunityPostKind }) {
  const s = useStyles();
  const c = useTagColors()[kind === 'question' ? 'question' : 'take'];
  return (
    <View style={[s.tag, { backgroundColor: c.bg }]}>
      <Text style={[s.text, { color: c.fg }]}>{COMMUNITY_KIND_LABELS[kind]}</Text>
    </View>
  );
}

/** Accent tag shown on solved questions and on the solution reply. */
export function SolvedTag({ label = 'Solved' }: { label?: string }) {
  const s = useStyles();
  const c = useTagColors().solved;
  return (
    <View style={[s.tag, s.row, { backgroundColor: c.bg }]}>
      <Ionicons name="checkmark" size={12} color={c.fg} />
      <Text style={[s.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

/** Warning-tinted tag on posts marked as containing spoilers. */
export function SpoilerTag() {
  const s = useStyles();
  const c = useTagColors().spoiler;
  return (
    <View style={[s.tag, s.row, { backgroundColor: c.bg }]}>
      <Ionicons name="eye-off-outline" size={12} color={c.icon} />
      <Text style={[s.text, { color: c.fg }]}>Spoiler</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    tag: {
      borderRadius: t.radius.sm,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 2,
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
