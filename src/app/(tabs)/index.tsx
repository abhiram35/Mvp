// Clips tab (the app opens here): full-screen vertical clips feed. See docs/CLIPS_AND_PARTY.md.
// Chrome (feed tabs, friends row, header buttons, sheets) uses the theme; the media stays dark.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ListRenderItem,
  type ListViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, EmptyState, ErrorState, LoadingState, SegmentedControl, Text, type IconName } from '../../components/ui';
import { useClipFeed } from '../../features/clips/api';
import { ClipPage, type ClipPageActions } from '../../features/clips/ClipPage';
import { useMediaPalette } from '../../features/clips/ClipMedia';
import { CommentsSheet } from '../../features/clips/Comments';
import { FriendsRings } from '../../features/clips/FriendsRings';
import { CLIP_FEEDS, DEFAULT_FEED, emptyFeedCopy } from '../../features/clips/logic';
import { useToast } from '../../features/clips/Toast';
import type { Clip, ClipFeed } from '../../features/clips/types';
import { useClipActions } from '../../features/clips/useClipActions';
import { useReducedMotion } from '../../features/duo/motion';
import { useGames } from '../../features/games/useGames';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [s.headerBtn, pressed && { backgroundColor: t.colors.surfaceRaised }]}
    >
      <Ionicons name={icon} size={22} color={t.colors.text} />
    </Pressable>
  );
}

export default function ClipsScreen() {
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const reduced = useReducedMotion();
  const now = useNow();
  const { byId } = useGames();
  const { base } = useMediaPalette();

  const [feed, setFeed] = useState<ClipFeed>(DEFAULT_FEED);
  const { clips, loading, refreshing, loadingMore, hasMore, error, moreError, refresh, retry, loadMore } = useClipFeed(feed);
  const [pageHeight, setPageHeight] = useState(0);
  const [active, setActive] = useState(0);
  const list = useRef<FlatList<Clip>>(null);
  const activeRef = useRef(0);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Pages are pageHeight tall: when it changes after render (banner shown/hidden, rotation,
  // the friends row loading), re-align so the current clip still fills the screen.
  useEffect(() => {
    if (pageHeight > 0) list.current?.scrollToOffset({ offset: activeRef.current * pageHeight, animated: false });
  }, [pageHeight]);
  const [commentsFor, setCommentsFor] = useState<Clip | null>(null);

  const { show: toast, node: toastNode } = useToast();
  const { play, gg, share, squadUp, more, openAuthor, squad } = useClipActions(toast);
  const comments = useCallback((clip: Clip) => setCommentsFor(clip), []);
  // One stable object for the memoised pages (every callback in it is stable).
  const pageActions = useMemo<ClipPageActions>(
    () => ({ play, gg, comments, share, squadUp, more, openAuthor }),
    [play, gg, comments, share, squadUp, more, openAuthor],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setPageHeight((prev) => (prev === h ? prev : h));
  }, []);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable && v.index != null);
    if (first?.index != null) setActive(first.index);
  }, []);

  const changeFeed = useCallback((f: ClipFeed) => {
    setActive(0);
    setFeed(f);
  }, []);

  const total = clips.length;
  const renderItem: ListRenderItem<Clip> = useCallback(
    ({ item, index }) => (
      <ClipPage
        clip={item}
        height={pageHeight}
        game={item.game_id ? byId(item.game_id) : undefined}
        mine={item.author_id === myId}
        progress={total > 1 ? (index + 1) / (hasMore ? total + 1 : total) : undefined}
        squadState={squad[item.author_id]}
        actions={pageActions}
        reduced={reduced}
        now={now}
      />
    ),
    [pageHeight, byId, myId, total, hasMore, squad, pageActions, reduced, now],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Clip> | null | undefined, index: number) => ({ length: pageHeight, offset: pageHeight * index, index }),
    [pageHeight],
  );

  const empty = emptyFeedCopy(feed);
  const shareCta = <Button title="Share your first clip" icon="add" onPress={() => router.push('/clips/new')} />;

  let body: ReactNode;
  if (loading && clips.length === 0) {
    body = <LoadingState label="Loading clips" />;
  } else if (error && clips.length === 0) {
    body = <ErrorState message={error} onRetry={retry} />;
  } else if (clips.length === 0) {
    body = (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.colors.primary} colors={[t.colors.primary]} />}
      >
        <EmptyState icon="film-outline" kicker={CLIP_FEEDS.find((f) => f.value === feed)?.label} title={empty.title} message={empty.message} action={shareCta} />
      </ScrollView>
    );
  } else if (pageHeight > 0) {
    body = (
      <View style={{ flex: 1, backgroundColor: base }}>
        <FlatList
          ref={list}
          key={feed}
          data={clips}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={2}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FFFFFF" colors={[t.colors.primary]} />}
          accessibilityLabel={`${CLIP_FEEDS.find((f) => f.value === feed)?.label ?? ''} clips`}
        />
        {loadingMore && active >= total - 2 ? (
          <View style={s.moreHost} pointerEvents="none">
            <View style={s.morePill}>
              <ActivityIndicator color="#FFFFFF" size="small" />
            </View>
          </View>
        ) : null}
        {moreError && active >= total - 1 ? (
          <View style={s.moreHost}>
            <Pressable onPress={() => void loadMore()} accessibilityRole="button" style={[s.morePill, { paddingHorizontal: spacing.lg, minHeight: 44, borderRadius: 22 }]}>
              <Text style={{ color: '#FFFFFF' }}>Couldn&apos;t load more · Tap to retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* edges top like the other tabs' Screen: under the BannedBanner (which pads the top
          inset itself) this only pads what still overlaps, instead of the raw inset. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: t.colors.bg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <SegmentedControl variant="underline" value={feed} options={CLIP_FEEDS} onChange={changeFeed} />
          </View>
          <HeaderButton icon="add" label="Post a clip" onPress={() => router.push('/clips/new')} />
          <HeaderButton icon="chatbubbles-outline" label="Chats" onPress={() => router.push('/chats')} />
        </View>
        <FriendsRings />
      </SafeAreaView>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        {body}
        {toastNode}
      </View>
      <CommentsSheet clip={commentsFor} myId={myId} onClose={() => setCommentsFor(null)} />
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, gap: spacing.xs, paddingVertical: spacing.xs },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md },
    moreHost: { position: 'absolute', left: 0, right: 0, bottom: spacing.xl + 70, alignItems: 'center' },
    morePill: { minHeight: 36, minWidth: 36, borderRadius: 18, paddingHorizontal: spacing.sm, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  }),
);
