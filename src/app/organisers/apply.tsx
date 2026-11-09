import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Screen, Text, TextField } from '../../components/ui';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { applyToOrganise } from '../../features/tournaments/api';
import { applicationProblem, TOURNAMENT_RULES } from '../../features/tournaments/logic';
import { makeStyles, spacing, useTheme } from '../../theme';

const RULES = [
  'Tournaments are free to enter. Never collect entry fees or money through Vinq or your own links.',
  'Follow the Riot Games and Valve community tournament rules. Fill in Riot’s visibility form for each VALORANT event.',
  'No Riot or Valve logos, and nothing that looks like an official event.',
  'No gambling, betting, alcohol, tobacco or crypto sponsors.',
  'Stream every tournament on the channel you list, and run it fairly: settle disputes honestly and on time.',
  'Moderators can remove a tournament or your organiser badge if these rules are broken.',
];

export default function ApplyToOrganiseScreen() {
  const t = useTheme();
  const s = useStyles();
  const { banned } = useMyStatus();
  const [orgName, setOrgName] = useState('');
  const [discord, setDiscord] = useState('');
  const [about, setAbout] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = applicationProblem(orgName, about, accept);

  const submit = async () => {
    if (problem) {
      Alert.alert('Almost there', problem);
      return;
    }
    setBusy(true);
    try {
      await applyToOrganise(orgName, discord, about);
      Alert.alert('Application sent', 'A moderator will review it. You will get a notification.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert("Couldn't send the application", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={[]}>
      <Stack.Screen options={{ title: 'Apply to host' }} />
      <Text variant="heading" style={{ marginBottom: spacing.xs }}>
        Become a verified organiser
      </Text>
      <Text muted style={{ marginBottom: spacing.xl }}>
        Verified organisers host free, streamed tournaments for VALORANT and CS2 on Vinq and get a ✓ badge. Your account needs to be at least 30 days old.
      </Text>

      <TextField label="Organiser name" value={orgName} onChangeText={setOrgName} maxLength={TOURNAMENT_RULES.orgNameMax} placeholder="Your name, club, café or community" />
      <TextField label="Discord (optional)" value={discord} onChangeText={setDiscord} maxLength={60} autoCapitalize="none" placeholder="Server invite or username" />
      <TextField
        label="About you"
        value={about}
        onChangeText={setAbout}
        maxLength={TOURNAMENT_RULES.aboutMax}
        multiline
        placeholder="Who you are, events you've run, where you'll stream…"
        hint={`${about.length}/${TOURNAMENT_RULES.aboutMax}`}
      />

      <Card style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
        <Text variant="strong">Organiser rules</Text>
        {RULES.map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Text style={{ color: t.colors.primary }}>•</Text>
            <Text style={{ flex: 1 }}>{r}</Text>
          </View>
        ))}
      </Card>
      <Pressable
        onPress={() => setAccept((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accept }}
        style={s.accept}
      >
        <Ionicons name={accept ? 'checkbox' : 'square-outline'} size={24} color={accept ? t.colors.primary : t.colors.textMuted} />
        <Text style={{ flex: 1 }}>I agree to the organiser rules</Text>
      </Pressable>

      <Button title="Send application" icon="send" onPress={() => void submit()} loading={busy} disabled={!!problem || banned} />
      {banned ? (
        <Text muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          {"Your account is paused, so you can't apply right now."}
        </Text>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    accept: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, marginBottom: spacing.lg },
  }),
);
