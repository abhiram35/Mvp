import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BackHandler, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, LiveDot, Screen, ScreenHeader, Text } from '../../components/ui';
import { DuoReveal } from '../../features/duo/DuoReveal';
import { GameCarousel } from '../../features/duo/GameCarousel';
import { LoadoutLine, type LoadoutOption } from '../../features/duo/LoadoutLine';
import { useReducedMotion } from '../../features/duo/motion';
import { initialQueue, queueReducer, STYLE_STOPS, styleStopIndex } from '../../features/duo/queue';
import { QueueButton } from '../../features/duo/QueueButton';
import { RadarSearch } from '../../features/duo/RadarSearch';
import { StyleSlider } from '../../features/duo/StyleSlider';
import { playersLabel, usePlayerCount } from '../../features/duo/api';
import { gameArtUrl, isSquadable } from '../../features/games/art';
import { fetchGames, useGames } from '../../features/games/useGames';
import { hostCta, REGIONS, regionLabel } from '../../features/lfg/format';
import { useBlockedIds } from '../../features/safety/blocks';
import { fetchMyGameIds, findSquadmates } from '../../features/squad/api';
import { SquadmateCard } from '../../features/squad/SquadmateCard';
import { openDm } from '../../lib/actions';
import { LANGUAGES, type Game, type PlayStyle, type Region, type SquadmateMatch } from '../../lib/types';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

/** Searches shorter than this still show the radar briefly, so the result doesn't flash in. */
const MIN_SEARCH_MS = 1600;

const REGION_OPTIONS: LoadoutOption<Region>[] = [
  { value: null, label: 'any region' },
  ...REGIONS.map((r) => ({ value: r, label: regionLabel(r) })),
];

const openProfile = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

