// Reputation pieces for the player card (ProfileHeader) and squad finder cards.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { Chip, ChipRow, Text } from '../../components/ui';
import { PUBLIC_RATING_TAGS, RATING_TAG_LABELS, type PlayerStats, type ReputationSummary } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

const SEGMENTS = 10;
/** Ratings needed before the positive share is shown. */
export const MIN_RATINGS_FOR_SCORE = 3;

/** 1580 → "1,580" (no Intl dependency). */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Level + segmented XP bar, for use INSIDE a dark panel (onPanel colours). */
export function PanelLevel({ stats }: { stats: PlayerStats | null }) {
  const t = useTheme();
  const s = useStyles();
  const level = stats?.level ?? 1;
  const into = stats?.xp_into_level ?? 0;
  const need = Math.max(1, stats?.xp_for_next ?? 50);
  const filled = Math.max(0, Math.min(SEGMENTS, Math.floor((into / need) * SEGMENTS)));
  const toNext = Math.max(0, need - into);
  return (
    <View
      style={s.level}
      accessible
      accessibilityLabel={stats ? `Level ${level}. ${formatCount(toNext)} XP to level ${level + 1}.` : 'Level loading'}
    >
      <View style={s.levelBadge}>
        <RNText style={s.levelLabel}>Lv</RNText>
        <RNText style={s.levelValue}>{stats ? level : '–'}</RNText>
      </View>
      <View style={s.xpCol}>
        <View style={s.segments}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <View key={i} style={[s.segment, { backgroundColor: i < filled ? t.colors.primary : t.colors.onPanel, opacity: i < filled ? 1 : 0.2 }]} />
          ))}
        </View>
        <RNText style={s.xpText} numberOfLines={1}>
          {stats ? `${formatCount(toNext)} XP to level ${level + 1}` : ' '}
        </RNText>
      </View>
    </View>
  );
}

/** Teammate rating line + praise badges with counts (normal surface colours). */
export function ReputationDetails({ stats }: { stats: PlayerStats | null }) {
  const t = useTheme();
  const s = useStyles();
  if (!stats) return null;
  const rated = stats.ratings_received >= MIN_RATINGS_FOR_SCORE;
  const pct = stats.ratings_received > 0 ? Math.round((stats.positive_ratings / stats.ratings_received) * 100) : 0;
  const tags = PUBLIC_RATING_TAGS.filter((tag) => stats.tag_counts[tag] > 0).sort((a, b) => stats.tag_counts[b] - stats.tag_counts[a]);
  return (
    <View style={s.rep}>
      <View style={s.repLine}>
        <Ionicons name={rated ? 'shield-checkmark-outline' : 'sparkles-outline'} size={16} color={rated ? t.colors.accent : t.colors.textMuted} />
        <Text variant="label" style={rated ? s.repStrong : undefined}>
          {rated
            ? `${pct}% positive from ${formatCount(stats.ratings_received)} ${stats.ratings_received === 1 ? 'teammate' : 'teammates'}`
            : 'New player — no ratings yet'}
        </Text>
      </View>
      {tags.length > 0 ? (
        <View style={{ marginTop: spacing.sm }} accessibilityLabel="Praise from teammates">
          <ChipRow>
            {tags.map((tag) => (
              <Chip key={tag} icon="star" label={`${RATING_TAG_LABELS[tag]} ×${formatCount(stats.tag_counts[tag])}`} />
            ))}
          </ChipRow>
        </View>
      ) : null}
    </View>
  );
}

/** Compact "Lv 12 · Clutch · Chill" line for squad finder cards. Renders nothing without reputation. */
export function ReputationBadges({ reputation }: { reputation?: ReputationSummary | null }) {
  const s = useStyles();
  if (!reputation) return null;
  const tags = (reputation.top_tags ?? []).filter((tag) => (PUBLIC_RATING_TAGS as readonly string[]).includes(tag)).slice(0, 2);
  return (
    <View style={s.badges} accessible accessibilityLabel={`Level ${reputation.level}${tags.length ? `, known for ${tags.map((x) => RATING_TAG_LABELS[x]).join(' and ')}` : ''}`}>
      <View style={s.lvPill}>
        <RNText style={s.lvPillText}>Lv {reputation.level}</RNText>
      </View>
      {tags.map((tag) => (
        <View key={tag} style={s.tagPill}>
          <RNText style={s.tagPillText}>{RATING_TAG_LABELS[tag]}</RNText>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    level: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.md },
    levelBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 64 },
    levelLabel: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.sm,
      color: t.colors.onPanel,
      opacity: 0.75,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    levelValue: { fontFamily: t.fonts.display, fontSize: 36, lineHeight: 40, color: t.colors.onPanel },
    xpCol: { flex: 1, gap: spacing.xs },
    segments: { flexDirection: 'row', gap: 3 },
    segment: { flex: 1, height: 8, borderRadius: t.shape.round ? 2 : 0 },
    xpText: { fontFamily: t.fonts.body, fontSize: fontSize.xs, color: t.colors.onPanel, opacity: 0.8 },
    rep: { paddingTop: spacing.md },
    repLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    repStrong: { color: t.colors.text },
    badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
    lvPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.primary,
    },
    lvPillText: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.xs + 1,
      color: t.colors.onPrimary,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    tagPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    tagPillText: { fontFamily: t.fonts.bodyMedium, fontSize: fontSize.xs, color: t.colors.textMuted },
  }),
);
