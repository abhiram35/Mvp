import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Divider, EmptyState, ErrorState, LoadingState, Screen } from '../../components/ui';
import { ActionRow } from '../../features/profile/ActionRow';
import { ProfileGamesList } from '../../features/profile/ProfileGamesList';
import { ProfileHeader } from '../../features/profile/ProfileHeader';
import { useProfile } from '../../features/profile/useProfile';
import { showCommunityGuidelines } from '../../features/safety/guidelines';
import { errorMessage, supabase } from '../../lib/supabase';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { colors, radius, spacing } from '../../theme';

export default function MyProfileScreen() {
  const userId = useUserId();
  const { signOut } = useAuth();
  const { profile, games, loading, error, reload } = useProfile(userId);
  const [deleting, setDeleting] = useState(false);

  // Pick up edits made on the edit-profile screen.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const confirmSignOut = () =>
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
      setDeleting(false);
      Alert.alert("Couldn't delete account", errorMessage(rpcError));
      return;
    }
    await signOut();
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
          action={<Button title="Sign out" variant="secondary" onPress={() => void signOut()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ProfileHeader profile={profile} />
      <Button title="Edit profile" icon="create-outline" variant="secondary" onPress={() => router.push('/settings/edit-profile')} />
      <Divider />
      <ProfileGamesList games={games} />
      <Divider />

      <View style={styles.group}>
        <ActionRow icon="people-outline" label="Friends" onPress={() => router.push('/friends')} />
        <ActionRow icon="ban-outline" label="Blocked players" onPress={() => router.push('/settings/blocked')} />
        <ActionRow icon="shield-checkmark-outline" label="Community guidelines" onPress={showCommunityGuidelines} />
      </View>

      <View style={[styles.group, { marginTop: spacing.lg }]}>
        <ActionRow icon="log-out-outline" label="Sign out" onPress={confirmSignOut} />
        <ActionRow icon="trash-outline" label={deleting ? 'Deleting…' : 'Delete account'} danger disabled={deleting} onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
