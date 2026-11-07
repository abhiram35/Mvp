import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { useLfgPosts, useNewLfgPostsCount } from '../../features/lfg/api';
import { REGIONS, regionLabel } from '../../features/lfg/format';
import { GameChipScroller, HorizontalChips } from '../../features/lfg/HorizontalChips';
import { LfgPostCard } from '../../features/lfg/LfgPostCard';
import { useBlockedIds } from '../../features/safety/blocks';
import { LANGUAGES, type LfgPostWithAuthor, type Region } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { colors, font, radius, spacing } from '../../theme';

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));
const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({ value: l as string, label: l as string }));

/** Re-render every minute so "12m ago" / "expires in 3h" stay accurate. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function LfgBoardScreen() {
  const myId = useUserId();
  const { byId } = useGames();
  const { blockedIds } = useBlockedIds();
  const now = useNow();

  const [gameId, setGameId] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { posts, loading, refreshing, error, refresh, retry, reloadSilently } = useLfgPosts({ gameId, region, language });
  const { count: newCount, reset: resetNew } = useNewLfgPostsCount(myId);

  // Coming back from creating / closing / deleting a post: refresh quietly so the
  // board isn't stale. Skip the first focus (the initial load already runs).
  const focusedOnce = useRef(false);
  const reloadRef = useRef(reloadSilently);
  reloadRef.current = reloadSilently;
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void reloadRef.current();
      focusedOnce.current = true;
    }, []),
  );

  const visible = useMemo(
    () => posts.filter((p) => !blockedIds.has(p.author_id) && new Date(p.expires_at).getTime() > now),
    [posts, blockedIds, now],
  );

  const onRefresh = useCallback(() => {
    resetNew();
    void refresh();
  }, [refresh, resetNew]);

  const activeExtraFilters = (region ? 1 : 0) + (language ? 1 : 0);

  const renderItem = ({ item }: { item: LfgPostWithAuthor }) => (
    <LfgPostCard
      post={item}
      game={byId(item.game_id)}
      now={now}
      onPress={() => router.push({ pathname: '/lfg/[id]', params: { id: item.id } })}
    />
  );

  let body: ReactNode;
  if (loading && posts.length === 0) {
    body = <LoadingState label="Finding squads…" />;
  } else if (error && posts.length === 0) {
    body = <ErrorState message={error} onRetry={retry} />;
  } else {
    body = (
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, visible.length === 0 && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            title={gameId || region || language ? 'No squads match these filters' : 'No open squads right now'}
            message="Be the first — post what you're playing and let teammates come to you."
            action={<Button title="Post an LFG" icon="add" onPress={() => router.push('/lfg/new')} />}
          />
        }
      />
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="title" style={styles.title} accessibilityRole="header">
          Looking for group
        </Text>
        <Button title="Post" icon="add" size="sm" onPress={() => router.push('/lfg/new')} style={styles.postButton} />
      </View>

      <View style={styles.filters}>
        <View style={styles.filterLine}>
          <View style={{ flex: 1 }}>
            <GameChipScroller value={gameId} onChange={setGameId} allowAll />
          </View>
          <Pressable
            onPress={() => setShowFilters((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={`${showFilters ? 'Hide' : 'Show'} region and language filters${
              activeExtraFilters ? `, ${activeExtraFilters} active` : ''
            }`}
            accessibilityState={{ expanded: showFilters }}
            style={[styles.filterToggle, (showFilters || activeExtraFilters > 0) && styles.filterToggleActive]}
            hitSlop={6}
          >
            <Ionicons name="options-outline" size={18} color={activeExtraFilters ? colors.primary : colors.textMuted} />
            {activeExtraFilters ? <Text style={styles.filterCount}>{activeExtraFilters}</Text> : null}
          </Pressable>
        </View>
        {showFilters ? (
          <View style={styles.extraFilters}>
            <HorizontalChips label="Region" options={REGION_OPTIONS} value={region} onChange={setRegion} allLabel="Any region" />
            <HorizontalChips label="Language" options={LANGUAGE_OPTIONS} value={language} onChange={setLanguage} allLabel="Any language" />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {body}
        {newCount > 0 ? (
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="New posts available. Tap to refresh."
            style={styles.newPill}
          >
            <Ionicons name="arrow-up" size={14} color={colors.onPrimary} />
            <Text style={styles.newPillText}>New posts — tap to refresh</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: font.size.xl, flexShrink: 1, marginRight: spacing.md },
  postButton: { minHeight: 44 },
  filters: { paddingLeft: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterLine: { flexDirection: 'row', alignItems: 'center' },
  filterToggle: {
    width: 44,
    height: 44,
    marginHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  filterToggleActive: { borderColor: colors.primary },
  filterCount: { color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.bold, marginLeft: 2 },
  extraFilters: { gap: spacing.sm, marginTop: spacing.sm },
  list: { padding: spacing.lg },
  newPill: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
    shadowColor: colors.bg,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  newPillText: { color: colors.onPrimary, fontSize: font.size.sm, fontWeight: font.weight.semibold },
});
