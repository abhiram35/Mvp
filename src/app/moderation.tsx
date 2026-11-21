import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text, TextField } from '../components/ui';
import { HorizontalChips } from '../features/lfg/HorizontalChips';
import { BetaStats } from '../features/moderation/BetaStats';
import { ReportCard, type ReportCardAction } from '../features/moderation/ReportCard';
import { REPORTS_PAGE_SIZE, getBetaMetrics, listReports, resolveReport, unbanUser } from '../features/moderation/api';
import { useMyStatus } from '../features/moderation/useMyStatus';
import { fetchDisputedScrims, useLoader } from '../features/scrims/api';
import { ScrimCard } from '../features/scrims/components';
import { fetchPendingApplications, reviewApplication } from '../features/tournaments/api';
import type { OrganiserApplication } from '../features/tournaments/types';
import { useNow } from '../lib/hooks';
import type { BetaMetrics, Report, ReportQueueItem } from '../lib/types';
import { makeStyles, spacing, useTheme } from '../theme';

type Tab = Report['status'] | 'scrims' | 'organisers' | 'stats';

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'scrims', label: 'Scrims' },
  { value: 'organisers', label: 'Organisers' },
  { value: 'stats', label: 'Beta stats' },
];

const EMPTY_COPY: Record<Report['status'], { title: string; message: string }> = {
  open: { title: 'Queue is clear', message: 'No open reports. GG.' },
  reviewed: { title: 'Nothing reviewed yet', message: 'Dismissed reports show up here.' },
  actioned: { title: 'No actions yet', message: 'Reports where content was removed or a player was banned show up here.' },
};

function errText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

function ReportList({ status }: { status: Report['status'] }) {
  const t = useTheme();
  const s = useStyles();
  const [items, setItems] = useState<ReportQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const rows = await listReports(status, 0, REPORTS_PAGE_SIZE);
      if (id !== requestId.current) return;
      setItems(rows);
      setHasMore(rows.length === REPORTS_PAGE_SIZE);
      setError(null);
    } catch (err) {
      if (id === requestId.current) setError(errText(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [status]);

  // Mounted fresh per tab (keyed by status), so the initial state is already "loading".
  // Also reloads when coming back from a player's profile.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loadMore = async () => {
    if (loading || loadingMore || !hasMore || error) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const rows = await listReports(status, items.length, REPORTS_PAGE_SIZE);
      if (id !== requestId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.report.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.report.id))];
      });
      setHasMore(rows.length === REPORTS_PAGE_SIZE);
    } catch (err) {
      Alert.alert("Couldn't load more reports", errText(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const run = async (item: ReportQueueItem, fn: () => Promise<void>, failTitle: string) => {
    setBusyId(item.report.id);
    try {
      await fn();
      await load();
    } catch (err) {
      Alert.alert(failTitle, errText(err));
    } finally {
      setBusyId(null);
    }
  };

  const onAction = (item: ReportQueueItem, action: ReportCardAction) => {
    const target = item.target_user;
    const who = target ? target.display_name || `@${target.username}` : 'this player';
    switch (action.kind) {
      case 'dismiss':
        Alert.alert('Dismiss report?', 'It moves to Reviewed. Nothing happens to the content or the player.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Dismiss', onPress: () => void run(item, () => resolveReport(item.report.id, 'dismiss'), "Couldn't dismiss report") },
        ]);
        return;
      case 'remove':
        Alert.alert('Remove content?', `This permanently deletes the reported content and notifies ${who}.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => void run(item, () => resolveReport(item.report.id, 'remove_content'), "Couldn't remove content"),
          },
        ]);
        return;
      case 'ban': {
        const label = `${action.days} ${action.days === 1 ? 'day' : 'days'}`;
        Alert.alert(`Ban ${who} for ${label}?`, "They can still read and browse, but can't post, message, host or reply. They'll be notified.", [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Ban ${label}`,
            style: 'destructive',
            onPress: () => void run(item, () => resolveReport(item.report.id, 'ban_user', action.days), "Couldn't ban player"),
          },
        ]);
        return;
      }
      case 'unban':
        if (!target) return;
        Alert.alert(`Lift ban on ${who}?`, 'They can post and message again straight away. Does nothing if they are not banned.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Lift ban', onPress: () => void run(item, () => unbanUser(target.id), "Couldn't lift ban") },
        ]);
        return;
    }
  };

  if (loading) return <LoadingState />;
  if (error && !items.length) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.report.id}
      renderItem={({ item }) => <ReportCard item={item} busy={busyId === item.report.id} onAction={onAction} />}
      contentContainerStyle={[s.list, !items.length && { flexGrow: 1 }]}
      ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title={EMPTY_COPY[status].title} message={EMPTY_COPY[status].message} />}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={t.colors.primary} style={{ marginVertical: spacing.lg }} /> : undefined}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.colors.primary}
          colors={[t.colors.primary]}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    />
  );
}

