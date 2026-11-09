import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, ChipRow, EmptyState, LoadingState, Screen, Text, TextField } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { HorizontalChips } from '../../features/lfg/HorizontalChips';
import { fetchMyTeams, postScrim, useLoader } from '../../features/scrims/api';
import {
  buildScheduledAt,
  defaultSlot,
  dayOptions,
  FORMAT_LABELS,
  FORMATS,
  formatScrimTime,
  scheduleProblem,
  SCRIM_RULES,
} from '../../features/scrims/logic';
import type { ScrimFormat } from '../../features/scrims/types';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing } from '../../theme';

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));
const MINUTES = ['0', '15', '30', '45'].map((m) => ({ value: m, label: `:${m.padStart(2, '0')}` }));


export default function PostScrimScreen() {
  const s = useStyles();
  const myId = useUserId();
  const { byId } = useGames();
  const { banned } = useMyStatus();
  const teams = useLoader(useCallback(() => (myId ? fetchMyTeams(myId) : Promise.resolve([])), [myId]), `teams-${myId}`);
  const captained = useMemo(() => (teams.data ?? []).filter((m) => m.role === 'captain').map((m) => m.team), [teams.data]);

  const [now] = useState(() => Date.now());
  const days = useMemo(() => dayOptions(now), [now]);
  const initial = useMemo(() => {
    const d = defaultSlot(now);
    return { offset: Math.min(d.offset, days.length - 1), hour: d.hour };
  }, [now, days.length]);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [offset, setOffset] = useState(initial.offset);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(0);
  const [format, setFormat] = useState<ScrimFormat>('bo3');
  const [rankMin, setRankMin] = useState<string | null>(null);
  const [rankMax, setRankMax] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const team = captained.find((x) => x.id === (teamId ?? captained[0]?.id)) ?? null;
  const game = byId(team?.game_id ?? null);
  const ranks = (game?.ranks ?? []).map((r) => ({ value: r, label: r }));
  // Day offsets are relative to the date the screen opened (so "Today" keeps meaning that day).
  const scheduledAt = buildScheduledAt(offset, hour, minute, now);
  const timeProblem = scheduleProblem(scheduledAt);
  const rankProblem =
    rankMin && rankMax && game && game.ranks.indexOf(rankMin) > game.ranks.indexOf(rankMax) ? 'The lowest rank must be below the highest rank.' : null;

  const submit = async () => {
    if (!team) return;
    const problem = timeProblem ?? rankProblem;
    if (problem) {
      Alert.alert("Can't post yet", problem);
      return;
    }
    setBusy(true);
    try {
      const id = await postScrim({ teamId: team.id, scheduledAt, format, rankMin, rankMax, notes });
      router.replace({ pathname: '/scrims/[id]', params: { id } });
    } catch (e) {
      Alert.alert("Couldn't post the scrim", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (teams.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Post a scrim' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (captained.length === 0) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Post a scrim' }} />
        <EmptyState
          icon="shield-half-outline"
          title="Only captains can post"
          message="Create a team (you'll be its captain), invite at least 4 players, then post a scrim."
          action={<Button title="Create a team" icon="add" onPress={() => router.replace('/teams/new')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={[]}>
      <Stack.Screen options={{ title: 'Post a scrim' }} />
      <View style={s.section}>
        <Text variant="label" style={s.label}>
          Your team
        </Text>
        <ChipRow>
          {captained.map((x) => (
            <Chip
              key={x.id}
              label={`[${x.tag}] ${x.name} · ${byId(x.game_id)?.name ?? x.game_id}`}
              selected={x.id === team?.id}
              onPress={() => {
                setTeamId(x.id);
                setRankMin(null);
                setRankMax(null);
              }}
            />
          ))}
        </ChipRow>
      </View>

      <View style={s.section}>
        <Text variant="label" style={s.label}>
          When
        </Text>
        <HorizontalChips options={days.map((d) => ({ value: String(d.offset), label: d.label }))} value={String(offset)} onChange={(v) => v !== null && setOffset(Number(v))} />
        <View style={{ height: spacing.sm }} />
        <HorizontalChips options={HOURS} value={String(hour)} onChange={(v) => v !== null && setHour(Number(v))} />
        <View style={{ height: spacing.sm }} />
        <HorizontalChips options={MINUTES} value={String(minute)} onChange={(v) => v !== null && setMinute(Number(v))} />
        <Text variant={timeProblem ? 'body' : 'strong'} style={[s.when, timeProblem ? s.problem : null]}>
          {timeProblem ?? `${formatScrimTime(scheduledAt)} (your time)`}
        </Text>
      </View>

      <View style={s.section}>
        <Text variant="label" style={s.label}>
          Format
        </Text>
        <ChipRow>
          {FORMATS.map((f) => (
            <Chip key={f} label={FORMAT_LABELS[f]} selected={f === format} onPress={() => setFormat(f)} />
          ))}
        </ChipRow>
      </View>

      {ranks.length > 0 ? (
        <View style={s.section}>
          <HorizontalChips label="Lowest rank (optional)" options={ranks} value={rankMin} onChange={setRankMin} allLabel="Any" />
          <View style={{ height: spacing.sm }} />
          <HorizontalChips label="Highest rank (optional)" options={ranks} value={rankMax} onChange={setRankMax} allLabel="Any" />
          {rankProblem ? <Text style={[s.when, s.problem]}>{rankProblem}</Text> : null}
        </View>
      ) : null}

      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        maxLength={SCRIM_RULES.notesMax}
        multiline
        placeholder="Map pool, server, rules…"
        hint={`${notes.length}/${SCRIM_RULES.notesMax} · Region: your team's region`}
      />

      <Button title="Post scrim" icon="flag" onPress={() => void submit()} loading={busy} disabled={!!timeProblem || !!rankProblem || banned} />
      {banned ? <Text muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>{"Your account is paused, so you can't post scrims right now."}</Text> : null}
      <Text variant="caption" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        Your team needs at least {SCRIM_RULES.minRoster} players. Free to play.
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { marginBottom: spacing.xl },
    label: { marginBottom: spacing.sm, fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
    when: { marginTop: spacing.md },
    problem: { color: t.colors.danger },
  }),
);
