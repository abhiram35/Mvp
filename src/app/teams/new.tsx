import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, ChipRow, Screen, Text, TextField } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { REGIONS, regionLabel } from '../../features/lfg/format';
import { HorizontalChips } from '../../features/lfg/HorizontalChips';
import { createTeam } from '../../features/scrims/api';
import { cleanTag, isScrimGame, SCRIM_RULES, teamFormProblem } from '../../features/scrims/logic';
import type { Region } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { makeStyles, spacing } from '../../theme';

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));

export default function CreateTeamScreen() {
  const s = useStyles();
  const { profile } = useAuth();
  const { games } = useGames();
  const scrimGames = useMemo(() => games.filter(isScrimGame), [games]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [region, setRegion] = useState<Region | null>(profile?.region ?? null);
  const [busy, setBusy] = useState(false);
  const game = gameId ?? scrimGames[0]?.id ?? null;
  const problem = teamFormProblem(name, tag) ?? (region ? null : 'Pick a region.');

  const submit = async () => {
    if (!game || !region) return;
    if (problem) {
      Alert.alert('Check your team', problem);
      return;
    }
    setBusy(true);
    try {
      const id = await createTeam(game, name, tag, region);
      router.replace({ pathname: '/teams/[id]', params: { id } });
    } catch (e) {
      Alert.alert("Couldn't create the team", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={[]}>
      <Stack.Screen options={{ title: 'Create a team' }} />
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
      <TextField label="Team name" value={name} onChangeText={setName} maxLength={32} placeholder="Night Owls" autoCapitalize="words" />
      <TextField
        label="Tag"
        value={tag}
        onChangeText={(v) => setTag(cleanTag(v))}
        maxLength={5}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="NOWL"
        hint="2–5 letters or numbers, shown like [NOWL]"
      />
      <View style={s.section}>
        <HorizontalChips label="Region" options={REGION_OPTIONS} value={region} onChange={setRegion} />
      </View>
      <Button title="Create team" icon="shield-half" onPress={() => void submit()} loading={busy} disabled={!!problem || !game} />
      <Text variant="caption" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        {`You'll be the captain. Invite friends from the team page. Scrims need ${SCRIM_RULES.minRoster} players; up to ${SCRIM_RULES.maxRoster} with subs.`}
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { marginBottom: spacing.lg },
    label: { marginBottom: spacing.sm, fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
  }),
);
