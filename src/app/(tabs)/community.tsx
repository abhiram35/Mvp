import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, Text } from '../../components/ui';
import { useLatestRef, useNow } from '../../lib/hooks';
import { openDiscord } from '../../lib/links';
import { useCommunityFeed } from '../../features/community/api';
import { KIND_FILTER_OPTIONS } from '../../features/community/format';
import { PostRow } from '../../features/community/PostRow';
import { UnderlineTabs } from '../../features/community/UnderlineTabs';
import { useGames } from '../../features/games/useGames';
import { GameChipScroller, HorizontalChips } from '../../features/lfg/HorizontalChips';
import type { CommunityPostKind, CommunityPostSummary, CommunitySort } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

const SORT_OPTIONS: readonly { value: CommunitySort; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'unanswered', label: 'Unanswered' },
];

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function openNew(kind?: CommunityPostKind) {
  router.push(kind ? { pathname: '/community/new', params: { kind } } : '/community/new');
}

export default function CommunityScreen() {
  const t = useTheme();
  const s = useStyles();
  const { byId, games } = useGames();
  const now = useNow();

  const [sort, setSort] = useState<CommunitySort>('hot');
  const [kind, setKind] = useState<CommunityPostKind | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText.trim(), 300);

  const feed = useCommunityFeed({ sort, kind, gameId, search: search || null });
  const { posts, loading, refreshing, loadingMore, error, loadMoreError, hasMore } = feed;

  // Back from posting / deleting: refresh quietly. Skip the first focus (initial load runs).
  const focusedOnce = useRef(false);
  const reloadRef = useLatestRef(feed.reloadSilently);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void reloadRef.current();
      focusedOnce.current = true;
    }, [reloadRef]),
  );

  const renderItem = useCallback(
    ({ item }: { item: CommunityPostSummary }) => (
      <PostRow
        item={item}
        game={byId(item.post.game_id)}
        now={now}
        onPress={() => router.push({ pathname: '/community/[id]', params: { id: item.post.id } })}
      />
    ),
    // byId is recreated every render but only depends on `games`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, games],
  );

  const empty = (() => {
    if (search) {
      return (
        <EmptyState
          icon="search-outline"
          title="Nothing matches that"
          message={`No posts mention "${search}". Try other words, or ask it as a question.`}
          action={<Button title="Ask a question" icon="help-circle-outline" onPress={() => openNew('question')} />}
        />
      );
    }
    if (sort === 'unanswered') {
      return (
        <EmptyState
          icon="checkmark-done-outline"
          title="No questions waiting"
          message={kind === 'take' ? 'Unanswered only lists questions. Ask one or check Hot.' : 'Ask one or check Hot.'}
          action={<Button title="Ask a question" icon="help-circle-outline" onPress={() => openNew('question')} />}
        />
      );
    }
    if (kind === 'question') {
      return (
        <EmptyState
          icon="help-circle-outline"
          title="No questions yet"
          message="Stuck on lag, settings or ranked? Ask and players will help."
          action={<Button title="Ask a question" icon="add" onPress={() => openNew('question')} />}
        />
      );
    }
    return (
      <EmptyState
        icon="newspaper-outline"
        title={gameId || kind ? 'Nothing here yet' : 'Start the conversation'}
        message="Share a take on the latest patch, a tier list or a review — or ask for help."
        action={<Button title="Share a take" icon="add" onPress={() => openNew('take')} />}
      />
    );
  })();

  let body: ReactNode;
  if (loading && posts.length === 0) {
    body = <LoadingState />;
  } else if (error && posts.length === 0) {
    body = <ErrorState message={error} onRetry={() => void feed.retry()} />;
  } else {
    body = (
      <FlatList
        data={posts}
        keyExtractor={(p) => p.post.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[s.list, posts.length === 0 && { flexGrow: 1 }]}
        onEndReached={() => {
          if (hasMore && !loadMoreError) void feed.loadMore();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void feed.refresh()}
            tintColor={t.colors.primary}
            colors={[t.colors.primary]}
            progressBackgroundColor={t.colors.surface}
          />
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          loadingMore ? (
            <View style={s.footer}>
              <ActivityIndicator color={t.colors.primary} />
            </View>
          ) : loadMoreError ? (
            <View style={s.footer}>
              <Text variant="label" style={{ textAlign: 'center' }}>
                Couldn&apos;t load more.
              </Text>
              <Button title="Try again" variant="ghost" size="sm" onPress={() => void feed.loadMore()} />
            </View>
          ) : undefined
        }
      />
    );
  }

  return (
    <Screen padded={false}>
      <View style={s.header}>
        <ScreenHeader
          title={t.words.community}
          subtitle="Takes, questions and fixes from players"
          right={<Button title="Post" icon="add" size="sm" onPress={() => openNew()} style={s.postButton} accessibilityLabel="New post" />}
        />
        <Pressable
          onPress={() => void openDiscord()}
          accessibilityRole="link"
          accessibilityLabel="Got an idea for Vinq? Suggest it on our Discord"
          hitSlop={8}
          style={s.discordHint}
        >
          <Ionicons name="logo-discord" size={16} color={t.colors.textMuted} />
          <Text variant="label">
            Got an idea for Vinq? <Text variant="label" style={s.discordLink}>Suggest it on Discord</Text>
          </Text>
        </Pressable>
        <UnderlineTabs options={SORT_OPTIONS} value={sort} onChange={setSort} />
      </View>

      <View style={s.controls}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={t.colors.textFaint} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search ${t.words.community.toLowerCase()}`}
            placeholderTextColor={t.colors.textFaint}
            selectionColor={t.colors.primary}
            cursorColor={t.colors.primary}
            style={s.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search posts"
          />
          {searchText ? (
            <Pressable onPress={() => setSearchText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" style={s.clear}>
              <Ionicons name="close-circle" size={18} color={t.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <HorizontalChips options={KIND_FILTER_OPTIONS} value={kind} onChange={setKind} allLabel="All" />
        <GameChipScroller value={gameId} onChange={setGameId} allowAll />
      </View>

      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    header: { paddingHorizontal: spacing.lg },
    postButton: { minHeight: 44 },
    discordHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, marginBottom: spacing.xs },
    discordLink: { color: t.colors.primary, textDecorationLine: 'underline' },
    controls: {
      paddingLeft: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: spacing.lg,
      marginBottom: spacing.xs,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
    },
    searchInput: {
      flex: 1,
      minHeight: 44,
      color: t.colors.text,
      fontFamily: t.fonts.body,
      fontSize: fontSize.md,
    },
    clear: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
    list: { paddingBottom: spacing.xxl },
    footer: { paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.xs },
  }),
);