export default function DuoFinderScreen() {
  const t = useTheme();
  const s = useStyles();
  const reduced = useReducedMotion();
  const myId = useUserId();
  const { profile } = useAuth();
  const { games, loading: gamesLoading, byId } = useGames();
  const { blockedIds } = useBlockedIds();

  const [pickedGameId, setGameId] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [results, setResults] = useState<SquadmateMatch[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [queue, dispatch] = useReducer(queueReducer, initialQueue);
  const reqId = useRef(0);

  const squadGames = useMemo(() => games.filter(isSquadable), [games]);
  // Until the player (or their profile) picks one, use the first game so Queue up works straight away.
  const gameId = pickedGameId ?? squadGames[0]?.id ?? null;
  const game = byId(gameId);
  const playerCount = usePlayerCount(gameId);

  // Default the game to the first squadable one on my profile.
  useEffect(() => {
    if (!myId) return;
    let active = true;
    void (async () => {
      let ids: string[];
      try {
        ids = await fetchMyGameIds(myId);
      } catch {
        return; // non-critical: the player just picks a game
      }
      let all: Game[] | null = null;
      try {
        all = await fetchGames();
      } catch {
        all = null;
      }
      if (!all) return; // can't tell which games are squadable; let the player pick
      const first = ids.find((id) => {
        const g = all.find((x) => x.id === id);
        return !!g && isSquadable(g);
      });
      if (active && first) setGameId((cur) => cur ?? first);
    })();
    return () => {
      active = false;
    };
  }, [myId]);

  const languageOptions = useMemo<LoadoutOption<string>[]>(
    () => [{ value: null, label: 'any language' }, ...Array.from(new Set([...(profile?.languages ?? []), ...LANGUAGES])).map((l) => ({ value: l, label: l }))],
    [profile?.languages],
  );

  const visible = useMemo(() => results.filter((m) => !blockedIds.has(m.profile.id) && m.profile.id !== myId), [results, blockedIds, myId]);
  const current = queue.phase === 'found' ? visible[queue.index % Math.max(1, visible.length)] : undefined;

  const runSearch = async () => {
    if (!gameId) return;
    const id = ++reqId.current;
    setShowAll(false);
    dispatch({ type: 'queue' });
    const started = Date.now();
    const wait = async () => {
      const left = (reduced ? 0 : MIN_SEARCH_MS) - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
    };
    try {
      const rows = await findSquadmates({ gameId, region, language, playStyle });
      await wait();
      if (id !== reqId.current) return;
      setResults(rows);
      const count = rows.filter((m) => !blockedIds.has(m.profile.id) && m.profile.id !== myId).length;
      dispatch({ type: 'results', count });
    } catch (e) {
      await wait();
      if (id !== reqId.current) return;
      dispatch({ type: 'error', message: (e as { message?: string })?.message ?? 'Something went wrong.' });
    }
  };

  const leave = useCallback((type: 'cancel' | 'back') => {
    reqId.current++; // drop any search still in flight
    setShowAll(false);
    dispatch({ type });
  }, []);

  const overlayOpen = queue.phase !== 'idle';
  // Android back closes the overlay (list → reveal → lobby) instead of leaving the tab.
  useFocusEffect(
    useCallback(() => {
      if (!overlayOpen) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (showAll) setShowAll(false);
        else leave(queue.phase === 'searching' ? 'cancel' : 'back');
        return true;
      });
      return () => sub.remove();
    }, [overlayOpen, showAll, leave, queue.phase]),
  );

  const gameName = game?.name ?? 'this game';
  const summary = [gameName, region ? regionLabel(region) : 'any region', language ?? 'any language', STYLE_STOPS[styleStopIndex(playStyle)].a11y.toLowerCase()].join(' · ');
  const art = gameArtUrl(game);

  return (
    <Screen padded={false}>
      <View style={{ flex: 1 }}>
        {art ? (
          <Image
            source={{ uri: art }}
            blurRadius={40}
            contentFit="cover"
            transition={300}
            style={[s.backdrop, { opacity: t.dark ? 0.3 : 0.16 }]}
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          // Hide the lobby from screen readers while an overlay covers it (Android has no accessibilityViewIsModal).
          importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={overlayOpen}
        >
          <ScreenHeader title="Find a duo" />
          <View style={s.countRow}>
            {playerCount !== null && game ? <LiveDot label={`${playersLabel(playerCount)} play ${game.name} on Vinq`} /> : <Text variant="label">Pick a game, set your loadout, queue up.</Text>}
          </View>

          <Text variant="label" style={s.kicker}>
            Pick your game
          </Text>
          {gamesLoading && squadGames.length === 0 ? (
            <Text muted style={{ marginVertical: spacing.lg }}>
              Loading games…
            </Text>
          ) : (
            <GameCarousel games={squadGames} value={gameId} onChange={setGameId} reduced={reduced} />
          )}

          <LoadoutLine
            region={region}
            regionOptions={REGION_OPTIONS}
            onRegion={setRegion}
            language={language}
            languageOptions={languageOptions}
            onLanguage={setLanguage}
            reduced={reduced}
          />

          <View style={{ marginTop: spacing.lg }}>
            <StyleSlider value={playStyle} onChange={setPlayStyle} reduced={reduced} />
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <QueueButton title="Queue up" onPress={() => void runSearch()} disabled={!gameId} reduced={reduced} />
          </View>
        </ScrollView>

        {queue.phase === 'searching' ? <RadarSearch summary={summary} onCancel={() => leave('cancel')} reduced={reduced} /> : null}

        {/* The reveal stays mounted under "All results", so its intro doesn't replay on the way back. */}
        {queue.phase === 'found' && current ? (
          <DuoReveal
            me={profile ?? null}
            match={current}
            index={queue.index % visible.length}
            total={visible.length}
            revealKey={queue.revealKey}
            gameName={gameName}
            onMessage={() => void openDm(current.profile.id)}
            onProfile={() => openProfile(current.profile.id)}
            onNext={() => dispatch({ type: 'next', count: visible.length })}
            onBack={() => leave('back')}
            onSeeAll={() => setShowAll(true)}
            hidden={showAll}
            reduced={reduced}
          />
        ) : null}

        {queue.phase === 'found' && showAll ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.bg }]} accessibilityViewIsModal>
            <FlatList
              data={visible}
              keyExtractor={(m) => m.profile.id}
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <View style={{ marginBottom: spacing.md }}>
                  <ScreenHeader title={`${visible.length} duos found`} subtitle={summary} />
                  <Button title="Back to reveal" variant="secondary" icon="arrow-back" size="sm" onPress={() => setShowAll(false)} />
                </View>
              }
              renderItem={({ item }) => <SquadmateCard match={item} onPress={() => openProfile(item.profile.id)} onMessage={() => void openDm(item.profile.id)} />}
            />
          </View>
        ) : null}

        {queue.phase === 'empty' || (queue.phase === 'found' && !current) ? (
          <View style={[StyleSheet.absoluteFill, s.overlay, { backgroundColor: t.colors.bg }]} accessibilityViewIsModal>
            <EmptyState
              icon="radio-outline"
              title="No duos right now"
              message={`Nobody matches that loadout yet. Loosen a filter, or host a lobby in ${t.words.lobbies} so players can find you.`}
              action={
                <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
                  <Button title={hostCta(t.words)} icon="add" onPress={() => router.push('/lfg/new')} />
                  <Button title="Change loadout" variant="secondary" onPress={() => leave('back')} />
                </View>
              }
            />
          </View>
        ) : null}

        {queue.phase === 'error' ? (
          <View style={[StyleSheet.absoluteFill, s.overlay, { backgroundColor: t.colors.bg }]} accessibilityViewIsModal>
            <ErrorState message={queue.error ?? 'Something went wrong.'} onRetry={() => void runSearch()} />
            <Button title="Back" variant="ghost" onPress={() => leave('back')} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    backdrop: { position: 'absolute', left: -40, right: -40, top: -60, height: 320 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    countRow: { marginTop: -spacing.xs, marginBottom: spacing.lg },
    kicker: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    overlay: { justifyContent: 'center', padding: spacing.lg },
  }),
);
