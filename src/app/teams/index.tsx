import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { regionLabel } from '../../features/lfg/format';
import { fetchMyInvites, fetchMyTeams, respondTeamInvite, useLoader } from '../../features/scrims/api';
import { TeamTag } from '../../features/scrims/components';
import { ROLE_LABELS } from '../../features/scrims/logic';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

export default function MyTeamsScreen() {
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const { byId } = useGames();
  const [busy, setBusy] = useState<string | null>(null);
  const data = useLoader(
    useCallback(async () => {
      if (!myId) return { teams: [], invites: [] };
      const [teams, invites] = await Promise.all([fetchMyTeams(myId), fetchMyInvites(myId)]);
      return { teams, invites };
    }, [myId]),
    `teams-${myId}`,
  );

  const respond = async (inviteId: string, accept: boolean, teamId: string) => {
    setBusy(inviteId);
    try {
      await respondTeamInvite(inviteId, accept);
      await data.reload();
      if (accept) router.push({ pathname: '/teams/[id]', params: { id: teamId } });
    } catch (e) {
      Alert.alert("Couldn't answer the invite", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (data.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'My teams' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (data.error && !data.data) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'My teams' }} />
        <ErrorState message={data.error} onRetry={() => void data.reload()} />
      </Screen>
    );
  }
  const teams = data.data?.teams ?? [];
  const invites = data.data?.invites ?? [];

  return (
    <Screen padded={false} edges={[]}>
      <Stack.Screen options={{ title: 'My teams' }} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={() => void data.refresh()} tintColor={t.colors.primary} />}>
        {invites.length > 0 ? (
          <View style={s.section}>
            <Text variant="label" style={s.title} accessibilityRole="header">
              Invites
            </Text>
            {invites.map((inv) => (
              <Card key={inv.id} style={s.card}>
                <View style={s.row}>
                  <TeamTag team={inv.team} />
                  <View style={{ flex: 1 }}>
                    <Text variant="strong">{inv.team ? `${inv.team.name} [${inv.team.tag}]` : 'A team'}</Text>
                    <Text variant="caption">
                      {[byId(inv.team?.game_id ?? null)?.name, inv.team ? regionLabel(inv.team.region) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={s.btnRow}>
                  <Button title="Join" size="sm" style={{ flex: 1 }} loading={busy === inv.id} onPress={() => void respond(inv.id, true, inv.team_id)} />
                  <Button title="Decline" size="sm" variant="secondary" style={{ flex: 1 }} disabled={busy === inv.id} onPress={() => void respond(inv.id, false, inv.team_id)} />
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        <View style={s.section}>
          <Text variant="label" style={s.title} accessibilityRole="header">
            Your teams
          </Text>
          {teams.length === 0 ? (
            <View style={{ minHeight: 220 }}>
              <EmptyState icon="shield-half-outline" title="No team yet" message="Create a team for VALORANT or CS2 and invite your friends. You can be on one team per game." />
            </View>
          ) : (
            teams.map((m) => (
              <Card
                key={m.team.id}
                style={s.card}
                onPress={() => router.push({ pathname: '/teams/[id]', params: { id: m.team.id } })}
                accessibilityLabel={`${m.team.name}, ${ROLE_LABELS[m.role]}`}
              >
                <View style={s.row}>
                  <TeamTag team={m.team} highlight={m.role === 'captain'} />
                  <View style={{ flex: 1 }}>
                    <Text variant="strong">{`${m.team.name} [${m.team.tag}]`}</Text>
                    <Text variant="caption">{[byId(m.team.game_id)?.name, regionLabel(m.team.region), ROLE_LABELS[m.role]].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        <Button title="Create a team" icon="add" onPress={() => router.push('/teams/new')} />
        <Button title="Scrim board" variant="ghost" icon="flag-outline" style={{ marginTop: spacing.sm }} onPress={() => router.push('/scrims')} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    section: { marginBottom: spacing.xl },
    title: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
    card: { marginBottom: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  }),
);
