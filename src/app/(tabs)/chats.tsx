import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar, Button, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, Text } from '../../components/ui';
import type { ConversationSummary } from '../../lib/types';
import { formatRelativeTime } from '../../features/chat/format';
import { useConversationList } from '../../features/chat/useConversationList';
import { useIncomingRequestCount } from '../../features/friends/hooks';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

const AVATAR = 48;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ChatsScreen() {
  const t = useTheme();
  const s = useStyles();
  const { conversations, loading, refreshing, error, load } = useConversationList();
  const { count: requestCount, reload: reloadRequests } = useIncomingRequestCount();

  // Runs on first focus too; 'initial' only shows the spinner until the first successful load.
  useFocusEffect(
    useCallback(() => {
      void load('initial');
      void reloadRequests();
    }, [load, reloadRequests]),
  );

  return (
    <Screen padded={false}>
      <View style={s.header}>
        <ScreenHeader title="Chats" right={<FriendsButton count={requestCount} />} />
      </View>

      {loading && conversations.length === 0 ? (
        <LoadingState />
      ) : error && conversations.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load('initial')} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.conversation_id}
          renderItem={({ item }) => <ConversationRow item={item} />}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          contentContainerStyle={conversations.length === 0 ? { flexGrow: 1 } : { paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load('refresh');
                void reloadRequests();
              }}
              tintColor={t.colors.primary}
              colors={[t.colors.primary]}
              progressBackgroundColor={t.colors.surface}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No chats yet"
              message={`No chats yet — find a ${t.words.squad} or message a player`}
              action={
                <Button title={`Find a ${t.words.squad}`} icon="people" onPress={() => router.push('/(tabs)/squad')} />
              }
            />
          }
        />
      )}
    </Screen>
  );
}

function FriendsButton({ count }: { count: number }) {
  const s = useStyles();
  return (
    <View>
      <Button
        size="sm"
        variant="secondary"
        icon="people-outline"
        title="Friends"
        accessibilityLabel={count > 0 ? `Friends, ${count} new request${count === 1 ? '' : 's'}` : 'Friends'}
        onPress={() => router.push('/friends')}
      />
      {count > 0 ? (
        <View style={[s.badge, s.headerBadge]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Text style={s.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ConversationRow({ item }: { item: ConversationSummary }) {
  const t = useTheme();
  const s = useStyles();
  const unread = item.unread_count > 0;
  const time = formatRelativeTime(item.last_message_at);
  const title = item.title || (item.is_group ? `${capitalize(t.words.squad)} chat` : 'Player');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${item.unread_count} unread` : ''}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: t.colors.surfaceRaised }]}
    >
      <Avatar uri={item.avatar_url} name={item.title} size={AVATAR} highlight={item.is_group} />
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" style={unread ? s.timeUnread : undefined}>{time}</Text>
        </View>
        <View style={s.rowBottom}>
          <Text numberOfLines={1} style={[s.preview, unread && s.previewUnread]}>
            {item.last_message ?? 'No messages yet — say hi!'}
          </Text>
          {unread ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    header: { paddingHorizontal: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 72,
    },
    rowBody: { flex: 1, marginLeft: spacing.md },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: spacing.sm },
    title: { flex: 1, fontFamily: t.fonts.bodyBold, fontSize: fontSize.md, color: t.colors.text },
    timeUnread: { color: t.colors.text, fontFamily: t.fonts.bodyMedium },
    preview: { flex: 1, fontFamily: t.fonts.body, fontSize: fontSize.sm, color: t.colors.textMuted },
    previewUnread: { color: t.colors.text, fontFamily: t.fonts.bodyMedium },
    badge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerBadge: { position: 'absolute', top: -8, right: -8, minWidth: 20, height: 20 },
    badgeText: { color: t.colors.onPrimary, fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, lineHeight: 16 },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginLeft: spacing.lg + AVATAR + spacing.md,
      marginRight: spacing.lg,
    },
  }),
);