function StatsTab() {
  const t = useTheme();
  const s = useStyles();
  const [metrics, setMetrics] = useState<BetaMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMetrics(await getBetaMetrics(14));
      setError(null);
    } catch (err) {
      setError(errText(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!metrics && error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!metrics) return <LoadingState />;
  return (
    <ScrollView
      contentContainerStyle={s.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.colors.primary}
          colors={[t.colors.primary]}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <BetaStats metrics={metrics} />
    </ScrollView>
  );
}

/** Scrims where the two captains reported different scores. Open one to set the result. */
/** Days since a date, for "account age" on organiser applications. */
function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ApplicationCard({ app, onDone }: { app: OrganiserApplication; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const name = app.profile?.display_name || app.profile?.username || 'Player';
  const age = daysSince(app.profile?.created_at);
  const review = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'reject');
    try {
      await reviewApplication(app.id, approve, note);
      onDone();
    } catch (e) {
      Alert.alert("Couldn't review", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar uri={app.profile?.avatar_url} name={name} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="strong">{app.org_name}</Text>
          <Text variant="caption">{[`@${app.profile?.username ?? 'unknown'}`, age !== null ? `account ${age} days old` : null, app.discord].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <Text>{app.about}</Text>
      <TextField value={note} onChangeText={setNote} maxLength={300} placeholder="Note to the applicant (optional)" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button title="Approve" size="sm" style={{ flex: 1 }} loading={busy === 'approve'} disabled={busy !== null} onPress={() => void review(true)} />
        <Button title="Reject" size="sm" variant="secondary" style={{ flex: 1 }} loading={busy === 'reject'} disabled={busy !== null} onPress={() => void review(false)} />
      </View>
      <Button title="View profile" size="sm" variant="ghost" onPress={() => router.push({ pathname: '/user/[id]', params: { id: app.profile_id } })} />
    </Card>
  );
}

/** Organiser applications waiting for a moderator. Approving gives the ✓ organiser badge. */
function OrganisersTab() {
  const t = useTheme();
  const s = useStyles();
  const q = useLoader(fetchPendingApplications, 'organiser-apps');
  if (q.loading) return <LoadingState />;
  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={() => void q.reload()} />;
  const items = q.data ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(x) => x.id}
      contentContainerStyle={[s.list, !items.length && { flexGrow: 1 }]}
      renderItem={({ item }) => <ApplicationCard app={item} onDone={() => void q.reload()} />}
      ListEmptyComponent={<EmptyState icon="ribbon-outline" title="No applications" message="Requests to become a verified tournament organiser show up here." />}
      refreshControl={<RefreshControl refreshing={q.refreshing} tintColor={t.colors.primary} colors={[t.colors.primary]} onRefresh={() => void q.refresh()} />}
    />
  );
}

function DisputesTab() {
  const t = useTheme();
  const s = useStyles();
  const now = useNow();
  const q = useLoader(fetchDisputedScrims, 'disputes');
  if (q.loading) return <LoadingState />;
  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={() => void q.reload()} />;
  const items = q.data ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(x) => x.id}
      contentContainerStyle={[s.list, !items.length && { flexGrow: 1 }]}
      renderItem={({ item }) => <ScrimCard scrim={item} now={now} onPress={() => router.push({ pathname: '/scrims/[id]', params: { id: item.id } })} />}
      ListEmptyComponent={<EmptyState icon="trophy-outline" title="No disputes" message="Scrims where captains report different scores show up here." />}
      refreshControl={<RefreshControl refreshing={q.refreshing} tintColor={t.colors.primary} colors={[t.colors.primary]} onRefresh={() => void q.refresh()} />}
    />
  );
}

export default function ModerationScreen() {
  const s = useStyles();
  const { isModerator, loaded } = useMyStatus();
  // Notifications can deep-link to a tab (e.g. organiser applications → ?tab=organisers).
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.some((x) => x.value === params.tab) ? (params.tab as Tab) : 'open');

  if (!loaded) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  // Not a moderator: no data calls at all.
  if (!isModerator) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="lock-closed-outline" title="This area is for moderators." />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} padded={false}>
      <View style={s.tabs}>
        {/* Six queues don't fit as equal tabs on a phone: a scrollable chip row instead. */}
        <HorizontalChips options={TABS} value={tab} onChange={(v) => v && setTab(v)} />
      </View>
      {tab === 'stats' ? <StatsTab /> : tab === 'scrims' ? <DisputesTab /> : tab === 'organisers' ? <OrganisersTab /> : <ReportList key={tab} status={tab} />}
    </Screen>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    tabs: { paddingHorizontal: spacing.lg },
    list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  }),
);
