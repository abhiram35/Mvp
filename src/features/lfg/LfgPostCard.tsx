import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SegmentBar, Text } from '../../components/ui';
import type { Game, LfgPostWithAuthor } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { expiresSoon, isExpired, regionLabel, timeAgo, timeLeftShort } from './format';

/**
 * One lobby on the board, styled like a server-browser row: ruled separators,
 * game + title on the left, time left on the right, meta in caption text.
 */
export const LfgPostCard = memo(function LfgPostCard({
  post,
  game,
  onPress,
  now = Date.now(),
  taken,
}: {
  post: LfgPostWithAuthor;
  game: Game | undefined;
  onPress?: () => void;
  now?: number;
  /** Accepted players, when already known. Without it the row shows slots needed as text. */
  taken?: number;
}) {
  const t = useTheme();
  const s = useStyles();
  const expired = isExpired(post, now);
  const soon = post.status === 'open' && expiresSoon(post, now);
  const left = timeLeftShort(post.expires_at, now);
  const authorName = post.author?.display_name || post.author?.username || 'Player';
  const slotsLabel = `${post.slots_needed} ${post.slots_needed === 1 ? 'slot' : 'slots'}`;
  const timeLabel = post.status !== 'open' ? post.status : expired || !left ? 'expired' : left;
  const timeColor = soon ? t.colors.primary : post.status !== 'open' || expired ? t.colors.textFaint : t.colors.textMuted;

  const meta = [
    post.rank,
    regionLabel(post.region),
    post.language,
    post.mic_required ? 'Mic required' : null,
    `by ${authorName}`,
  ].filter(Boolean) as string[];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: t.colors.surfaceRaised }]}
      accessibilityRole="button"
      accessibilityLabel={`${game?.name ?? post.game_id}: ${post.title}. ${
        taken != null ? `${taken} of ${post.slots_needed} slots taken` : `Needs ${slotsLabel}`
      }. ${post.status !== 'open' ? post.status : left ? `${left} left` : 'Expired'}. Posted by ${authorName} ${timeAgo(post.created_at, now)}.`}
    >
      <View style={s.main}>
        <Text style={s.game} numberOfLines={1}>
          {game?.emoji ? `${game.emoji} ` : ''}
          {game?.name ?? post.game_id}
        </Text>
        <Text style={s.title} numberOfLines={2}>
          {post.title}
        </Text>

        {taken != null ? (
          <View style={s.slots}>
            <View style={{ flex: 1, maxWidth: 160 }}>
              <SegmentBar filled={Math.min(taken, post.slots_needed)} total={post.slots_needed} height={6} />
            </View>
            <Text variant="caption" style={s.slotsText}>
              {taken}/{post.slots_needed}
            </Text>
          </View>
        ) : (
          <View style={s.slots}>
            <Ionicons name="people" size={13} color={t.colors.accent} />
            <Text variant="caption" style={s.needText}>
              Need {slotsLabel}
            </Text>
          </View>
        )}

        <Text variant="caption" numberOfLines={1} style={s.meta}>
          {meta.join('  ·  ')}
        </Text>
      </View>

      <View style={s.side}>
        <Text style={[s.time, { color: timeColor }]}>{timeLabel}</Text>
        {post.status === 'open' && !expired ? <Text variant="caption">left</Text> : null}      </View>
    </Pressable>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
      minHeight: 44,
    },
    main: { flex: 1, marginRight: spacing.md },
    game: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.sm,
      color: t.colors.textMuted,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    title: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.xl,
      lineHeight: fontSize.xl * 1.15,
      color: t.colors.text,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
      marginTop: 2,
    },
    slots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    slotsText: { color: t.colors.textMuted, fontFamily: t.fonts.bodyBold },
    needText: { color: t.colors.accent, fontFamily: t.fonts.bodyBold },
    meta: { marginTop: spacing.xs, color: t.colors.textMuted },
    side: { alignItems: 'flex-end', minWidth: 48 },
    time: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.lg,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
  }),
);
