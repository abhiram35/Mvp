import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState, ErrorState, LoadingState, Screen, Text, type IconName } from '../components/ui';
import { useNotifications } from '../features/notifications/api';
import { openNotificationRoute, routeFromData } from '../features/notifications/routes';
import { useUnreadNotifications } from '../features/notifications/unread';
import type { AppNotification, NotificationType } from '../lib/types';
import { useNow } from '../lib/hooks';
import { useUserId } from '../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../theme';

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
  const t = useTheme();
  const s = useStyles();
  const unread = !item.read_at;
  const time = relativeTime(item.created_at, now);
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}${item.body ? `. ${item.body}` : ''}. ${time}`}
      style={({ pressed }) => [s.row, unread && s.rowUnread, pressed && { backgroundColor: t.colors.surfaceRaised }]}
    >
      <View style={[s.iconBox, unread && s.iconBoxUnread]}>
        <Ionicons name={TYPE_ICONS[item.type]} size={20} color={unread ? t.colors.primary : t.colors.textMuted} />
      </View>
      <View style={s.textCol}>
        <Text style={[s.title, unread && s.titleUnread]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.body ? (
          <Text variant="label" numberOfLines={2} style={s.body}>
            {item.body}
          </Text>
        ) : null}
        <Text variant="caption" style={s.time}>
          {time}
        </Text>
      </View>
      {unread ? <View style={s.dot} /> : null}
    </Pressable>
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
        ItemSeparatorComponent={() => <View style={s.separator} />}
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
          <EmptyState icon="notifications-off-outline" title="You're all caught up." message="Join requests, messages and replies will show up here." />
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { paddingBottom: spacing.xxl },
    footer: { paddingVertical: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 64,
    },
    rowUnread: { backgroundColor: t.colors.surface },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: t.shape.round ? 20 : t.radius.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBoxUnread: { borderColor: t.colors.primary },
    textCol: { flex: 1, gap: 2 },
    title: { fontFamily: t.fonts.body, fontSize: fontSize.md, color: t.colors.text, lineHeight: 21 },
    titleUnread: { fontFamily: t.fonts.bodyBold },
    body: { lineHeight: 19 },
    time: { marginTop: 2 },
    dot: {
      width: 10,
      height: 10,
      marginTop: 6,
      borderRadius: t.shape.round ? 5 : 0,
      backgroundColor: t.colors.primary,
    },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },
    markAll: { paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: 'center', borderRadius: t.radius.sm },
    markAllText: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.sm, color: t.colors.primary },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      margin: spacing.md,
      padding: spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.danger,
      backgroundColor: t.colors.surface,
    },
    errorText: { flex: 1, color: t.colors.danger },
  }),
);
