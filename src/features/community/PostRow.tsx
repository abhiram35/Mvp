import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, displayLineHeight, Kicker, Text } from '../../components/ui';
import { COMMUNITY_KIND_LABELS, type CommunityPostSummary, type Game } from '../../lib/types';
import { designTokens, fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { useGgState, wasEdited } from './api';
import { compactCount, plural, timeAgo } from './format';
import { KindTag, SolvedTag, SpoilerTag } from './Tags';

/**
 * One post in the Community feed: an editorial row divided by a hairline, not a card.
 * `featured` (the top post on Hot) gets a kicker, a display-size headline and a longer preview.
 */
export const PostRow = memo(function PostRow({
  item,
  game,
  onPress,
  now = Date.now(),
  featured,
}: {
  item: CommunityPostSummary;
  game: Game | undefined;
  onPress: () => void;
  now?: number;
  featured?: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const d = designTokens(t);
  const { post, author, is_solved } = item;
  const gg = useGgState('post', post.id, { has_gg: item.has_gg, gg_count: post.gg_count });
  const name = author.display_name || author.username || 'Player';
  const ago = timeAgo(post.created_at, now) + (wasEdited(post) ? ' · edited' : '');
  const preview = post.is_spoiler ? '' : post.body.replace(/\s+/g, ' ').trim();

  const a11y = [
    `${COMMUNITY_KIND_LABELS[post.kind]}${is_solved ? ', solved' : ''}${post.is_spoiler ? ', contains spoilers' : ''}${game ? `, ${game.name}` : ''}`,
    post.title,
    `By ${name}, ${ago}`,
    `${gg.gg_count} ${t.words.gg}, ${plural(post.reply_count, 'reply', 'replies')}`,
  ].join('. ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [s.row, featured && s.featuredRow, pressed && { backgroundColor: d.surface.high }]}
    >
      {featured ? (
        <Kicker index={1} style={s.featuredKicker}>
          Top of the board
        </Kicker>
      ) : null}
      <View style={s.top}>
        <KindTag kind={post.kind} />
        {is_solved ? <SolvedTag /> : null}
        {post.is_spoiler ? <SpoilerTag /> : null}
        <Text style={s.game} numberOfLines={1}>
          {game ? `${game.emoji} ${game.name}` : 'General'}
        </Text>
        <Text variant="caption" style={s.time} numberOfLines={1}>
          {ago}
        </Text>
      </View>

      <Text style={featured ? s.featuredTitle : s.title} numberOfLines={featured ? 3 : 2}>
        {post.title}
      </Text>
      {preview ? (
        <Text style={s.preview} numberOfLines={featured ? 3 : 2}>
          {preview}
        </Text>
      ) : post.is_spoiler ? (
        <Text variant="caption" muted numberOfLines={1} style={s.spoilerNote}>
          Spoilers hidden. Open to read.
        </Text>
      ) : null}

      <View style={s.meta}>
        <View style={s.author}>
          <Avatar uri={author.avatar_url} name={name} size={22} />
          <Text variant="label" numberOfLines={1} style={s.authorName}>
            {name}
          </Text>
        </View>
        <View style={s.stat}>
          <Ionicons name={gg.has_gg ? 'ribbon' : 'ribbon-outline'} size={14} color={gg.has_gg ? d.primaryText : t.colors.textMuted} />
          <Text variant="label" style={gg.has_gg ? { color: d.primaryText } : undefined}>
            {compactCount(gg.gg_count)} {t.words.gg}
          </Text>
        </View>
        <View style={s.stat}>
          <Ionicons name="chatbubble-outline" size={14} color={t.colors.textMuted} />
          <Text variant="label">{compactCount(post.reply_count)}</Text>
        </View>
      </View>
      <View style={[s.divider, { backgroundColor: d.hairline }]} />
    </Pressable>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
    },
    featuredRow: { paddingTop: spacing.xl, paddingBottom: spacing.xl, backgroundColor: designTokens(t).surface.raised },
    featuredKicker: { marginBottom: spacing.sm },
    featuredTitle: {
      fontFamily: t.fonts.display,
      fontSize: 30,
      lineHeight: displayLineHeight(t, 30) + 2,
      color: t.colors.text,
      letterSpacing: t.shape.headingUppercase ? Math.min(1, t.shape.headingLetterSpacing) : t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
      marginTop: spacing.sm,
    },
    divider: { position: 'absolute', left: spacing.lg, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
    top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    game: {
      flexShrink: 1,
      fontFamily: t.fonts.heading,
      fontSize: fontSize.sm,
      color: t.colors.textMuted,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    time: { marginLeft: 'auto', paddingLeft: spacing.sm },
    title: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.xl - 2,
      lineHeight: Math.round((fontSize.xl - 2) * (t.shape.headingUppercase ? 1.15 : 1.35)),
      color: t.colors.text,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
      marginTop: spacing.sm,
    },
    preview: {
      fontFamily: t.fonts.body,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: t.colors.textMuted,
      marginTop: spacing.xs,
    },
    spoilerNote: { marginTop: spacing.xs },
    meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
    author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1, marginRight: 'auto' },
    authorName: { flexShrink: 1 },
    stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  }),
);
