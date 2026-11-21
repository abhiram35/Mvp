import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AngledEdge, Button, Card, displayLineHeight, EmptyState, ErrorState, Kicker, LoadingState, PanelFrame, Screen, ScreenHeader, Text } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { useLfgPosts, useNewLfgPostsCount } from '../../features/lfg/api';
import { hostCta, REGIONS, regionLabel } from '../../features/lfg/format';
import { GameChipScroller, HorizontalChips } from '../../features/lfg/HorizontalChips';
import { LfgPostCard } from '../../features/lfg/LfgPostCard';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { useLatestRef, useNow } from '../../lib/hooks';
import { useBlockedIds } from '../../features/safety/blocks';
import { LANGUAGES, type LfgPostWithAuthor, type Region } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { designTokens, fontSize, makeStyles, spacing, useDesign, useTheme, type AppTheme } from '../../theme';

/** Extra bottom padding on the hero so the angled edge never clips the text. */
const designPad = (t: AppTheme) => designTokens(t).lang.heroAngle;

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));
const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({ value: l as string, label: l as string }));

export default function LfgBoardScreen() {
  const t = useTheme();
  const d = useDesign();
  const styles = useStyles();
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
  const reloadRef = useLatestRef(reloadSilently);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void reloadRef.current();
      focusedOnce.current = true;
    }, [reloadRef]),
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
    body = <LoadingState label={`Loading ${t.words.lobbies.toLowerCase()}…`} />;
  } else if (error && posts.length === 0) {
    body = <ErrorState message={error} onRetry={retry} />;
  } else {
    body = (
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, visible.length === 0 && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} colors={[t.colors.primary]} progressBackgroundColor={t.colors.surface} />}
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            title={gameId || region || language ? 'No lobbies match these filters' : 'No open lobbies right now'}
            message="Be the first — host what you're playing and let teammates come to you."
            action={<Button title={hostCta(t.words)} icon="add" onPress={() => router.push('/lfg/new')} />}
          />
        }
      />
    );
  }

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/lobby'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={t.colors.text} />
          <Text variant="label">Lobby</Text>
        </Pressable>
        <ScreenHeader
          title={t.words.lobbies}
          kicker={loading && posts.length === 0 ? 'Live board' : `Live now · ${visible.length} open`}
          index={1}
          subtitle="Open lobbies you can join now"
          right={
            <View style={styles.headerActions}>
              <NotificationBell />
              <Button title="Host" icon="add" size="sm" onPress={() => router.push('/lfg/new')} style={styles.hostButton} accessibilityLabel={hostCta(t.words)} />
            </View>
          }
        />
        {/* Scrims entry: team practice matches (VALORANT / CS2), as a hero band. */}
        <Card
          variant="hero"
          onPress={() => router.push('/scrims')}
          accessibilityLabel="Scrims. Book team practice matches for VALORANT and CS2"
          style={styles.scrimHero}
        >
          <View style={styles.scrimRow}>
            <View style={{ flex: 1 }}>
              <Kicker tone="onPanel">Team vs team · free</Kicker>
              <Text style={styles.scrimTitle}>Scrims</Text>
              <Text variant="caption" style={{ color: t.colors.onPanel, opacity: 0.85 }}>
                Practice matches for VALORANT and CS2
              </Text>
            </View>
            <View style={[styles.scrimGo, { backgroundColor: t.colors.primary, borderRadius: d.lang.corner === 'soft' ? 20 : t.radius.sm }]}>
              <Ionicons name="arrow-forward" size={20} color={t.colors.onPrimary} />
            </View>
          </View>
          {/* Angled themes get the diagonal edge; the others keep their bracket / frame decoration. */}
          {d.lang.heroAngle ? <AngledEdge color={t.colors.bg} /> : <PanelFrame />}
        </Card>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterLine}>
          <View style={{ flex: 1 }}>
            <GameChipScroller value={gameId} onChange={setGameId} allowAll squadOnly />
          </View>
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={`${showFilters ? 'Hide' : 'Show'} region and language filters${
              activeExtraFilters ? `, ${activeExtraFilters} active` : ''
            }`}
            accessibilityState={{ expanded: showFilters }}
            style={({ pressed }) => [
              styles.filterToggle,
              (showFilters || activeExtraFilters > 0) && styles.filterToggleActive,
              pressed && { backgroundColor: t.colors.surfaceRaised },
            ]}
            hitSlop={6}
          >
            <Ionicons name="options-outline" size={18} color={activeExtraFilters ? d.primaryText : t.colors.textMuted} />
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
            accessibilityLabel={`New ${t.words.lobbies.toLowerCase()} available. Tap to refresh.`}
            style={({ pressed }) => [styles.newPill, pressed && { backgroundColor: t.colors.primaryPressed }]}
          >
            <Ionicons name="arrow-up" size={14} color={t.colors.onPrimary} />
            <Text style={styles.newPillText}>New posts — tap to refresh</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, alignSelf: 'flex-start', marginBottom: 4 },
    scrimHero: { marginBottom: spacing.md, paddingVertical: spacing.lg, paddingBottom: spacing.lg + designPad(t) },
    scrimRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    scrimTitle: {
      fontFamily: t.fonts.display,
      fontSize: 36,
      lineHeight: displayLineHeight(t, 36),
      color: t.colors.onPanel,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
      marginTop: 2,
    },
    scrimGo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    header: { paddingHorizontal: spacing.lg },
    hostButton: { minHeight: 44 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    filters: {
      paddingLeft: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: designTokens(t).hairline,
    },
    filterLine: { flexDirection: 'row', alignItems: 'center' },
    filterToggle: {
      width: 44,
      height: 44,
      marginHorizontal: spacing.sm,
      borderRadius: designTokens(t).lang.corner === 'soft' ? 22 : t.radius.md,
      backgroundColor: designTokens(t).chip.bg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    filterToggleActive: { backgroundColor: designTokens(t).primaryTint },
    filterCount: { color: designTokens(t).primaryText, fontSize: fontSize.xs, fontFamily: t.fonts.bodyBold, marginLeft: 2 },
    extraFilters: { gap: spacing.sm, marginTop: spacing.sm },
    list: { paddingBottom: spacing.xxl },
    newPill: {
      position: 'absolute',
      top: spacing.md,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: t.colors.primary,
      borderRadius: t.radius.pill,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      shadowColor: t.colors.panel,
      shadowOpacity: t.dark ? 0.5 : 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    newPillText: {
      color: t.colors.onPrimary,
      fontSize: fontSize.sm,
      fontFamily: t.fonts.heading,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
  }),
);
