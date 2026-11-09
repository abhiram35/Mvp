import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text as RNText, View } from 'react-native';
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { REGIONS, regionLabel } from '../../features/lfg/format';
import { HorizontalChips } from '../../features/lfg/HorizontalChips';
import { fetchFeaturedScrims, fetchMyInvites, fetchMyScrims, fetchMyTeams, fetchOpenScrims, useLoader } from '../../features/scrims/api';
import { ScrimCard } from '../../features/scrims/components';
import { isScrimGame } from '../../features/scrims/logic';
import type { Scrim } from '../../features/scrims/types';
import { TournamentsTab } from '../../features/tournaments/TournamentsTab';
import { useNow } from '../../lib/hooks';
import type { Region } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));

type Row = { kind: 'header'; title: string; key: string } | { kind: 'scrim'; scrim: Scrim; mine: boolean; key: string };
type Section = 'practice' | 'tournaments';

/** Practice | Tournaments switch at the top of the Scrims section. */
function SectionSwitch({ value, onChange }: { value: Section; onChange: (v: Section) => void }) {
  const t = useTheme();
  const options: { value: Section; label: string }[] = [
    { value: 'practice', label: 'Practice' },
    { value: 'tournaments', label: 'Tournaments' },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.md, padding: 4, marginBottom: spacing.lg }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md - 2, backgroundColor: on ? t.colors.primary : 'transparent' }}
          >
            <RNText style={{ fontFamily: t.fonts.heading, fontSize: 16, letterSpacing: 1.5, textTransform: 'uppercase', color: on ? t.colors.onPrimary : t.colors.textMuted }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScrimBoardScreen() {
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const now = useNow(30_000);
  const { games, byId } = useGames();
  const scrimGames = useMemo(() => games.filter(isScrimGame), [games]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [section, setSection] = useState<Section>(params.tab === 'tournaments' ? 'tournaments' : 'practice');

  const mine = useLoader(
    useCallback(async () => {
      if (!myId) return { teams: [], scrims: [] as Scrim[], invites: 0 };
      const [teams, invites] = await Promise.all([fetchMyTeams(myId), fetchMyInvites(myId)]);
      const scrims = await fetchMyScrims(teams.map((m) => m.team.id));
      return { teams, scrims, invites: invites.length };
    }, [myId]),
    `mine-${myId}`,
  );
  const featured = useLoader(fetchFeaturedScrims, 'featured');
  const board = useLoader(
    useCallback(() => fetchOpenScrims(gameId, region), [gameId, region]),
    `board-${gameId}-${region}`,
  );

  const myTeams = useMemo(() => mine.data?.teams ?? [], [mine.data]);
  const myTeamIds = useMemo(() => new Set(myTeams.map((m) => m.team.id)), [myTeams]);
  const captainOf = myTeams.filter((m) => m.role === 'captain');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const feat = (featured.data ?? []).filter((x) => !gameId || x.game_id === gameId);
    const featIds = new Set(feat.map((x) => x.id));
    if (feat.length > 0) {
      out.push({ kind: 'header', title: 'Featured', key: 'h-feat' });
      feat.forEach((x) => out.push({ kind: 'scrim', scrim: x, mine: !!(x.host_team_id && myTeamIds.has(x.host_team_id)), key: `f-${x.id}` }));
    }
    const myScrims = (mine.data?.scrims ?? []).filter((x) => !gameId || x.game_id === gameId);
    if (myScrims.length > 0) {
      out.push({ kind: 'header', title: 'Your scrims', key: 'h-mine' });
      myScrims.forEach((x) => out.push({ kind: 'scrim', scrim: x, mine: true, key: `m-${x.id}` }));
    }
    const open = (board.data ?? []).filter((x) => (!x.host_team_id || !myTeamIds.has(x.host_team_id)) && !featIds.has(x.id));
    out.push({ kind: 'header', title: 'Open scrims', key: 'h-open' });
    open.forEach((x) => out.push({ kind: 'scrim', scrim: x, mine: false, key: `o-${x.id}` }));
    return out;
  }, [mine.data, board.data, featured.data, gameId, myTeamIds]);

  const openCount = rows.filter((r) => r.kind === 'scrim' && r.key.startsWith('o-')).length;
  const refresh = () => {
    void mine.refresh();
    void board.refresh();
    void featured.refresh();
  };

  const header = (
    <View style={s.headerBlock}>
      <SectionSwitch value={section} onChange={setSection} />
      <Text muted style={{ marginBottom: spacing.md }}>
        Book practice matches against other teams. Free to play.
      </Text>
      <HorizontalChips options={scrimGames.map((g) => ({ value: g.id, label: g.name }))} value={gameId} onChange={setGameId} allLabel="All games" />
      <View style={{ height: spacing.sm }} />
      <HorizontalChips options={REGION_OPTIONS} value={region} onChange={setRegion} allLabel="Any region" />

      <View style={s.actions}>
        <Button
          title="Post a scrim"
          icon="add"
          style={{ flex: 1 }}
          onPress={() => router.push(captainOf.length > 0 ? '/scrims/new' : '/teams/new')}
        />
        <Button title="My teams" variant="secondary" icon="people" style={{ flex: 1 }} onPress={() => router.push('/teams')} />
      </View>

      {mine.data && mine.data.invites > 0 ? (
        <Card onPress={() => router.push('/teams')} style={s.notice} accessibilityLabel={`${mine.data.invites} team invites. Open my teams`}>
          <Ionicons name="mail-unread-outline" size={20} color={t.colors.primary} />
          <Text variant="strong" style={{ flex: 1 }}>
            {mine.data.invites === 1 ? 'You have a team invite' : `You have ${mine.data.invites} team invites`}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} />
        </Card>
      ) : null}
      {mine.data && myTeams.length === 0 ? (
        <Card style={s.notice}>
          <Ionicons name="shield-half-outline" size={20} color={t.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="strong">You need a team to scrim</Text>
            <Text variant="caption">Create one and invite 4+ friends, or ask a captain to invite you.</Text>
          </View>
        </Card>
      ) : null}
    </View>
  );

  if (section === 'tournaments') {
    return (
      <Screen padded={false} edges={[]}>
        <Stack.Screen options={{ title: 'Scrims' }} />
        <TournamentsTab
          gameId={gameId}
          header={
            <View>
              <SectionSwitch value={section} onChange={setSection} />
              <Text muted style={{ marginBottom: spacing.md }}>
                Free, streamed tournaments hosted by verified organisers.
              </Text>
              <HorizontalChips options={scrimGames.map((g) => ({ value: g.id, label: g.name }))} value={gameId} onChange={setGameId} allLabel="All games" />
            </View>
          }
        />
      </Screen>
    );
  }

  if (board.loading && mine.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Scrims' }} />
        <LoadingState label="Loading scrims…" />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={[]}>
      <Stack.Screen options={{ title: 'Scrims' }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={s.list}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={board.refreshing || mine.refreshing} onRefresh={refresh} tintColor={t.colors.primary} />}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text variant="label" accessibilityRole="header" style={s.section}>
              {item.title}
            </Text>
          ) : (
            <ScrimCard
              scrim={item.scrim}
              mine={item.mine}
              now={now}
              gameName={gameId ? undefined : byId(item.scrim.game_id)?.name}
              onPress={() => router.push({ pathname: '/scrims/[id]', params: { id: item.scrim.id } })}
            />
          )
        }
        ListFooterComponent={
          board.error ? (
            <ErrorState message={board.error} onRetry={() => void board.reload()} />
          ) : openCount === 0 ? (
            <View style={{ minHeight: 220 }}>
              <EmptyState
                icon="flag-outline"
                title="No open scrims"
                message={captainOf.length > 0 ? 'Post one and other teams can request it.' : 'Check back later, or create a team and post your own.'}
              />
            </View>
          ) : undefined
        }
      />
      {myTeams.length > 0 ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel="Create a team" onPress={() => router.push('/teams/new')} style={[s.fab, { backgroundColor: t.colors.primary, borderRadius: t.shape.round ? 28 : t.radius.md }]}>
          <Ionicons name="shield-half" size={22} color={t.colors.onPrimary} />
          <Text style={{ color: t.colors.onPrimary, fontFamily: t.fonts.heading }}>Create team</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { padding: spacing.lg, paddingBottom: 96 },
    headerBlock: { marginBottom: spacing.sm },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    notice: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    section: { marginTop: spacing.lg, marginBottom: spacing.sm, fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 52 },
  }),
);
