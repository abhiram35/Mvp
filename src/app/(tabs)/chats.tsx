import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar, Button, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import type { ConversationSummary } from '../../lib/types';
import { formatRelativeTime } from '../../features/chat/format';
import { useConversationList } from '../../features/chat/useConversationList';
import { useIncomingRequestCount } from '../../features/friends/hooks';
import { colors, font, radius, spacing } from '../../theme';

export default function ChatsScreen() {
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
      <View style={styles.header}>
        <Text variant="title">Chats</Text>
        <FriendsButton count={requestCount} />
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={conversations.length === 0 ? { flexGrow: 1 } : { paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load('refresh');
                void reloadRequests();
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No chats yet"
              message="No chats yet — find a squad or message a player"
              action={<Button title="Find a squad" icon="people" onPress={() => router.push('/(tabs)/squad')} />}
            />
          }
        />
      )}
    </Screen>
  );
}

function FriendsButton({ count }: { count: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Friends, ${count} new request${count === 1 ? '' : 's'}` : 'Friends'}
      onPress={() => router.push('/friends')}
      hitSlop={8}
      style={({ pressed }) => [styles.friendsButton, pressed && { backgroundColor: colors.surfaceRaised }]}
    >
      <Ionicons name="people-outline" size={18} color={colors.text} />
      <Text style={styles.friendsLabel}>Friends</Text>
      {count > 0 ? (
        <View style={styles.headerBadge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ConversationRow({ item }: { item: ConversationSummary }) {
  const unread = item.unread_count > 0;
  const time = formatRelativeTime(item.last_message_at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${unread ? `, ${item.unread_count} unread` : ''}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      {item.is_group ? (
        <View style={styles.groupAvatar}>
          <Ionicons name="people" size={22} color={colors.primary} />
        </View>
      ) : (
        <Avatar uri={item.avatar_url} name={item.title} size={48} />
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.title, unread && { fontWeight: font.weight.bold }]} numberOfLines={1}>
            {item.title || (item.is_group ? 'Squad chat' : 'Player')}
          </Text>
          <Text variant="caption" style={unread ? { color: colors.primary } : undefined}>{time}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            numberOfLines={1}
            style={[styles.preview, { color: unread ? colors.text : colors.textMuted }]}
          >
            {item.last_message ?? 'No messages yet — say hi!'}
          </Text>
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  friendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  friendsLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  headerBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 72,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, marginLeft: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: spacing.sm },
  title: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold },
  preview: { flex: 1, fontSize: font.size.sm },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onPrimary, fontSize: font.size.xs, fontWeight: font.weight.bold },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 48 + spacing.md },
});
