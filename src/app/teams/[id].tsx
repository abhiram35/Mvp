import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingState, Screen, Stat, Text } from '../../components/ui';
import { useFriends } from '../../features/friends/hooks';
import { useGames } from '../../features/games/useGames';
import { regionLabel } from '../../features/lfg/format';
import { fetchTeam, fetchTeamInvites, fetchTeamMembers, fetchTeamScrims, fetchTeamStats, inviteToTeam, leaveTeam, removeTeamMember, useLoader } from '../../features/scrims/api';
import { ScrimCard, TeamTag } from '../../features/scrims/components';
import { reliabilityLabel, ROLE_LABELS, SCRIM_RULES } from '../../features/scrims/logic';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const now = useNow(60_000);
  const { byId } = useGames();
  const { friends } = useFriends();
  const [busy, setBusy] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const data = useLoader(
    useCallback(async () => {
      const team = await fetchTeam(String(id));
      if (!team) return null;
      const [members, stats, scrims, invites] = await Promise.all([
        fetchTeamMembers(team.id),
        fetchTeamStats(team.id).catch(() => null),
        fetchTeamScrims(team.id).catch(() => []),
        fetchTeamInvites(team.id).catch(() => []),
      ]);
      return { team, members, stats, scrims, invites };
    }, [id]),
    `team-${id}`,
  );

  const d = data.data;
  const me = d?.members.find((m) => m.profile_id === myId) ?? null;
  const isCaptain = me?.role === 'captain';
  const memberIds = useMemo(() => new Set((d?.members ?? []).map((m) => m.profile_id)), [d?.members]);
  const invitedIds = useMemo(() => new Set((d?.invites ?? []).map((i) => i.profile_id)), [d?.invites]);
  const invitable = friends.filter((f) => !memberIds.has(f.profile.id));

  const act = async (key: string, fn: () => Promise<unknown>, failTitle: string, after?: () => void) => {
    setBusy(key);
    try {
      await fn();
      if (after) after();
      else await data.reload();
    } catch (e) {
      Alert.alert(failTitle, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (data.loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Team' }} />
        <LoadingState />
      </Screen>
    );
  }
  if (data.error && !d) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Team' }} />
        <ErrorState message={data.error} onRetry={() => void data.reload()} />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Team' }} />
        <EmptyState icon="shield-half-outline" title="Team not found" message="It may have been disbanded." />
      </Screen>
    );
  }

  const { team, members, stats } = d;
  const rosterFull = members.length >= SCRIM_RULES.maxRoster;
  const canScrim = members.length >= SCRIM_RULES.minRoster;

  const confirmLeave = () =>
    Alert.alert(
      isCaptain && members.length > 1 ? 'Leave and hand over captain?' : 'Leave team?',
      members.length === 1 ? "You're the last member, so the team will be deleted and its open scrims cancelled." : isCaptain ? 'The longest-serving member becomes captain.' : undefined,
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void act('leave', () => leaveTeam(team.id), "Couldn't leave the team", () => router.back()) },
      ],
    );

  return (
    <Screen padded={false} edges={[]}>
      <Stack.Screen options={{ title: `[${team.tag}]` }} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={() => void data.refresh()} tintColor={t.colors.primary} />}>
        <View style={s.head}>
          <TeamTag team={team} size={72} highlight />
          <View style={{ flex: 1 }}>
            <Text variant="heading" accessibilityRole="header">
              {team.name}
            </Text>
            <Text variant="label">{[byId(team.game_id)?.name, regionLabel(team.region)].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>

        <Card style={s.stats}>
          <Stat value={stats ? String(stats.played) : '–'} label="Played" />
          <Stat value={stats ? `${stats.wins}–${stats.losses}` : '–'} label="W–L" />
          <Stat value={stats?.reliability != null ? `${stats.reliability}%` : '–'} label="Reliable" highlight={(stats?.reliability ?? 0) >= 90} />
          <Stat value={stats ? String(stats.no_shows) : '–'} label="No-shows" />
        </Card>
        <Text variant="caption" style={{ marginTop: spacing.xs }}>
          {reliabilityLabel(stats?.reliability)} · no-shows and late cancels lower reliability.
        </Text>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text variant="label" style={s.title} accessibilityRole="header">
              Roster {members.length}/{SCRIM_RULES.maxRoster}
            </Text>
            {!canScrim ? <Text variant="caption">Needs {SCRIM_RULES.minRoster - members.length} more to scrim</Text> : null}
          </View>
          {members.map((m) => {
            const name = m.profile?.display_name || m.profile?.username || 'Player';
            return (
              <View key={m.profile_id} style={s.member}>
                <Pressable
                  style={s.memberMain}
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.profile_id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${ROLE_LABELS[m.role]}`}
                >
                  <Avatar uri={m.profile?.avatar_url} name={name} size={40} highlight={m.role === 'captain'} />
                  <View style={{ flex: 1 }}>
                    <Text variant="strong" numberOfLines={1}>
                      {name}
                      {m.profile_id === myId ? ' (you)' : ''}
                    </Text>
                    <Text variant="caption">{ROLE_LABELS[m.role]}</Text>
                  </View>
                </Pressable>
                {isCaptain && m.profile_id !== myId ? (
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name}`}
                    onPress={() =>
                      Alert.alert(`Remove ${name}?`, undefined, [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => void act(`rm-${m.profile_id}`, () => removeTeamMember(team.id, m.profile_id), "Couldn't remove") },
                      ])
                    }
                    style={s.iconBtn}
                  >
                    <Ionicons name="person-remove-outline" size={20} color={t.colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        {isCaptain ? (
          <View style={s.section}>
            <Button
              title={showInvite ? 'Hide friends' : 'Invite friends'}
              icon="person-add"
              variant={showInvite ? 'secondary' : 'primary'}
              disabled={rosterFull}
              onPress={() => setShowInvite((v) => !v)}
            />
            {rosterFull ? <Text variant="caption" style={{ marginTop: spacing.xs }}>Roster is full.</Text> : null}
            {showInvite && !rosterFull ? (
              <View style={{ marginTop: spacing.md }}>
                {invitable.length === 0 ? (
                  <Text muted>Add friends first (Profile → Friends), then invite them here.</Text>
                ) : (
                  invitable.map((f) => {
                    const invited = invitedIds.has(f.profile.id);
                    return (
                      <View key={f.profile.id} style={s.member}>
                        <View style={s.memberMain}>
                          <Avatar uri={f.profile.avatar_url} name={f.profile.display_name} size={36} />
                          <Text style={{ flex: 1 }} numberOfLines={1}>
                            {f.profile.display_name}
                          </Text>
                        </View>
                        <Button
                          title={invited ? 'Invited' : 'Invite'}
                          size="sm"
                          variant={invited ? 'ghost' : 'secondary'}
                          disabled={invited}
                          loading={busy === `inv-${f.profile.id}`}
                          onPress={() => void act(`inv-${f.profile.id}`, () => inviteToTeam(team.id, f.profile.id), "Couldn't invite")}
                        />
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={s.section}>
          <Text variant="label" style={s.title} accessibilityRole="header">
            Recent scrims
          </Text>
          {d.scrims.length === 0 ? <Text muted>No scrims yet.</Text> : null}
          {d.scrims.map((x) => (
            <ScrimCard key={x.id} scrim={x} now={now} onPress={() => router.push({ pathname: '/scrims/[id]', params: { id: x.id } })} />
          ))}
          {isCaptain && canScrim ? <Button title="Post a scrim" icon="flag" style={{ marginTop: spacing.sm }} onPress={() => router.push('/scrims/new')} /> : null}
        </View>

        {me ? <Button title="Leave team" variant="ghost" icon="exit-outline" loading={busy === 'leave'} onPress={confirmLeave} style={{ marginTop: spacing.lg }} /> : null}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
    stats: { flexDirection: 'row', justifyContent: 'space-between' },
    section: { marginTop: spacing.xl },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    title: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
    member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.border },
    memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  }),
);
