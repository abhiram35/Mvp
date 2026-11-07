import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Text, type IconName } from '../../components/ui';
import type { Game, LfgPostWithAuthor } from '../../lib/types';
import { colors, font, radius, spacing } from '../../theme';
import { expiresIn, isExpired, regionLabel, timeAgo } from './format';

function Meta({ icon, label, tint }: { icon: IconName; label: string; tint?: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={tint ?? colors.textMuted} />
      <Text variant="caption" style={[styles.metaText, tint ? { color: tint } : null]}>
        {label}
      </Text>
    </View>
  );
}

export const LfgPostCard = memo(function LfgPostCard({
  post,
  game,
  onPress,
  now = Date.now(),
}: {
  post: LfgPostWithAuthor;
  game: Game | undefined;
  onPress?: () => void;
  now?: number;
}) {
  const expired = isExpired(post, now);
  const expiringSoon = !expired && new Date(post.expires_at).getTime() - now < 30 * 60_000;
  const authorName = post.author?.display_name || post.author?.username || 'Player';
  const slotsLabel = `${post.slots_needed} ${post.slots_needed === 1 ? 'slot' : 'slots'}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceRaised }]}
      accessibilityRole="button"
      accessibilityLabel={`${game?.name ?? post.game_id}: ${post.title}. Needs ${slotsLabel}. Posted by ${authorName} ${timeAgo(
          post.created_at,
          now,
        )}.`}
    >
      <View>
        {/* Game + timing */}
        <View style={styles.topRow}>
          <View style={styles.gameBadge}>
            <Text style={styles.gameEmoji}>{game?.emoji ?? '🎮'}</Text>
            <Text variant="label" style={styles.gameName} numberOfLines={1}>
              {game?.name ?? post.game_id}
            </Text>
          </View>
          <Text variant="caption">{timeAgo(post.created_at, now)}</Text>
        </View>

        <Text variant="heading" numberOfLines={2} style={styles.title}>
          {post.title}
        </Text>

        {/* Key facts */}
        <View style={styles.metaRow}>
          <View style={styles.slotsPill}>
            <Ionicons name="people" size={13} color={colors.accent} />
            <Text variant="caption" style={styles.slotsText}>
              Need {slotsLabel}
            </Text>
          </View>
          {post.rank ? <Meta icon="trophy-outline" label={post.rank} /> : null}
          <Meta icon="globe-outline" label={regionLabel(post.region)} />
          <Meta icon="language-outline" label={post.language} />
          {post.mic_required ? <Meta icon="mic" label="Mic" tint={colors.primary} /> : null}
        </View>

        {/* Author + expiry */}
        <View style={styles.footer}>
          <View style={styles.author}>
            <Avatar uri={post.author?.avatar_url} name={authorName} size={24} />
            <Text variant="label" numberOfLines={1} style={styles.authorName}>
              {authorName}
            </Text>
          </View>
          <Meta
            icon="hourglass-outline"
            label={post.status !== 'open' ? post.status : expiresIn(post.expires_at, now)}
            tint={expired || post.status !== 'open' ? colors.textFaint : expiringSoon ? colors.warning : undefined}
          />
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    maxWidth: '75%',
  },
  gameEmoji: { fontSize: font.size.sm, marginRight: spacing.xs },
  gameName: { color: colors.text, fontSize: font.size.xs },
  title: { marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center' },
  metaText: { marginLeft: 3, color: colors.textMuted },
  slotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  slotsText: { marginLeft: 3, color: colors.accent, fontWeight: font.weight.semibold },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  author: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: spacing.sm },
  authorName: { marginLeft: spacing.sm, flexShrink: 1 },
});
