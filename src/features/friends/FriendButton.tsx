import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Button } from '../../components/ui';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Friendship } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { spacing, useTheme } from '../../theme';
import {
  acceptFriendRequest,
  deleteFriendship,
  fetchFriendshipBetween,
  onFriendshipsChanged,
  sendFriendRequest,
} from './api';

/** Add friend / Requested / Accept + Decline / Friends ✓ — and performs the action. */
export function FriendButton({ profileId }: { profileId: string }) {
  const myId = useUserId();
  const t = useTheme();
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!myId || !profileId || myId === profileId) {
      setLoading(false);
      return;
    }
    try {
      const row = await fetchFriendshipBetween(myId, profileId);
      if (mounted.current) setFriendship(row);
    } catch {
      // Leave the previous state; the user can retry by tapping.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [myId, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onFriendshipsChanged(() => void load()), [load]);

  useEffect(() => {
    if (!myId || !profileId || myId === profileId) return;
    const channel = supabase
      .channel(`friend-button:${profileId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myId, profileId, load]);

  const run = useCallback(
    async (action: () => Promise<void>, failTitle: string) => {
      setBusy(true);
      try {
        await action();
        await load();
      } catch (err) {
        Alert.alert(failTitle, errorMessage(err));
        await load();
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [load],
  );

  if (!myId || myId === profileId) return null;

  if (loading) {
    return (
      <View style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  if (!friendship) {
    return (
      <Button
        size="sm"
        title="Add friend"
        icon="person-add-outline"
        loading={busy}
        onPress={() => void run(() => sendFriendRequest(myId, profileId), "Couldn't send request")}
      />
    );
  }

  const id = friendship.id;

  if (friendship.status === 'accepted') {
    return (
      <Button
        size="sm"
        variant="secondary"
        title="Friends"
        icon="checkmark"
        loading={busy}
        onPress={() =>
          Alert.alert('Remove friend?', 'You can always add them again later.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Unfriend', style: 'destructive', onPress: () => void run(() => deleteFriendship(id), "Couldn't unfriend") },
          ])
        }
      />
    );
  }

  if (friendship.requester_id === myId) {
    return (
      <Button
        size="sm"
        variant="secondary"
        title="Requested"
        icon="time-outline"
        loading={busy}
        onPress={() =>
          Alert.alert('Cancel friend request?', undefined, [
            { text: 'Keep', style: 'cancel' },
            { text: 'Cancel request', style: 'destructive', onPress: () => void run(() => deleteFriendship(id), "Couldn't cancel request") },
          ])
        }
      />
    );
  }

  // Pending, sent to me.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Button
        size="sm"
        title="Accept"
        icon="checkmark"
        loading={busy}
        onPress={() => void run(() => acceptFriendRequest(id), "Couldn't accept request")}
      />
      <Button
        size="sm"
        variant="ghost"
        title="Decline"
        disabled={busy}
        onPress={() => void run(() => deleteFriendship(id), "Couldn't decline request")}
      />
    </View>
  );
}
