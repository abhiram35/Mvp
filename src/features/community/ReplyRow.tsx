import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Text } from '../../components/ui';
import type { CommunityReplyItem } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { wasEdited } from './api';
import { timeAgo } from './format';
import { GgButton } from './GgButton';
import { SolvedTag } from './Tags';

/** One reply in a thread. The solution gets an accent left rule and a Solved marker. */
export const ReplyRow = memo(function ReplyRow({
  item,
  mine,
  now = Date.now(),
  onMenu,
}: {
  item: CommunityReplyItem;
  mine: boolean;
  now?: number;
  onMenu: (item: CommunityReplyItem) => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { reply, author, is_solution } = item;
  const name = author.display_name || author.username || 'Player';
  const edited = wasEdited(reply);
  const rowBg = is_solution ? t.colors.surface : t.colors.bg;

  return (
    <View style={[s.row, is_solution && s.solution]}>
      {is_solution ? (
        <View style={s.solvedLine}>
          <SolvedTag />
          <Text variant="caption" style={{ color: t.colors.accent }}>
            Chosen as the answer
          </Text>
        </View>
      ) : null}

      <View style={s.head}>
        <Pressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: author.id } })}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
          style={({ pressed }) => [s.author, pressed && { opacity: 0.7 }]}
          hitSlop={4}
        >
          <Avatar uri={author.avatar_url} name={name} size={28} backdrop={rowBg} />
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
        </Pressable>
        <Text variant="caption" numberOfLines={1}>
          {timeAgo(reply.created_at, now)}
          {edited ? ' · edited' : ''}
        </Text>
        <Pressable
          onPress={() => onMenu(item)}
          accessibilityRole="button"
          accessibilityLabel="Reply options"
          hitSlop={8}
          style={({ pressed }) => [s.more, pressed && { backgroundColor: t.colors.surfaceRaised }]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={t.colors.textMuted} />
        </Pressable>
      </View>

      <Text style={s.body} selectable>
        {reply.body}
      </Text>

      <View style={s.actions}>
        <GgButton target="reply" id={reply.id} base={{ has_gg: item.has_gg, gg_count: reply.gg_count }} own={mine} compact backdrop={rowBg} />
      </View>
    </View>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    solution: {
      borderLeftWidth: 3,
      borderLeftColor: t.colors.accent,
      paddingLeft: spacing.lg - 3,
      backgroundColor: t.colors.surface,
    },
    solvedLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1, minHeight: 36 },
    name: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.sm, color: t.colors.text, flexShrink: 1 },
    more: {
      marginLeft: 'auto',
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.sm,
    },
    body: { fontFamily: t.fonts.body, fontSize: fontSize.md, lineHeight: 22, color: t.colors.text, marginTop: spacing.sm },
    actions: { flexDirection: 'row', marginTop: spacing.sm },
  }),
);
