import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, ErrorState, LoadingState, SectionHeader, Text } from '../../components/ui';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';
import { useGames } from '../games/useGames';
import { fetchEntryCounts, fetchMyApplication, fetchOrganiser, fetchTournaments, useLoader } from './api';
import { TournamentCard } from './components';
import { tournamentPhase } from './logic';
import type { Tournament } from './types';

type Row = { kind: 'header'; title: string; key: string; index: number } | { kind: 'item'; t: Tournament; key: string };

/** The "Tournaments" half of the Scrims section. `header` is the shared filters/switch block. */
export function TournamentsTab({ gameId, header }: { gameId: string | null; header: ReactElement }) {
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const now = useNow(30_000);
  const { byId } = useGames();

  const me = useLoader(
    useCallback(async () => {
      if (!myId) return { organiser: null, application: null };
      const [organiser, application] = await Promise.all([fetchOrganiser(myId), fetchMyApplication(myId)]);
      return { organiser, application };
    }, [myId]),
    `org-${myId}`,
  );
  const list = useLoader(
    useCallback(async () => {
      const items = await fetchTournaments(gameId);
      const counts = await fetchEntryCounts(items.map((x) => x.id));
      return { items, counts };
    }, [gameId]),
    `tournaments-${gameId}`,
  );

  const rows = useMemo<Row[]>(() => {
    const items = list.data?.items ?? [];
    const groups: [string, Tournament[]][] = [
      ['Live now', items.filter((x) => tournamentPhase(x, now) === 'live')],
      ['Upcoming', items.filter((x) => ['registration', 'closed', 'checkin', 'starting'].includes(tournamentPhase(x, now)))],
      ['Finished', items.filter((x) => tournamentPhase(x, now) === 'completed').reverse()],
    ];
    const out: Row[] = [];
    for (const [title, g] of groups) {
      if (g.length === 0) continue;
      out.push({ kind: 'header', title, key: `h-${title}`, index: out.filter((r) => r.kind === 'header').length + 1 });
      g.forEach((x) => out.push({ kind: 'item', t: x, key: x.id }));
    }
    return out;
  }, [list.data, now]);

  const isOrganiser = !!me.data?.organiser;
  const application = me.data?.application ?? null;

  const hostBlock = isOrganiser ? (
    <Button title="Host a tournament" icon="trophy" style={s.host} onPress={() => router.push('/tournaments/new')} />
  ) : application?.status === 'pending' ? (
    <Card style={s.notice}>
      <Ionicons name="hourglass-outline" size={20} color={t.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="strong">Organiser application sent</Text>
        <Text variant="caption">A moderator will review it. You will get a notification.</Text>
      </View>
    </Card>
  ) : (
    <Card onPress={() => router.push('/organisers/apply')} style={s.notice} accessibilityLabel="Apply to host tournaments">
      <Ionicons name="ribbon-outline" size={20} color={t.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="strong">Want to host tournaments?</Text>
        <Text variant="caption">{application?.status === 'rejected' ? 'Your last application was not approved. You can apply again.' : 'Apply to become a verified organiser.'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} />
    </Card>
  );

  if (list.loading) {
    return (
      <View style={{ flex: 1 }}>
        <View style={s.list}>{header}</View>
        <LoadingState label="Loading tournaments…" />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      contentContainerStyle={s.list}
      ListHeaderComponent={
        <View>
          {header}
          {hostBlock}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={list.refreshing}
          onRefresh={() => {
            void list.refresh();
            void me.refresh();
          }}
          tintColor={t.colors.primary}
        />
      }
      renderItem={({ item }) =>
        item.kind === 'header' ? (
          <SectionHeader title={item.title} index={item.index} style={{ marginBottom: spacing.sm }} />
        ) : (
          <TournamentCard
            tournament={item.t}
            gameName={gameId ? undefined : byId(item.t.game_id)?.name}
            registered={list.data?.counts.get(item.t.id) ?? 0}
            now={now}
            onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: item.t.id } })}
          />
        )
      }
      ListEmptyComponent={
        list.error ? (
          <ErrorState message={list.error} onRetry={() => void list.reload()} />
        ) : (
          <View style={{ minHeight: 240 }}>
            <EmptyState icon="trophy-outline" title="No tournaments yet" message={isOrganiser ? 'Host the first one.' : 'Verified organisers host free, streamed tournaments here.'} />
          </View>
        )
      }
    />
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { padding: spacing.lg, paddingBottom: 96 },
    host: { marginTop: spacing.lg },
    notice: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    section: { marginTop: spacing.xl, marginBottom: spacing.sm, fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
  }),
);
