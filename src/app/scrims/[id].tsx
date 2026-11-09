import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, LoadingState, Screen, Text, TextField } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { regionLabel } from '../../features/lfg/format';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import {
  cancelScrim,
  checkInScrim,
  claimScrimNoShow,
  fetchMyTeams,
  fetchScrim,
  fetchScrimLobby,
  fetchScrimReports,
  fetchScrimRequests,
  fetchTeamStats,
  reportScrimResult,
  requestScrim,
  resolveScrimDispute,
  respondScrimRequest,
  setScrimLobby,
  useLoader,
  withdrawScrimRequest,
} from '../../features/scrims/api';
import { StatusPill, TeamTag, teamLabel } from '../../features/scrims/components';
import {
  canClaimNoShow,
  checkInWindow,
  displayStatus,
  FORMAT_LABELS,
  formatScrimTime,
  hasStarted,
  isLateCancel,
  reliabilityLabel,
  scoreOptions,
  SCRIM_RULES,
  sides,
  startsIn,
} from '../../features/scrims/logic';
import type { Scrim, Team } from '../../features/scrims/types';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.section}>
      <Text variant="label" accessibilityRole="header" style={s.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Runs an action with a busy flag and a friendly alert on failure. */
function useAction(after: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, failTitle = "Couldn't do that") => {
      setBusy(key);
      try {
        await fn();
        after();
      } catch (e) {
        Alert.alert(failTitle, (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [after],
  );
  return { busy, run };
}

function ScoreChips({ format, value, onChange, host, opp }: { format: Scrim['format']; value: string | null; onChange: (v: string) => void; host: Team | null; opp: Team | null }) {
  return (
    <ChipRow>
      {scoreOptions(format).map(([h, o]) => {
        const key = `${h}-${o}`;
        return <Chip key={key} label={`${host?.tag ?? 'Host'} ${h} – ${o} ${opp?.tag ?? 'Opp'}`} selected={value === key} onPress={() => onChange(key)} />;
      })}
    </ChipRow>
  );
}

export default function ScrimRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const now = useNow(15_000);
  const { byId } = useGames();
  const { isModerator } = useMyStatus();

  const room = useLoader(
    useCallback(async () => {
      const scrim = await fetchScrim(String(id));
      if (!scrim) return null;
      const [myTeams, requests, lobby, reports, hostStats, oppStats] = await Promise.all([
        myId ? fetchMyTeams(myId) : Promise.resolve([]),
        fetchScrimRequests(scrim.id).catch(() => []),
        fetchScrimLobby(scrim.id).catch(() => null),
        fetchScrimReports(scrim.id).catch(() => []),
        scrim.host_team_id ? fetchTeamStats(scrim.host_team_id).catch(() => null) : Promise.resolve(null),
        scrim.opponent_team_id ? fetchTeamStats(scrim.opponent_team_id).catch(() => null) : Promise.resolve(null),
      ]);
      return { scrim, myTeams, requests, lobby, reports, hostStats, oppStats };
    }, [id, myId]),
    `scrim-${id}-${myId}`,
  );
  const { busy, run } = useAction(useCallback(() => void room.reload(), [room]));

  const [requestTeamId, setRequestTeamId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [lobbyDraft, setLobbyDraft] = useState<string | null>(null);
  const [score, setScore] = useState<string | null>(null);

  const d = room.data;
  const scrim = d?.scrim ?? null;
  const game = byId(scrim?.game_id ?? null);

  const derived = useMemo(() => {
    if (!d || !d.scrim) return null;
    const sc = d.scrim;
    const membership = d.myTeams.find((m) => m.team.id === sc.host_team_id || m.team.id === sc.opponent_team_id) ?? null;
    const myTeamId = membership?.team.id ?? null;
    const isHostCaptain = membership?.team.id === sc.host_team_id && membership.role === 'captain';
    const isCaptain = membership?.role === 'captain';
    const eligible = d.myTeams.filter((m) => m.role === 'captain' && m.team.game_id === sc.game_id && m.team.id !== sc.host_team_id).map((m) => m.team);
    const myRequests = d.requests.filter((r) => eligible.some((e) => e.id === r.team_id));
    const myReport = myTeamId ? d.reports.find((r) => r.team_id === myTeamId) ?? null : null;
    const theirReport = myTeamId ? d.reports.find((r) => r.team_id !== myTeamId) ?? null : null;
    return { membership, myTeamId, isHostCaptain, isCaptain, eligible, myRequests, myReport, theirReport };
  }, [d]);

  if (room.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Scrim' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (room.error && !d) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Scrim' }} />
        <ErrorState message={room.error} onRetry={() => void room.reload()} />
      </Screen>
    );
  }
  if (!scrim || !derived || !d) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Scrim' }} />
        <EmptyState icon="flag-outline" title="Scrim not found" message="It may have been removed." />
      </Screen>
    );
  }

  const status = displayStatus(scrim, now);
  const { membership, myTeamId, isHostCaptain, isCaptain, eligible, myRequests, myReport, theirReport } = derived;
  const inScrim = !!membership;
  const side = sides(scrim, myTeamId);
  const window = checkInWindow(scrim.scheduled_at, now);
  const ranks = scrim.rank_min || scrim.rank_max ? `${scrim.rank_min ?? 'Any'} – ${scrim.rank_max ?? 'Any'}` : 'Any rank';
  const pendingRequests = d.requests.filter((r) => r.status === 'pending');
  const pickedRequestTeam = eligible.find((e) => e.id === (requestTeamId ?? eligible[0]?.id)) ?? null;
  const myPending = myRequests.find((r) => r.status === 'pending');

  const confirmCancel = () => {
    const late = isLateCancel(scrim, now);
    Alert.alert(
      'Cancel this scrim?',
      late
        ? `It starts in under ${SCRIM_RULES.lateCancelHours} hours, so this counts as a late cancel and lowers your team's reliability.`
        : scrim.status === 'booked'
          ? 'The other team will be told.'
          : 'Pending requests will be closed.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel scrim', style: 'destructive', onPress: () => void run('cancel', () => cancelScrim(scrim.id)) },
      ],
    );
  };

  const submitScore = (fn: (h: number, o: number) => Promise<unknown>, key: string) => {
    if (!score) return;
    const [h, o] = score.split('-').map(Number);
    void run(key, () => fn(h, o), "Couldn't save the result");
  };

  return (
    <Screen padded={false} edges={[]}>
      <Stack.Screen options={{ title: `${scrim.host?.tag ?? 'Scrim'} vs ${scrim.opponent?.tag ?? '?'}` }} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={room.refreshing} onRefresh={() => void room.refresh()} tintColor={t.colors.primary} />}>
        {/* ── Match header ───────────────────────────────────────────── */}
        <Card tone="panel" style={s.hero}>
          <View style={s.heroTop}>
            <Text style={[s.heroMeta, { color: t.colors.onPanel }]}>{game?.name ?? scrim.game_id}</Text>
            <StatusPill status={status} />
          </View>
          <View style={s.vsRow}>
            <TeamColumn team={scrim.host} stats={reliabilityLabel(d.hostStats?.reliability)} onPress={scrim.host ? () => router.push({ pathname: '/teams/[id]', params: { id: String(scrim.host_team_id) } }) : undefined} />
            <Text style={[s.vs, { color: t.colors.onPanel }]}>
              {scrim.host_score !== null && scrim.opp_score !== null ? `${scrim.host_score}–${scrim.opp_score}` : 'VS'}
            </Text>
            <TeamColumn
              team={scrim.opponent}
              stats={scrim.opponent ? reliabilityLabel(d.oppStats?.reliability) : 'Waiting for a team'}
              onPress={scrim.opponent_team_id ? () => router.push({ pathname: '/teams/[id]', params: { id: String(scrim.opponent_team_id) } }) : undefined}
            />
          </View>
          <Text style={[s.heroMeta, { color: t.colors.onPanel, textAlign: 'center' }]}>
            {formatScrimTime(scrim.scheduled_at, now)} · {startsIn(scrim.scheduled_at, now)}
          </Text>
          <Text style={[s.heroSub, { color: t.colors.onPanel }]}>{[FORMAT_LABELS[scrim.format], regionLabel(scrim.region), ranks].join(' · ')}</Text>
          {scrim.notes ? <Text style={[s.heroSub, { color: t.colors.onPanel }]}>“{scrim.notes}”</Text> : null}
        </Card>

        {/* ── Open: host sees requests ───────────────────────────────── */}
        {scrim.status === 'open' && isHostCaptain ? (
          <Section title={`Requests (${pendingRequests.length})`}>
            {status === 'expired' ? <Text muted>{"This scrim's start time has passed. Post a new one."}</Text> : null}
            {pendingRequests.length === 0 && status !== 'expired' ? <Text muted>No requests yet. Teams will appear here when they ask to play.</Text> : null}
            {pendingRequests.map((r) => (
              <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                <View style={s.reqRow}>
                  <TeamTag team={r.team} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text variant="strong">{teamLabel(r.team)}</Text>
                    <Text variant="caption">{r.team ? regionLabel(r.team.region) : ''}</Text>
                  </View>
                  <Button title="Team" size="sm" variant="ghost" onPress={() => router.push({ pathname: '/teams/[id]', params: { id: r.team_id } })} />
                </View>
                {r.message ? <Text style={{ marginTop: spacing.sm }}>“{r.message}”</Text> : null}
                <View style={s.btnRow}>
                  <Button
                    title="Accept"
                    size="sm"
                    style={{ flex: 1 }}
                    loading={busy === `acc-${r.id}`}
                    disabled={status === 'expired'}
                    onPress={() => void run(`acc-${r.id}`, () => respondScrimRequest(r.id, true))}
                  />
                  <Button title="Decline" size="sm" variant="secondary" style={{ flex: 1 }} loading={busy === `dec-${r.id}`} onPress={() => void run(`dec-${r.id}`, () => respondScrimRequest(r.id, false))} />
                </View>
              </Card>
            ))}
          </Section>
        ) : null}

        {/* ── Open: other captains can request ───────────────────────── */}
        {scrim.status === 'open' && status !== 'expired' && !inScrim ? (
          <Section title="Play this scrim">
            {myPending ? (
              <>
                <Text>
                  Request sent for <Text variant="strong">{teamLabel(eligible.find((e) => e.id === myPending.team_id) ?? null)}</Text>. The host captain will accept or decline.
                </Text>
                <Button title="Withdraw request" variant="secondary" style={{ marginTop: spacing.md }} loading={busy === 'withdraw'} onPress={() => void run('withdraw', () => withdrawScrimRequest(myPending.id))} />
              </>
            ) : eligible.length === 0 ? (
              <>
                <Text muted>Only a {game?.name ?? 'this game'} team captain can request this scrim.</Text>
                <Button title="My teams" variant="secondary" style={{ marginTop: spacing.md }} onPress={() => router.push('/teams')} />
              </>
            ) : (
              <>
                {eligible.length > 1 ? (
                  <ChipRow>
                    {eligible.map((e) => (
                      <Chip key={e.id} label={`[${e.tag}] ${e.name}`} selected={e.id === pickedRequestTeam?.id} onPress={() => setRequestTeamId(e.id)} />
                    ))}
                  </ChipRow>
                ) : null}
                <TextField label="Message (optional)" value={message} onChangeText={setMessage} maxLength={SCRIM_RULES.messageMax} placeholder="GLHF, we can host the lobby" />
                <Button
                  title={`Request as ${pickedRequestTeam?.tag ?? 'team'}`}
                  icon="flag"
                  loading={busy === 'request'}
                  onPress={() => pickedRequestTeam && void run('request', () => requestScrim(scrim.id, pickedRequestTeam.id, message), "Couldn't send the request")}
                />
              </>
            )}
          </Section>
        ) : null}

        {/* ── Booked: check-in, lobby, chat, result ──────────────────── */}
        {scrim.status === 'booked' && inScrim && side ? (
          <>
            <Section title="Check-in">
              <View style={s.checkRow}>
                <CheckState label="Your team" done={!!side.mine} />
                <CheckState label="Opponent" done={!!side.theirs} />
              </View>
              {window === 'early' ? (
                <Text muted style={{ marginTop: spacing.sm }}>
                  Check-in opens {SCRIM_RULES.checkInOpensMin} minutes before the start.
                </Text>
              ) : null}
              {window === 'open' && !side.mine ? (
                <Button title="Check in" icon="checkmark-circle" style={{ marginTop: spacing.md }} loading={busy === 'checkin'} onPress={() => void run('checkin', () => checkInScrim(scrim.id))} />
              ) : null}
              {canClaimNoShow(scrim, myTeamId, now) && isCaptain ? (
                <Button
                  title="Report no-show"
                  variant="danger"
                  style={{ marginTop: spacing.md }}
                  loading={busy === 'noshow'}
                  onPress={() =>
                    Alert.alert('Report a no-show?', "The other team didn't check in. This closes the scrim and counts against them.", [
                      { text: 'Not yet', style: 'cancel' },
                      { text: 'Report', style: 'destructive', onPress: () => void run('noshow', () => claimScrimNoShow(scrim.id)) },
                    ])
                  }
                />
              ) : null}
            </Section>

            <Section title="Lobby">
              {isCaptain && lobbyDraft !== null ? (
                <>
                  <TextField value={lobbyDraft} onChangeText={setLobbyDraft} maxLength={SCRIM_RULES.lobbyMax} multiline placeholder="Party code, server IP and password, who creates the lobby…" />
                  <View style={s.btnRow}>
                    <Button
                      title="Save"
                      size="sm"
                      style={{ flex: 1 }}
                      loading={busy === 'lobby'}
                      onPress={() =>
                        void run('lobby', async () => {
                          await setScrimLobby(scrim.id, lobbyDraft);
                          setLobbyDraft(null);
                        })
                      }
                    />
                    <Button title="Cancel" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setLobbyDraft(null)} />
                  </View>
                </>
              ) : (
                <>
                  <Text selectable muted={!d.lobby?.info}>
                    {d.lobby?.info || 'No lobby details yet. A captain can add the party code or server here.'}
                  </Text>
                  {isCaptain ? <Button title={d.lobby?.info ? 'Edit lobby details' : 'Add lobby details'} size="sm" variant="secondary" style={{ marginTop: spacing.md }} onPress={() => setLobbyDraft(d.lobby?.info ?? '')} /> : null}
                </>
              )}
              {scrim.conversation_id ? (
                <Button
                  title="Open scrim chat"
                  icon="chatbubbles"
                  variant="secondary"
                  style={{ marginTop: spacing.md }}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(scrim.conversation_id) } })}
                />
              ) : null}
            </Section>

            {hasStarted(scrim, now) ? (
              <Section title="Result">
                {myReport ? (
                  <Text>
                    You reported <Text variant="strong">{`${scrim.host?.tag ?? 'Host'} ${myReport.host_score} – ${myReport.opp_score} ${scrim.opponent?.tag ?? 'Opp'}`}</Text>.
                    {theirReport ? '' : ' Waiting for the other captain.'}
                  </Text>
                ) : isCaptain ? (
                  <>
                    <Text muted style={{ marginBottom: spacing.sm }}>
                      Both captains report the final series score. If they match, the scrim is completed.
                    </Text>
                    <ScoreChips format={scrim.format} value={score} onChange={setScore} host={scrim.host} opp={scrim.opponent} />
                    <Button title="Submit result" icon="trophy" style={{ marginTop: spacing.md }} disabled={!score} loading={busy === 'report'} onPress={() => submitScore((h, o) => reportScrimResult(scrim.id, h, o), 'report')} />
                  </>
                ) : (
                  <Text muted>Your captain reports the result.</Text>
                )}
              </Section>
            ) : null}
          </>
        ) : null}

        {/* ── Finished states ────────────────────────────────────────── */}
        {scrim.status === 'disputed' ? (
          <Section title="Disputed">
            <Text>The captains reported different scores. A moderator will check and set the result.</Text>
            {d.reports.map((r) => (
              <Text key={r.team_id} variant="caption" style={{ marginTop: spacing.xs }}>
                {r.team_id === scrim.host_team_id ? scrim.host?.tag : scrim.opponent?.tag} reported {r.host_score} – {r.opp_score}
              </Text>
            ))}
            {isCaptain && inScrim && !isModerator ? (
              <View style={{ marginTop: spacing.md }}>
                <Text muted style={{ marginBottom: spacing.sm }}>
                  Made a mistake? Correct your report. If it now matches the other captain, the scrim is completed.
                </Text>
                <ScoreChips format={scrim.format} value={score} onChange={setScore} host={scrim.host} opp={scrim.opponent} />
                <Button title="Correct my report" variant="secondary" style={{ marginTop: spacing.md }} disabled={!score} loading={busy === 'report'} onPress={() => submitScore((h, o) => reportScrimResult(scrim.id, h, o), 'report')} />
              </View>
            ) : null}
            {isModerator ? (
              <View style={{ marginTop: spacing.md }}>
                <ScoreChips format={scrim.format} value={score} onChange={setScore} host={scrim.host} opp={scrim.opponent} />
                <Button title="Set final result" variant="secondary" style={{ marginTop: spacing.md }} disabled={!score} loading={busy === 'resolve'} onPress={() => submitScore((h, o) => resolveScrimDispute(scrim.id, h, o), 'resolve')} />
              </View>
            ) : null}
          </Section>
        ) : null}
        {scrim.status === 'no_show' ? (
          <Section title="No-show">
            <Text>{`${scrim.no_show_team_id === scrim.host_team_id ? teamLabel(scrim.host) : teamLabel(scrim.opponent)} didn't check in.`}</Text>
          </Section>
        ) : null}
        {scrim.status === 'cancelled' ? (
          <Section title="Cancelled">
            <Text>
              {scrim.cancelled_by_team_id === scrim.host_team_id ? teamLabel(scrim.host) : teamLabel(scrim.opponent)} cancelled this scrim
              {scrim.late_cancel ? ' late.' : '.'}
            </Text>
          </Section>
        ) : null}

        {/* Cancel: host captain while open/booked, opponent captain while booked */}
        {/* The server refuses cancels after the start (report the result or a no-show instead). */}
        {isCaptain && (scrim.status === 'open' || scrim.status === 'booked') && !hasStarted(scrim, now) && (scrim.status === 'booked' || isHostCaptain) ? (
          <Button title="Cancel scrim" variant="ghost" icon="close-circle-outline" style={{ marginTop: spacing.lg }} loading={busy === 'cancel'} onPress={confirmCancel} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function TeamColumn({ team, stats, onPress }: { team: Team | null; stats: string; onPress?: () => void }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.teamCol}>
      <TeamTag team={team} size={64} highlight={!!team} />
      <Text numberOfLines={2} style={[s.teamName, { color: t.colors.onPanel }]} onPress={onPress} accessibilityRole={onPress ? 'link' : undefined}>
        {team?.name ?? 'Open slot'}
      </Text>
      <Text style={[s.heroSub, { color: t.colors.onPanel }]}>{stats}</Text>
    </View>
  );
}

function CheckState({ label, done }: { label: string; done: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} accessible accessibilityLabel={`${label}: ${done ? 'checked in' : 'not checked in'}`}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? t.colors.accent : t.colors.textFaint} />
      <Text>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    hero: { gap: spacing.md },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroMeta: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.sm },
    heroSub: { fontFamily: t.fonts.body, fontSize: fontSize.xs, opacity: 0.85, textAlign: 'center' },
    vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    vs: { fontFamily: t.fonts.display, fontSize: 30 },
    teamCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
    teamName: { fontFamily: t.fonts.heading, fontSize: fontSize.lg, textAlign: 'center', letterSpacing: t.shape.headingLetterSpacing },
    section: { marginTop: spacing.xl },
    sectionTitle: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
    reqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    checkRow: { flexDirection: 'row', gap: spacing.md },
  }),
);
