import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState, ErrorState, ListRow, LoadingState, Screen, Text, type IconName } from '../components/ui';
import { useNotifications } from '../features/notifications/api';
import { openNotificationRoute, routeFromData } from '../features/notifications/routes';
import { useUnreadNotifications } from '../features/notifications/unread';
import type { AppNotification, NotificationType } from '../lib/types';
import { useNow } from '../lib/hooks';
import { useUserId } from '../providers/AuthProvider';
import { designTokens, fontSize, makeStyles, spacing, useTheme } from '../theme';

const TYPE_ICONS: Record<NotificationType, IconName> = {
  lfg_request: 'person-add-outline',
  lfg_accepted: 'checkmark-circle-outline',
  message: 'chatbubble-ellipses-outline',
  friend_request: 'people-outline',
  friend_accepted: 'happy-outline',
  community_reply: 'chatbox-outline',
  community_solution: 'ribbon-outline',
  rating_received: 'star-outline',
  moderation: 'shield-outline',
  team_invite: 'people-circle-outline',
  scrim_request: 'flag-outline',
  scrim_update: 'trophy-outline',
  tournament_update: 'podium-outline',
  organiser_application: 'ribbon-outline',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "just now", "5m", "3h", "2d", then "12 Nov". */
function relativeTime(iso: string, now: number): string {
  const d = new Date(iso);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return '';
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const NotificationRow = memo(function NotificationRow({
  item,
  now,
  onPress,
}: {
  item: AppNotification;
  now: number;
  onPress: (n: AppNotification) => void;
}) {
  const s = useStyles();
  const unread = !item.read_at;
  const time = relativeTime(item.created_at, now);
  return (
    <ListRow
      icon={TYPE_ICONS[item.type]}
      highlight={unread}
      title={item.title}
      titleLines={2}
      subtitle={item.body || undefined}
      meta={time}
      chevron={false}
      trailing={unread ? <View style={s.dot} /> : undefined}
      onPress={() => onPress(item)}
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}${item.body ? `. ${item.body}` : ''}. ${time}`}
    />
  );
});

export default function NotificationsScreen() {
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const now = useNow();
  const { items, loading, refreshing, loadingMore, hasMore, error, refresh, retry, loadMore, markRead, markAllRead } =
    useNotifications(myId);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const { count: serverUnread } = useUnreadNotifications();
  const loadedUnread = useMemo(() => items.some((n) => !n.read_at), [items]);
  // Older unread rows may not be loaded yet, so also trust the shared count.
  const anyUnread = loadedUnread || serverUnread > 0;

  const onPressRow = useCallback(
    (n: AppNotification) => {
      void markRead(n.id);
      const route = routeFromData(n.data);
      // Moderation notices route back here: nothing more to open.
      if (route && route.pathname !== '/notifications') openNotificationRoute(route);
    },
    [markRead],
  );

  const onMarkAll = useCallback(async () => {
    setMarkingAll(true);
    setMarkAllError(null);
    const err = await markAllRead();
    setMarkingAll(false);
    if (err) setMarkAllError(err);
  }, [markAllRead]);

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            onPress={() => void onMarkAll()}
            disabled={!anyUnread || markingAll}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications read"
            accessibilityState={{ disabled: !anyUnread || markingAll }}
            hitSlop={8}
            style={({ pressed }) => [s.markAll, pressed && { backgroundColor: t.colors.surfaceRaised }, !anyUnread && { opacity: 0.45 }]}
          >
            <Text style={s.markAllText}>Mark all read</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (loading && items.length === 0) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <LoadingState />
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState message={error} onRetry={() => void retry()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} padded={false}>
      {header}
      {markAllError ? (
        <View style={s.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={16} color={t.colors.danger} />
          <Text variant="label" style={s.errorText}>
            {`Couldn't mark all read. ${markAllError}`}
          </Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NotificationRow item={item} now={now} onPress={onPressRow} />}
        contentContainerStyle={[s.list, items.length === 0 && { flexGrow: 1 }]}
        onEndReached={() => {
          if (hasMore) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={t.colors.primary}
            colors={[t.colors.primary]}
            progressBackgroundColor={t.colors.surface}
          />
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={t.colors.primary} style={s.footer} /> : undefined}
        ListEmptyComponent={
          <EmptyState icon="notifications-off-outline" kicker="Inbox zero" title="You're all caught up." message="Join requests, messages and replies will show up here." />
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { paddingBottom: spacing.xxl },
    footer: { paddingVertical: spacing.lg },
    dot: {
      width: 10,
      height: 10,
      borderRadius: t.shape.round ? 5 : 0,
      backgroundColor: t.colors.primary,
    },
    markAll: { paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: 'center', borderRadius: t.radius.sm },
    markAllText: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.sm, color: designTokens(t).primaryText },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      margin: spacing.md,
      padding: spacing.md,
      borderRadius: t.radius.md,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.danger,
      backgroundColor: t.colors.surface,
    },
    errorText: { flex: 1, color: t.colors.danger },
  }),
);
