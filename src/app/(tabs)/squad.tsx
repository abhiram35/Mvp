import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { REGIONS, regionLabel } from '../../features/lfg/format';
import { GameChipScroller, HorizontalChips } from '../../features/lfg/HorizontalChips';
import { useBlockedIds } from '../../features/safety/blocks';
import { fetchMyGameIds, useSquadSearch } from '../../features/squad/api';
import { SquadmateCard } from '../../features/squad/SquadmateCard';
import { openDm } from '../../lib/actions';
import { LANGUAGES, PLAY_STYLE_LABELS, type PlayStyle, type Region, type SquadmateMatch } from '../../lib/types';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { colors, font, spacing } from '../../theme';

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));
const STYLE_OPTIONS = (Object.keys(PLAY_STYLE_LABELS) as PlayStyle[])
  .filter((s) => s !== 'both')
  .map((s) => ({ value: s, label: PLAY_STYLE_LABELS[s] }));

export default function SquadFinderScreen() {
  const myId = useUserId();
  const { profile } = useAuth();
  const { games, byId } = useGames();
  const { blockedIds } = useBlockedIds();
  const { results, loading, error, search, retry } = useSquadSearch();

  const [gameId, setGameId] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [searchedGameId, setSearchedGameId] = useState<string | null>(null);

  // Default the game to the first one on my profile.
  useEffect(() => {
    if (!myId) return;
    let active = true;
    fetchMyGameIds(myId)
      .then((ids) => {
        if (active && ids.length > 0) setGameId((cur) => cur ?? ids[0]);
      })
      .catch(() => {
        /* non-critical: user just picks a game */
      });
    return () => {
      active = false;
    };
  }, [myId]);

  const languageOptions = useMemo(
    () => Array.from(new Set([...(profile?.languages ?? []), ...LANGUAGES])).map((l) => ({ value: l, label: l })),
    [profile?.languages],
  );

  const visible = useMemo(() => (results ?? []).filter((m) => !blockedIds.has(m.profile.id) && m.profile.id !== myId), [results, blockedIds, myId]);

  const runSearch = () => {
    if (!gameId) return;
    setSearchedGameId(gameId);
    void search({ gameId, region, language, playStyle });
  };

  const header = (
    <View style={styles.headerBlock}>
      <Text variant="title" style={styles.title} accessibilityRole="header">
        Find your squad
      </Text>
      <Text muted style={{ marginBottom: spacing.lg }}>
        Players who match your game, region, language and style.
      </Text>

      <GameChipScroller label="Game" value={gameId} onChange={setGameId} />
      <View style={styles.filters}>
        <HorizontalChips label="Region" options={REGION_OPTIONS} value={region} onChange={setRegion} allLabel="Any" />
        <HorizontalChips label="Language" options={languageOptions} value={language} onChange={setLanguage} allLabel="Any" />
        <HorizontalChips label="Play style" options={STYLE_OPTIONS} value={playStyle} onChange={setPlayStyle} allLabel="Any" />
      </View>

      <Button
        title="Find teammates"
        icon="search"
        onPress={runSearch}
        disabled={!gameId}
        loading={loading}
        style={{ marginTop: spacing.lg }}
      />
      {!gameId && games.length > 0 ? (
        <Text variant="caption" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
          Pick a game to start
        </Text>
      ) : null}

      {results && !loading && !error && visible.length > 0 ? (
        <Text variant="label" style={styles.resultsLabel}>
          {visible.length} {visible.length === 1 ? 'player' : 'players'} for {byId(searchedGameId)?.name ?? 'this game'}
        </Text>
      ) : null}
    </View>
  );

  let empty: ReactNode = null;
  if (loading) empty = <View style={styles.stateBox}><LoadingState label="Scouting players…" /></View>;
  else if (error) empty = <View style={styles.stateBox}><ErrorState message={error} onRetry={retry} /></View>;
  else if (results === null)
    empty = (
      <View style={styles.stateBox}>
        <EmptyState icon="people" title="Ready when you are" message="Set your filters and tap Find teammates." />
      </View>
    );
  else
    empty = (
      <View style={styles.stateBox}>
        <EmptyState
          icon="search"
          title="No matches yet"
          message="Try removing a filter, or post on the LFG board so players can find you."
          action={<Button title="Post an LFG" variant="secondary" icon="add" onPress={() => router.push('/lfg/new')} />}
        />
      </View>
    );

  const renderItem = ({ item }: { item: SquadmateMatch }) => (
    <SquadmateCard
      match={item}
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.profile.id } })}
      onMessage={() => void openDm(item.profile.id)}
    />
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={loading || error ? [] : visible}
        keyExtractor={(m) => m.profile.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  headerBlock: { paddingTop: spacing.md, marginBottom: spacing.md },
  title: { fontSize: font.size.xl, marginBottom: spacing.xs },
  filters: { gap: spacing.sm, marginTop: spacing.md },
  resultsLabel: { marginTop: spacing.xl, color: colors.textMuted },
  stateBox: { minHeight: 240 },
});
