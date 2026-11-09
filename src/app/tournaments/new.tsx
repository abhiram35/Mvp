import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, ChipRow, EmptyState, LoadingState, Screen, Text, TextField } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { REGIONS, regionLabel } from '../../features/lfg/format';
import { HorizontalChips } from '../../features/lfg/HorizontalChips';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { buildScheduledAt, cleanStreamUrl, dayOptions, FORMAT_LABELS, formatScrimTime, isScrimGame } from '../../features/scrims/logic';
import type { ScrimFormat } from '../../features/scrims/types';
import { createTournament, fetchOrganiser, useLoader } from '../../features/tournaments/api';
import { CLOSE_OPTIONS, closesAtFor, createProblem, TOURNAMENT_RULES } from '../../features/tournaments/logic';
import type { Region } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing } from '../../theme';

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));
const MINUTES = ['0', '15', '30', '45'].map((m) => ({ value: m, label: `:${m.padStart(2, '0')}` }));
const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));

export default function CreateTournamentScreen() {
  const s = useStyles();
  const myId = useUserId();
  const { banned } = useMyStatus();
  const { games } = useGames();
  const scrimGames = useMemo(() => games.filter(isScrimGame), [games]);
  const org = useLoader(useCallback(() => (myId ? fetchOrganiser(myId) : Promise.resolve(null)), [myId]), `org-${myId}`);

  const [now] = useState(() => Date.now());
  const days = useMemo(() => dayOptions(now), [now]);
  // Default: tomorrow 20:00, so there's time for teams to register.
  const initial = { offset: 1, hour: 20 };

  const [gameId, setGameId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prize, setPrize] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const [maxTeams, setMaxTeams] = useState(8);
  const [matchFormat, setMatchFormat] = useState<ScrimFormat>('bo1');
  const [finalFormat, setFinalFormat] = useState<ScrimFormat>('bo3');
  const [offset, setOffset] = useState(initial.offset);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(0);
  const [closeHours, setCloseHours] = useState(3);
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);

  const game = gameId ?? scrimGames[0]?.id ?? null;
  const startsAt = buildScheduledAt(offset, hour, minute, now);
  const closesAt = closesAtFor(startsAt, closeHours);
  const streamUrl = cleanStreamUrl(stream);
  const problem = createProblem({ name, description, prize, streamUrl, registrationClosesAt: closesAt, startsAt });

  const submit = async () => {
    if (!game) return;
    if (problem || !streamUrl) {
      Alert.alert('Check your tournament', problem ?? 'Add your stream link.');
      return;
    }
    setBusy(true);
    try {
      const id = await createTournament({
        gameId: game,
        name,
        description,
        prize,
        region,
        maxTeams,
        matchFormat,
        finalFormat,
        registrationClosesAt: closesAt,
        startsAt,
        streamUrl,
      });
      router.replace({ pathname: '/tournaments/[id]', params: { id } });
    } catch (e) {
      Alert.alert("Couldn't create the tournament", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (org.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Host a tournament' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (!org.data) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Host a tournament' }} />
        <EmptyState
          icon="ribbon-outline"
          title="Verified organisers only"
          message="Apply to become a verified organiser. A moderator reviews every application."
          action={<Button title="Apply to host" icon="ribbon" onPress={() => router.replace('/organisers/apply')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={[]}>
      <Stack.Screen options={{ title: 'Host a tournament' }} />
      <View style={s.section}>
        <Text variant="label" style={s.label}>
          Game
        </Text>
        <ChipRow>
          {scrimGames.map((g) => (
            <Chip key={g.id} label={g.name} selected={g.id === game} onPress={() => setGameId(g.id)} />
          ))}
        </ChipRow>
      </View>

      <TextField label="Tournament name" value={name} onChangeText={setName} maxLength={TOURNAMENT_RULES.nameMax} placeholder="Friday Night Clash #1" />
      <TextField
        label="Rules and details (optional)"
        value={description}
        onChangeText={setDescription}
        maxLength={TOURNAMENT_RULES.descriptionMax}
        multiline
        placeholder="Map pool, server, how to join lobbies, tie-breaks, contact…"
        hint={`${description.length}/${TOURNAMENT_RULES.descriptionMax}`}
      />
      <TextField
        label="Prize (optional)"
        value={prize}
        onChangeText={setPrize}
        maxLength={TOURNAMENT_RULES.prizeMax}
        placeholder="e.g. Sponsor headsets for the winning team"
        hint="Describe sponsor prizes only. Vinq doesn't handle money."
      />

      <View style={s.section}>
        <HorizontalChips label="Region" options={REGION_OPTIONS} value={region} onChange={setRegion} allLabel="All regions" />
      </View>

      <View style={s.section}>
        <Text variant="label" style={s.label}>
          Teams
        </Text>
        <ChipRow>
          {TOURNAMENT_RULES.maxTeamsOptions.map((n) => (
            <Chip key={n} label={`${n} teams`} selected={n === maxTeams} onPress={() => setMaxTeams(n)} />
          ))}
        </ChipRow>
      </View>

      <View style={s.section}>
        <Text variant="label" style={s.label}>
          Matches
        </Text>
        <ChipRow>
          {(['bo1', 'bo3'] as const).map((f) => (
            <Chip key={f} label={FORMAT_LABELS[f]} selected={f === matchFormat} onPress={() => setMatchFormat(f)} />
          ))}
        </ChipRow>
        <Text variant="label" style={[s.label, { marginTop: spacing.md }]}>
          Final
        </Text>
        <ChipRow>
          {(['bo1', 'bo3', 'bo5'] as const).map((f) => (
            <Chip key={f} label={FORMAT_LABELS[f]} selected={f === finalFormat} onPress={() => setFinalFormat(f)} />
          ))}
        </ChipRow>
      </View>

      <View style={s.section}>
        <Text variant="label" style={s.label}>
          Starts
        </Text>
        <HorizontalChips options={days.map((d) => ({ value: String(d.offset), label: d.label }))} value={String(offset)} onChange={(v) => v !== null && setOffset(Number(v))} />
        <View style={{ height: spacing.sm }} />
        <HorizontalChips options={HOURS} value={String(hour)} onChange={(v) => v !== null && setHour(Number(v))} />
        <View style={{ height: spacing.sm }} />
        <HorizontalChips options={MINUTES} value={String(minute)} onChange={(v) => v !== null && setMinute(Number(v))} />
        <Text variant="label" style={[s.label, { marginTop: spacing.md }]}>
          Registration closes
        </Text>
        <ChipRow>
          {CLOSE_OPTIONS.map((o) => (
            <Chip key={o.hours} label={o.label} selected={o.hours === closeHours} onPress={() => setCloseHours(o.hours)} />
          ))}
        </ChipRow>
        <Text variant="strong" style={{ marginTop: spacing.md }}>
          {`Starts ${formatScrimTime(startsAt, now)} · registration closes ${formatScrimTime(closesAt, now)}`}
        </Text>
      </View>

      <TextField
        label="Stream channel"
        value={stream}
        onChangeText={setStream}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://youtube.com/@yourchannel"
        hint="Required. Every tournament is streamed; teams agree to this when they register."
        error={stream.trim() && !streamUrl ? 'Use a YouTube or Twitch link (https://…)' : null}
      />

      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      <Button title="Create tournament" icon="trophy" onPress={() => void submit()} loading={busy} disabled={!!problem || banned || !game} />
      <Text variant="caption" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        Single elimination · free entry · teams need {TOURNAMENT_RULES.minRoster}+ players
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { marginBottom: spacing.xl },
    label: { marginBottom: spacing.sm, fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
    problem: { color: t.colors.danger, marginBottom: spacing.md },
  }),
);
