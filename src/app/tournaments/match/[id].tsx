import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, LoadingState, Screen, Text, TextField } from '../../../components/ui';
import { useMyStatus } from '../../../features/moderation/useMyStatus';
import { fetchMyTeams } from '../../../features/scrims/api';
import { TeamTag } from '../../../features/scrims/components';
import { FORMAT_LABELS, scoreOptions, streamPlatform } from '../../../features/scrims/logic';
import {
  fetchMatch,
  fetchMatchLobby,
  fetchMatchReports,
  fetchTournament,
  reportMatchResult,
  resolveMatch,
  setFeaturedMatch,
  setMatchLobby,
  useLoader,
  watchTournament,
} from '../../../features/tournaments/api';
import { roundCount, roundName, sideOf, TOURNAMENT_RULES } from '../../../features/tournaments/logic';
import type { Team } from '../../../features/scrims/types';
import type { TournamentMatch } from '../../../features/tournaments/types';
import { useUserId } from '../../../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../../../theme';

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

function ScorePicker({ match, value, onChange }: { match: TournamentMatch; value: string | null; onChange: (v: string) => void }) {
  return (
    <ChipRow>
      {scoreOptions(match.format).map(([a, b]) => {
        const key = `${a}-${b}`;
        return <Chip key={key} label={`${match.team_a?.tag ?? 'A'} ${a} – ${b} ${match.team_b?.tag ?? 'B'}`} selected={value === key} onPress={() => onChange(key)} />;
      })}
    </ChipRow>
  );
}

