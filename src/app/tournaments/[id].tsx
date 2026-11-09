import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { regionLabel } from '../../features/lfg/format';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { fetchMyTeams } from '../../features/scrims/api';
import { TeamTag } from '../../features/scrims/components';
import { FORMAT_LABELS, formatScrimTime, startsIn, streamPlatform } from '../../features/scrims/logic';
import {
  cancelTournament,
  checkInTeam,
  fetchEntries,
  fetchMatches,
  fetchTournament,
  registerTeam,
  startTournament,
  useLoader,
  watchTournament,
  withdrawTeam,
} from '../../features/tournaments/api';
import { Bracket, OrganiserByline, PhasePill } from '../../features/tournaments/components';
import { activeEntries, canCheckIn, canStart, nextMatchFor, roundCount, roundName, slotsLabel, TOURNAMENT_RULES, tournamentPhase } from '../../features/tournaments/logic';
import type { EntryStatus, TournamentMatch } from '../../features/tournaments/types';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

type Tab = 'overview' | 'teams' | 'bracket';

const ENTRY_LABELS: Record<EntryStatus, string> = {
  registered: 'Registered',
  withdrawn: 'Withdrawn',
  no_show: 'No-show',
  playing: 'Playing',
  eliminated: 'Eliminated',
  champion: 'Champion',
  disqualified: 'Disqualified',
};

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const now = useNow(15_000);
  const { byId } = useGames();
  const { isModerator, banned } = useMyStatus();
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [pickTeam, setPickTeam] = useState<string | null>(null);

  const data = useLoader(
    useCallback(async () => {
      const tour = await fetchTournament(String(id));
      if (!tour) return null;
      const [entries, matches, myTeams] = await Promise.all([
        fetchEntries(tour.id),
        tour.status === 'registration' ? Promise.resolve([] as TournamentMatch[]) : fetchMatches(tour.id),
        myId ? fetchMyTeams(myId) : Promise.resolve([]),
      ]);
      return { tour, entries, matches, myTeams };
    }, [id, myId]),
    `tour-${id}-${myId}`,
  );
  const reload = data.reload;
  useEffect(() => (id ? watchTournament(String(id), () => void reload()) : undefined), [id, reload]);

  const d = data.data;
  const derived = useMemo(() => {
    if (!d) return null;
    const { tour, entries, myTeams } = d;
    const myTeamIds = new Set(myTeams.map((m) => m.team.id));
    const myEntry = entries.find((e) => myTeamIds.has(e.team_id) && e.status !== 'withdrawn') ?? null;
    const myMembership = myEntry ? (myTeams.find((m) => m.team.id === myEntry.team_id) ?? null) : null;
    const eligible = myTeams.filter((m) => m.role === 'captain' && m.team.game_id === tour.game_id).map((m) => m.team);
    const active = activeEntries(entries);
    const checkedIn = entries.filter((e) => e.status === 'registered' && e.checked_in_at).length;
    return { myEntry, myMembership, eligible, active, checkedIn };
  }, [d]);

  const act = async (key: string, fn: () => Promise<unknown>, failTitle: string) => {
    setBusy(key);
    try {
      await fn();
      await data.reload();
    } catch (e) {
      Alert.alert(failTitle, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (data.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Tournament' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (data.error && !d) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Tournament' }} />
        <ErrorState message={data.error} onRetry={() => void data.reload()} />
      </Screen>
    );
  }
  if (!d || !derived) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Tournament' }} />
        <EmptyState icon="trophy-outline" title="Tournament not found" message="It may have been removed." />
      </Screen>
    );
  }

  const { tour, entries, matches } = d;
  const { myEntry, myMembership, eligible, active, checkedIn } = derived;
  const phase = tournamentPhase(tour, now);
  const isOrganiser = !!myId && tour.organiser_id === myId;
  const game = byId(tour.game_id);
  const full = active.length >= tour.max_teams;
  const registrationOpen = phase === 'registration';
  const regTeam = eligible.find((e) => e.id === (pickTeam ?? eligible[0]?.id)) ?? null;
  const myNext = myEntry ? nextMatchFor(matches, myEntry.team_id) : null;
  const champion = tour.winner_team_id ? entries.find((e) => e.team_id === tour.winner_team_id)?.team ?? null : null;
  const totalRounds = matches.length ? Math.max(...matches.map((m) => m.round)) : roundCount(tour.max_teams);
  const live = phase === 'live';

  const openMatch = (m: TournamentMatch) => router.push({ pathname: '/tournaments/match/[id]', params: { id: m.id } });

  const confirmCancel = () =>
    Alert.alert('Cancel this tournament?', 'All registered teams will be told. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel tournament', style: 'destructive', onPress: () => void act('cancel', () => cancelTournament(tour.id), "Couldn't cancel") },
    ]);

  return (
    <Screen padded={false} edges={[]}>
      <Stack.Screen options={{ title: tour.name }} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={() => void data.refresh()} tintColor={t.colors.primary} />}>
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <Card tone="panel" style={s.hero}>
          <View style={s.heroTop}>
            <RNText style={[s.kicker, { color: t.colors.onPanel }]}>
              {[game?.name, tour.region ? regionLabel(tour.region) : 'All regions'].filter(Boolean).join(' · ')}
            </RNText>
            <PhasePill phase={phase} />
          </View>
          <RNText style={[s.title, { color: t.colors.onPanel }]} accessibilityRole="header">
            {tour.name}
          </RNText>
          <OrganiserByline name={tour.organiser?.org_name} onPanel />
          <View style={s.heroStats}>
            <HeroStat label="Starts" value={phase === 'registration' || phase === 'closed' ? startsIn(tour.starts_at, now) : formatScrimTime(tour.starts_at, now)} />
            <HeroStat label="Teams" value={slotsLabel(active.length, tour.max_teams)} />
            <HeroStat label="Format" value={`${tour.match_format.toUpperCase()} · final ${tour.final_format.toUpperCase()}`} />
          </View>
          {tour.prize ? (
            <View style={s.prize}>
              <Ionicons name="trophy" size={16} color={t.colors.primary} />
              <RNText style={{ flex: 1, color: t.colors.onPanel, fontFamily: t.fonts.bodyMedium }}>{tour.prize}</RNText>
            </View>
          ) : null}
          <Button
            title={live ? `Watch live on ${streamPlatform(tour.stream_url)}` : `Stream on ${streamPlatform(tour.stream_url)}`}
            icon={live ? 'radio' : 'play-circle'}
            variant={live ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => void Linking.openURL(tour.stream_url).catch(() => Alert.alert("Couldn't open the stream", tour.stream_url))}
          />
        </Card>

        {/* ── Champion ───────────────────────────────────────────────── */}
        {phase === 'completed' && champion ? (
          <Card style={s.champion}>
            <Ionicons name="trophy" size={28} color={t.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Champion</Text>
              <Text variant="heading">{`${champion.name} [${champion.tag}]`}</Text>
            </View>
          </Card>
        ) : null}

        {/* ── What I can do now ──────────────────────────────────────── */}
        <View style={s.actions}>
          {myNext ? (
            <Card onPress={() => openMatch(myNext)} style={s.nextMatch} accessibilityLabel="Open your next match">
              <Ionicons name="flash" size={22} color={t.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="strong">Your match is ready</Text>
                <Text variant="caption">
                  {`${roundName(myNext.round, totalRounds)} · ${myNext.team_a?.tag ?? '?'} vs ${myNext.team_b?.tag ?? '?'} · ${FORMAT_LABELS[myNext.format]}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} />
            </Card>
          ) : null}

          {myEntry && myEntry.status === 'registered' ? (
            <Card style={{ gap: spacing.sm }}>
              <Text variant="strong">{`Registered as ${myEntry.team?.name ?? 'your team'} [${myEntry.team?.tag ?? ''}]`}</Text>
              {myEntry.checked_in_at ? (
                <Text muted>Checked in. The organiser starts the bracket at the start time.</Text>
              ) : canCheckIn(tour, now) ? (
                <Button title="Check in now" icon="checkmark-circle" loading={busy === 'checkin'} onPress={() => void act('checkin', () => checkInTeam(tour.id, myEntry.team_id), "Couldn't check in")} />
              ) : (
                <Text muted>{`Check in opens ${TOURNAMENT_RULES.checkInOpensMin} minutes before the start. Teams that don't check in are dropped.`}</Text>
              )}
              {myMembership?.role === 'captain' && tour.status === 'registration' ? (
                <Button
                  title="Withdraw team"
                  variant="ghost"
                  size="sm"
                  loading={busy === 'withdraw'}
                  onPress={() =>
                    Alert.alert('Withdraw your team?', 'You can register again while registration is open.', [
                      { text: 'Stay in', style: 'cancel' },
                      { text: 'Withdraw', style: 'destructive', onPress: () => void act('withdraw', () => withdrawTeam(tour.id, myEntry.team_id), "Couldn't withdraw") },
                    ])
                  }
                />
              ) : null}
            </Card>
          ) : null}

          {!myEntry && registrationOpen ? (
            eligible.length === 0 ? (
              <Card style={{ gap: spacing.sm }}>
                <Text variant="strong">Want to play?</Text>
                <Text muted>{`Team captains register here. Make a ${game?.name ?? ''} team with ${TOURNAMENT_RULES.minRoster}+ players first.`}</Text>
                <Button title="My teams" variant="secondary" size="sm" onPress={() => router.push('/teams')} />
              </Card>
            ) : (
              <Card style={{ gap: spacing.sm }}>
                {eligible.length > 1 ? (
                  <ChipRow>
                    {eligible.map((e) => (
                      <Chip key={e.id} label={`[${e.tag}] ${e.name}`} selected={e.id === regTeam?.id} onPress={() => setPickTeam(e.id)} />
                    ))}
                  </ChipRow>
                ) : null}
                <View style={s.notice}>
                  <Ionicons name="videocam" size={16} color={t.colors.primary} />
                  <Text variant="caption" style={{ flex: 1 }}>
                    This tournament is streamed. By registering, your team agrees to appear on stream. Free entry.
                  </Text>
                </View>
                <Button
                  title={full ? 'Tournament is full' : `Register ${regTeam ? `[${regTeam.tag}]` : 'team'}`}
                  icon="trophy"
                  disabled={full || banned || !regTeam}
                  loading={busy === 'register'}
                  onPress={() => regTeam && void act('register', () => registerTeam(tour.id, regTeam.id), "Couldn't register")}
                />
              </Card>
            )
          ) : null}

          {isOrganiser && tour.status === 'registration' ? (
            <Card style={{ gap: spacing.sm }}>
              <Text variant="strong">Organiser tools</Text>
              <Text muted>{`${checkedIn} of ${active.length} teams checked in.`}</Text>
              <Button
                title="Start tournament"
                icon="play"
                disabled={!canStart(tour, checkedIn, now)}
                loading={busy === 'start'}
                onPress={() =>
                  Alert.alert('Start the bracket?', `${checkedIn} checked-in teams will be seeded. Teams that didn't check in are dropped.`, [
                    { text: 'Not yet', style: 'cancel' },
                    { text: 'Start', onPress: () => void act('start', () => startTournament(tour.id), "Couldn't start") },
                  ])
                }
              />
              {!canStart(tour, checkedIn, now) ? (
                <Text variant="caption">You can start from 30 minutes before the start time, once at least 2 teams have checked in.</Text>
              ) : null}
            </Card>
          ) : null}
        </View>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <View style={s.tabs} accessibilityRole="tablist">
          {(['overview', 'teams', 'bracket'] as Tab[]).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[s.tab, tab === k && { borderBottomColor: t.colors.primary }]}>
              <RNText style={[s.tabText, { color: tab === k ? t.colors.text : t.colors.textMuted }]}>
                {k === 'overview' ? 'Overview' : k === 'teams' ? `Teams ${active.length}` : 'Bracket'}
              </RNText>
            </Pressable>
          ))}
        </View>

        {tab === 'overview' ? (
          <View style={{ gap: spacing.lg }}>
            <Schedule label="Registration closes" value={formatScrimTime(tour.registration_closes_at, now)} />
            <Schedule label="Check-in" value={`${TOURNAMENT_RULES.checkInOpensMin} min before the start`} />
            <Schedule label="Starts" value={formatScrimTime(tour.starts_at, now)} />
            <Schedule label="Format" value={`Single elimination · ${FORMAT_LABELS[tour.match_format]} · final ${FORMAT_LABELS[tour.final_format]}`} />
            <View>
              <Text variant="label" style={s.sectionTitle}>
                Rules
              </Text>
              <Text selectable>{tour.description?.trim() || 'The organiser has not added extra rules.'}</Text>
            </View>
            <Text variant="caption">Riot Games and Valve do not endorse or sponsor this tournament.</Text>
          </View>
        ) : null}

        {tab === 'teams' ? (
          entries.length === 0 ? (
            <Text muted>No teams yet.</Text>
          ) : (
            entries.map((e) => (
              <Pressable
                key={e.team_id}
                style={s.entry}
                onPress={() => router.push({ pathname: '/teams/[id]', params: { id: e.team_id } })}
                accessibilityRole="button"
                accessibilityLabel={`${e.team?.name ?? 'Team'}, ${ENTRY_LABELS[e.status]}${e.checked_in_at ? ', checked in' : ''}`}
              >
                <TeamTag team={e.team} size={40} highlight={e.status === 'champion'} />
                <View style={{ flex: 1 }}>
                  <Text variant="strong" numberOfLines={1}>
                    {e.team?.name ?? 'Team'}
                  </Text>
                  <Text variant="caption">{[e.seed ? `Seed ${e.seed}` : null, ENTRY_LABELS[e.status]].filter(Boolean).join(' · ')}</Text>
                </View>
                {e.checked_in_at && e.status === 'registered' ? <Ionicons name="checkmark-circle" size={20} color={t.colors.accent} accessibilityElementsHidden /> : null}
              </Pressable>
            ))
          )
        ) : null}

        {tab === 'bracket' ? (
          matches.length === 0 ? (
            <Text muted>The bracket appears when the organiser starts the tournament.</Text>
          ) : (
            <Bracket matches={matches} myTeamId={myEntry?.team_id ?? null} featuredMatchId={tour.featured_match_id} onOpen={openMatch} />
          )
        ) : null}

        {(isOrganiser && tour.status === 'registration') || (isModerator && (tour.status === 'registration' || tour.status === 'live')) ? (
          <Button title="Cancel tournament" variant="ghost" icon="close-circle-outline" style={{ marginTop: spacing.xl }} loading={busy === 'cancel'} onPress={confirmCancel} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <RNText style={{ fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, color: t.colors.onPanel, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</RNText>
      <RNText style={{ fontFamily: t.fonts.heading, fontSize: fontSize.md, color: t.colors.onPanel }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </RNText>
    </View>
  );
}

function Schedule({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.schedule}>
      <Text variant="label" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="strong" style={{ flex: 2, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    hero: { gap: spacing.md },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kicker: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 },
    title: { fontFamily: t.fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: t.shape.headingLetterSpacing, textTransform: t.shape.headingUppercase ? 'uppercase' : 'none' },
    heroStats: { flexDirection: 'row', gap: spacing.md },
    prize: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    champion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
    actions: { gap: spacing.md, marginTop: spacing.lg },
    nextMatch: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tabs: { flexDirection: 'row', marginTop: spacing.xl, marginBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.border },
    tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabText: { fontFamily: t.fonts.heading, fontSize: fontSize.md, letterSpacing: 1, textTransform: 'uppercase' },
    sectionTitle: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
    entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.border },
    schedule: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  }),
);
