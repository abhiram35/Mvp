import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from '../../components/ui';
import { ActionRow } from '../../features/profile/ActionRow';
import { FriendButton } from '../../features/friends/FriendButton';
import { ProfileGamesList } from '../../features/profile/ProfileGamesList';
import { SteamCard } from '../../features/steam/SteamCard';
import { ProfileHeader } from '../../features/profile/ProfileHeader';
import { useProfile } from '../../features/profile/useProfile';
import { blockUser, unblockUser, useBlockedIds } from '../../features/safety/blocks';
import { openDm, openReport } from '../../lib/actions';
import { errorMessage } from '../../lib/supabase';
import { useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const me = useUserId();
  const t = useTheme();
  const styles = useStyles();
  const { profile, games, gameIds, steam, loading, error, reload } = useProfile(id);
  const { blockedIds } = useBlockedIds();
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);

  if (id && id === me) return <Redirect href="/(tabs)/profile" />;

  const name = profile?.display_name ?? 'this player';
  const isBlocked = !!id && blockedIds.has(id);

  const doBlock = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await blockUser(id);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't block", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doUnblock = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await unblockUser(id);
    } catch (e) {
      Alert.alert("Couldn't unblock", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmBlock = () =>
    Alert.alert(`Block ${name}?`, "They won't be able to message you or join your ${t.words.squad}s, and you won't see their posts. Any friendship is removed.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void doBlock() },
    ]);

  const openMenu = () => {
    if (!id) return;
    Alert.alert(name, undefined, [
      { text: 'Report player', onPress: () => openReport('profile', id) },
      isBlocked
        ? { text: 'Unblock', onPress: () => void doUnblock() }
        : { text: 'Block player', style: 'destructive', onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const message = async () => {
    if (!id) return;
    setMessaging(true);
    await openDm(id);
    setMessaging(false);
  };

  const header = (
    <Stack.Screen
      options={{
        title: profile ? `@${profile.username}` : 'Player',
        headerRight: () =>
          id ? (
            <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} style={styles.menuBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color={t.colors.text} />
            </Pressable>
          ) : null,
      }}
    />
  );

  if (!id) {
    return (
      <Screen edges={[]}>
        {header}
        <EmptyState icon="person-outline" title="Player not found" />
      </Screen>
    );
  }
  if (loading && !profile) {
    return (
      <Screen edges={[]}>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (error && !profile) {
    return (
      <Screen edges={[]}>
        {header}
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }
  if (isBlocked) {
    return (
      <Screen edges={[]}>
        {header}
        <EmptyState
          icon="ban-outline"
          title="You blocked this player"
          message="Unblock them to see their profile and let them contact you again."
          action={<Button title="Unblock" variant="secondary" onPress={doUnblock} loading={busy} />}
        />
      </Screen>
    );
  }
  if (!profile) {
    return (
      <Screen edges={[]}>
        {header}
        <EmptyState icon="person-outline" title="Player not found" message="This account may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']}>
      {header}
      <ProfileHeader profile={profile} gamesCount={games.length}>
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <FriendButton profileId={id} />
          </View>
          <Button title="Message" icon="chatbubble-outline" variant="secondary" onPress={message} loading={messaging} style={{ flex: 1 }} />
        </View>
      </ProfileHeader>

      <View style={styles.section}>
        <ProfileGamesList games={games} gameIds={gameIds} />
        <SteamCard account={steam} profileId={id} />
      </View>

      <SectionHeader index={2} kicker="Keep it clean" title="Safety" />
      <View>
        <ActionRow icon="flag-outline" label="Report player" onPress={() => openReport('profile', id)} />
        <ActionRow icon="ban-outline" label={busy ? 'Blocking…' : 'Block player'} danger disabled={busy} onPress={confirmBlock} last />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    actions: { flexDirection: 'row', gap: spacing.md },
    menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    section: { marginTop: spacing.xl },
  }),
);
