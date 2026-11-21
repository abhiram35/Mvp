import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { displayLineHeight, SegmentBar, Text } from '../../components/ui';
import type { Game, LfgPostWithAuthor } from '../../lib/types';
import { designTokens, fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { expiresSoon, isExpired, regionLabel, timeAgo, timeLeftShort } from './format';

const NUMERAL_W = 52;

/**
 * One lobby on the board, laid out like a match-browser line: a big display numeral of open
 * slots on the left, game kicker + headline title + slots/meta in the middle, time left on the
 * right. Rows are divided by an inset hairline — no boxes.
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
  const d = designTokens(t);
  const expired = isExpired(post, now);
  const live = post.status === 'open' && !expired;
  const soon = post.status === 'open' && expiresSoon(post, now);
  const left = timeLeftShort(post.expires_at, now);
  const authorName = post.author?.display_name || post.author?.username || 'Player';
  const slotsLabel = `${post.slots_needed} ${post.slots_needed === 1 ? 'slot' : 'slots'}`;
  const timeLabel = post.status !== 'open' ? post.status : expired || !left ? 'expired' : left;
  const timeColor = soon ? d.primaryText : live ? t.colors.text : t.colors.textFaint;
  const open = taken != null ? Math.max(0, post.slots_needed - taken) : post.slots_needed;

  const meta = [post.rank, regionLabel(post.region), post.language, post.mic_required ? 'Mic required' : null, `by ${authorName}`].filter(
    Boolean,
  ) as string[];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: d.surface.high }]}
      accessibilityRole="button"
      accessibilityLabel={`${game?.name ?? post.game_id}: ${post.title}. ${
        taken != null ? `${taken} of ${post.slots_needed} slots taken` : `Needs ${slotsLabel}`
      }. ${post.status !== 'open' ? post.status : left ? `${left} left` : 'Expired'}. Posted by ${authorName} ${timeAgo(post.created_at, now)}.`}
    >
      {/* Open slots as a display numeral: the first thing a player scans for. */}
      <View style={s.numeralCol}>
        <Text style={[s.numeral, { color: live ? t.colors.primary : t.colors.textFaint }]}>{live ? `+${open}` : '–'}</Text>
        <Text variant="kicker" style={s.numeralLabel}>
          {live ? (open === 1 ? 'slot' : 'slots') : 'shut'}
        </Text>
      </View>

      <View style={s.main}>
        <Text variant="kicker" style={s.game} numberOfLines={1}>
          {game?.emoji ? `${game.emoji} ` : ''}
          {game?.name ?? post.game_id}
        </Text>
        <Text style={[s.title, !live && { color: t.colors.textMuted }]} numberOfLines={2}>
          {post.title}
        </Text>

        {taken != null ? (
          <View style={s.slots}>
            <View style={{ flex: 1, maxWidth: 140 }}>
              <SegmentBar filled={Math.min(taken, post.slots_needed)} total={post.slots_needed} height={5} />
            </View>
            <Text variant="caption" style={s.slotsText}>
              {taken}/{post.slots_needed}
            </Text>
          </View>
        ) : null}

        <Text variant="caption" numberOfLines={1} style={s.meta}>
          {meta.join('  ·  ')}
        </Text>
      </View>

      <View style={s.side}>
        <Text style={[s.time, { color: timeColor }]}>{timeLabel}</Text>
        {live ? <Text variant="caption">left</Text> : null}
      </View>
      <View style={[s.divider, { backgroundColor: d.hairline }]} />
    </Pressable>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      gap: spacing.md,
    },
    numeralCol: { width: NUMERAL_W, alignItems: 'flex-start' },
    numeral: {
      fontFamily: t.fonts.display,
      fontSize: 34,
      lineHeight: displayLineHeight(t, 34),
      letterSpacing: t.shape.headingUppercase ? 0 : t.shape.headingLetterSpacing,
    },
    numeralLabel: { fontSize: 10, lineHeight: 14, letterSpacing: 1.2 },
    main: { flex: 1 },
    game: { color: t.colors.textMuted },
    title: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.xl,
      lineHeight: Math.round(fontSize.xl * (t.shape.headingUppercase ? 1.12 : 1.35)),
      color: t.colors.text,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
      marginTop: 2,
    },
    slots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    slotsText: { color: t.colors.textMuted, fontFamily: t.fonts.bodyBold },
    meta: { marginTop: spacing.sm, color: t.colors.textMuted },
    side: { alignItems: 'flex-end', minWidth: 48 },
    time: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.lg,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    divider: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: spacing.lg + NUMERAL_W + spacing.md,
      height: StyleSheet.hairlineWidth,
    },
  }),
);
