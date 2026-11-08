import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, Text } from '../../components/ui';
import { unregisterPush } from '../../features/notifications/push';
import { BannedBanner } from '../../features/moderation/BannedBanner';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { ActionRow } from '../../features/profile/ActionRow';
import { openDiscord } from '../../lib/links';
import { ProfileGamesList } from '../../features/profile/ProfileGamesList';
import { SteamCard } from '../../features/steam/SteamCard';
import { ProfileHeader } from '../../features/profile/ProfileHeader';
import { useProfile } from '../../features/profile/useProfile';
import { showCommunityGuidelines } from '../../features/safety/guidelines';
import { errorMessage, supabase } from '../../lib/supabase';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../../theme';

export default function MyProfileScreen() {
  const t = useTheme();
  const styles = useStyles();
  const userId = useUserId();
  const { signOut } = useAuth();
  const { profile, games, gameIds, steam, steamError, loading, error, reload } = useProfile(userId);
  const { isModerator } = useMyStatus();
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      // Delete this phone's push token while we still have a session (RLS). Never block sign-out on it.
      await Promise.race([unregisterPush(), new Promise((resolve) => setTimeout(resolve, 4000))]);
    } catch {
      // ignore
    } finally {
      await signOut();
    }
  };

  // Pick up edits made on the edit-profile screen.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const confirmSignOut = () =>
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void doSignOut() },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    // Remove the avatar file through the Storage API (Supabase blocks deleting
    // storage objects with SQL, so the RPC can't do it). Best-effort.
    try {
      await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
    } catch {
      // ignore: never block account deletion on storage cleanup
    }
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
      setDeleting(false);
      Alert.alert("Couldn't delete account", errorMessage(rpcError));
      return;
    }
    await doSignOut();
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, games, friends, chats and posts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you absolutely sure?', 'This cannot be undone.', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete forever', style: 'destructive', onPress: () => void deleteAccount() },
            ]),
        },
      ],
    );

  if (loading && !profile) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (error && !profile) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }
  if (!profile) {
    return (
      <Screen>
        <EmptyState
          icon="person-outline"
          title="Profile not found"
          action={<Button title="Sign out" variant="secondary" loading={signingOut} onPress={() => void doSignOut()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenHeader title="Profile" />
      {/* Hidden when the tabs layout already shows it above every tab. */}
      <BannedBanner />
      <ProfileHeader profile={profile} gamesCount={games.length} own>
        <Button title="Edit profile" icon="create-outline" variant="secondary" onPress={() => router.push('/settings/edit-profile')} />
      </ProfileHeader>

      <View style={styles.section}>
        <ProfileGamesList games={games} gameIds={gameIds} />
        {userId ? (
          <SteamCard
            account={steam}
            own
            profileId={userId}
            myGameIds={games.map((g) => g.game_id)}
            onChanged={() => void reload()}
            loadError={steamError}
            onRetry={() => void reload()}
          />
        ) : null}
      </View>

      <Text variant="heading" style={styles.groupTitle}>Settings</Text>
      <View style={styles.group}>
        <ActionRow icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} />
        <ActionRow icon="color-palette-outline" label="Theme" value={t.name} onPress={() => router.push('/settings/theme')} />
        <ActionRow icon="people-outline" label="Friends" onPress={() => router.push('/friends')} />
        <ActionRow icon="ban-outline" label="Blocked players" onPress={() => router.push('/settings/blocked')} />
        <ActionRow icon="shield-checkmark-outline" label="Community guidelines" onPress={showCommunityGuidelines} last={!isModerator} />
        {isModerator ? <ActionRow icon="hammer-outline" label="Moderation" onPress={() => router.push('/moderation')} last /> : null}
      </View>

      <Text variant="heading" style={styles.groupTitle}>Feedback & community</Text>
      <View style={styles.group}>
        <ActionRow icon="logo-discord" label="Join our Discord" value="Suggestions" onPress={() => void openDiscord()} />
        <ActionRow icon="chatbox-ellipses-outline" label="Send feedback" onPress={() => router.push('/feedback')} last />
      </View>

      <View style={[styles.group, { marginTop: spacing.xl }]}>
        <ActionRow icon="log-out-outline" label={signingOut ? 'Signing out…' : 'Sign out'} disabled={signingOut} onPress={confirmSignOut} />
        <ActionRow icon="trash-outline" label={deleting ? 'Deleting…' : 'Delete account'} danger disabled={deleting} onPress={confirmDelete} last />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { marginTop: spacing.xl },
    groupTitle: { marginTop: spacing.xl, marginBottom: spacing.sm },
    group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
  }),
);