export default function TournamentMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const { isModerator, banned } = useMyStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [score, setScore] = useState<string | null>(null);
  const [lobbyDraft, setLobbyDraft] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState(false);

  const data = useLoader(
    useCallback(async () => {
      const match = await fetchMatch(String(id));
      if (!match) return null;
      const [tour, reports, lobby, myTeams] = await Promise.all([
        fetchTournament(match.tournament_id),
        fetchMatchReports(match.id),
        fetchMatchLobby(match.id),
        myId ? fetchMyTeams(myId) : Promise.resolve([]),
      ]);
      return { match, tour, reports, lobby, myTeams };
    }, [id, myId]),
    `tmatch-${id}-${myId}`,
  );
  const reload = data.reload;
  const tourId = data.data?.match.tournament_id ?? null;
  useEffect(() => (tourId ? watchTournament(tourId, () => void reload()) : undefined), [tourId, reload]);

  const d = data.data;
  const derived = useMemo(() => {
    if (!d) return null;
    const m = d.match;
    const membership = d.myTeams.find((x) => x.team.id === m.team_a_id || x.team.id === m.team_b_id) ?? null;
    const myTeamId = membership?.team.id ?? null;
    const side = sideOf(m, myTeamId);
    const isCaptain = membership?.role === 'captain';
    const myReport = myTeamId ? (d.reports.find((r) => r.team_id === myTeamId) ?? null) : null;
    const theirReport = myTeamId ? (d.reports.find((r) => r.team_id !== myTeamId) ?? null) : null;
    return { membership, myTeamId, side, isCaptain, myReport, theirReport };
  }, [d]);

  const act = async (key: string, fn: () => Promise<unknown>, failTitle = "Couldn't do that") => {
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
        <Stack.Screen options={{ title: 'Match' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (data.error && !d) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Match' }} />
        <ErrorState message={data.error} onRetry={() => void data.reload()} />
      </Screen>
    );
  }
  if (!d || !derived || !d.tour) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Match' }} />
        <EmptyState icon="trophy-outline" title="Match not found" message="It may have been removed." />
      </Screen>
    );
  }

  const { match, tour, reports, lobby } = d;
  const { side, isCaptain, myReport, theirReport } = derived;
  const isOrganiser = !!myId && tour.organiser_id === myId;
  const canJudge = (isOrganiser || isModerator) && !side;
  const open = match.status === 'ready' || match.status === 'disputed';
  const canEditLobby = open && (isCaptain || isOrganiser) && !banned;
  const featured = tour.featured_match_id === match.id;
  const rounds = roundCount(tour.max_teams);

  const submit = (fn: (a: number, b: number) => Promise<unknown>, key: string) => {
    if (!score) return;
    const [a, b] = score.split('-').map(Number);
    void act(
      key,
      async () => {
        await fn(a, b);
        setEditingReport(false);
        setScore(null);
      },
      "Couldn't save the result",
    );
  };

  return (
    <Screen padded={false} edges={[]}>
      <Stack.Screen options={{ title: `${match.team_a?.tag ?? 'TBD'} vs ${match.team_b?.tag ?? 'TBD'}` }} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={() => void data.refresh()} tintColor={t.colors.primary} />}>
        <Card tone="panel" style={s.hero}>
          <RNText style={[s.kicker, { color: t.colors.onPanel }]}>{`${tour.name} · ${roundName(match.round, rounds)} · ${FORMAT_LABELS[match.format]}`}</RNText>
          <View style={s.vsRow}>
            <TeamCol team={match.team_a ?? null} won={!!match.winner_team_id && match.winner_team_id === match.team_a_id} />
            <RNText style={[s.vs, { color: t.colors.onPanel }]}>{match.status === 'completed' ? `${match.a_score}–${match.b_score}` : 'VS'}</RNText>
            <TeamCol team={match.team_b ?? null} won={!!match.winner_team_id && match.winner_team_id === match.team_b_id} />
          </View>
          {featured ? (
            <Button
              title={`On stream · ${streamPlatform(tour.stream_url)}`}
              icon="radio"
              size="sm"
              onPress={() => void Linking.openURL(tour.stream_url).catch(() => undefined)}
            />
          ) : null}
          <Button title="Tournament & bracket" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: tour.id } })} />
        </Card>

        {match.status === 'pending' ? (
          <Section title="Waiting">
            <Text muted>This match is waiting for the winners of the earlier matches.</Text>
          </Section>
        ) : null}

        {open && side ? (
          <>
            <Section title="Lobby">
              {lobbyDraft !== null ? (
                <>
                  <TextField value={lobbyDraft} onChangeText={setLobbyDraft} maxLength={TOURNAMENT_RULES.lobbyMax} multiline placeholder="Party code or server, who creates the lobby, observer slot for the stream…" />
                  <View style={s.btnRow}>
                    <Button
                      title="Save"
                      size="sm"
                      style={{ flex: 1 }}
                      loading={busy === 'lobby'}
                      onPress={() =>
                        void act('lobby', async () => {
                          await setMatchLobby(match.id, lobbyDraft);
                          setLobbyDraft(null);
                        })
                      }
                    />
                    <Button title="Cancel" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setLobbyDraft(null)} />
                  </View>
                </>
              ) : (
                <>
                  <Text selectable muted={!lobby}>
                    {lobby || 'No lobby details yet. A captain or the organiser adds the party code or server here.'}
                  </Text>
                  {canEditLobby ? <Button title={lobby ? 'Edit lobby details' : 'Add lobby details'} size="sm" variant="secondary" style={{ marginTop: spacing.md }} onPress={() => setLobbyDraft(lobby ?? '')} /> : null}
                </>
              )}
              {match.conversation_id ? (
                <Button
                  title="Open match chat"
                  icon="chatbubbles"
                  variant="secondary"
                  style={{ marginTop: spacing.md }}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(match.conversation_id) } })}
                />
              ) : null}
            </Section>

            <Section title="Result">
              {match.status === 'disputed' ? (
                <Text style={{ marginBottom: spacing.sm }}>{"The captains reported different scores. The organiser will set the result. You can still correct yours."}</Text>
              ) : null}
              {myReport && !editingReport ? (
                <>
                  <Text>
                    You reported <Text variant="strong">{`${match.team_a?.tag ?? 'A'} ${myReport.a_score} – ${myReport.b_score} ${match.team_b?.tag ?? 'B'}`}</Text>.
                    {theirReport ? '' : ' Waiting for the other captain.'}
                  </Text>
                  {isCaptain ? <Button title="Change my report" size="sm" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => setEditingReport(true)} /> : null}
                </>
              ) : isCaptain ? (
                <>
                  <Text muted style={{ marginBottom: spacing.sm }}>
                    Both captains report the final series score. If they match, the winner moves on automatically.
                  </Text>
                  <ScorePicker match={match} value={score} onChange={setScore} />
                  <Button
                    title={myReport ? 'Save new report' : 'Submit result'}
                    icon="trophy"
                    style={{ marginTop: spacing.md }}
                    disabled={!score}
                    loading={busy === 'report'}
                    onPress={() => submit((a, b) => reportMatchResult(match.id, a, b), 'report')}
                  />
                </>
              ) : (
                <Text muted>Your captain reports the result.</Text>
              )}
            </Section>
          </>
        ) : null}

        {canJudge && open ? (
          <Section title={match.status === 'disputed' ? 'Settle the dispute' : 'Organiser: set result'}>
            {reports.map((r) => (
              <Text key={r.team_id} variant="caption" style={{ marginBottom: spacing.xs }}>
                {`${r.team_id === match.team_a_id ? match.team_a?.tag : match.team_b?.tag} reported ${r.a_score} – ${r.b_score}`}
              </Text>
            ))}
            {reports.length === 0 ? <Text muted style={{ marginBottom: spacing.sm }}>{"No reports yet. Use this for no-shows or if a captain can't report."}</Text> : null}
            <ScorePicker match={match} value={score} onChange={setScore} />
            <Button title="Set final result" variant="secondary" style={{ marginTop: spacing.md }} disabled={!score} loading={busy === 'resolve'} onPress={() => submit((a, b) => resolveMatch(match.id, a, b), 'resolve')} />
          </Section>
        ) : null}

        {isOrganiser && (open || match.status === 'pending') ? (
          <Button
            title={featured ? 'Stop featuring on stream' : 'Feature this match on stream'}
            icon={featured ? 'videocam-off-outline' : 'videocam-outline'}
            variant="secondary"
            style={{ marginTop: spacing.xl }}
            loading={busy === 'feature'}
            onPress={() => void act('feature', () => setFeaturedMatch(tour.id, featured ? null : match.id))}
          />
        ) : null}

        {match.status === 'completed' ? (
          <Section title="Final">
            <Text>
              {`${match.winner_team_id === match.team_a_id ? match.team_a?.name : match.team_b?.name} won ${Math.max(match.a_score ?? 0, match.b_score ?? 0)}–${Math.min(match.a_score ?? 0, match.b_score ?? 0)}.`}
            </Text>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function TeamCol({ team, won }: { team: Team | null; won: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
      <TeamTag team={team} size={60} highlight={won} />
      <RNText numberOfLines={2} style={{ fontFamily: t.fonts.heading, fontSize: fontSize.lg, color: t.colors.onPanel, textAlign: 'center' }}>
        {team?.name ?? 'TBD'}
      </RNText>
      {won ? <RNText style={{ fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, color: t.colors.primary, letterSpacing: 1 }}>WINNER</RNText> : null}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    hero: { gap: spacing.md },
    kicker: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center', opacity: 0.85 },
    vsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    vs: { fontFamily: t.fonts.display, fontSize: 30 },
    section: { marginTop: spacing.xl },
    sectionTitle: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
    btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  }),
);
