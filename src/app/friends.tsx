import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar, Button, EmptyState, ErrorState, LoadingState, Screen, SegmentedControl, Text } from '../components/ui';
import { openDm } from '../lib/actions';
import { errorMessage } from '../lib/supabase';
import { acceptFriendRequest, deleteFriendship } from '../features/friends/api';
import { useFriendships, type FriendshipWithProfile } from '../features/friends/hooks';
import { designTokens, fontSize, makeStyles, spacing, useTheme } from '../theme';

type Segment = 'friends' | 'requests' | 'sent';

export default function FriendsScreen() {
  // One shared load for all three tabs.
  const { myId, items, loading, error, reload } = useFriendships();
  const t = useTheme();
  const styles = useStyles();
  const [segment, setSegment] = useState<Segment>('friends');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const friends = items
    .filter((i) => i.friendship.status === 'accepted')
    .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));
  const incoming = items.filter((i) => i.friendship.status === 'pending' && i.friendship.addressee_id === myId);
  const outgoing = items.filter((i) => i.friendship.status === 'pending' && i.friendship.requester_id === myId);

  const act = async (id: string, action: () => Promise<void>, failTitle: string) => {
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      Alert.alert(failTitle, errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const data = segment === 'friends' ? friends : segment === 'requests' ? incoming : outgoing;

  const renderItem = ({ item }: { item: FriendshipWithProfile }) => {
    const { friendship, profile } = item;
    const busy = busyId === friendship.id;
    let actions: ReactNode = null;
    if (segment === 'friends') {
      actions = <Button size="sm" variant="secondary" icon="chatbubble-outline" title="Message" onPress={() => void openDm(profile.id)} />;
    } else if (segment === 'requests') {
      actions = (
        <View style={styles.actions}>
          <Button
            size="sm"
            title="Accept"
            loading={busy}
            onPress={() => void act(friendship.id, () => acceptFriendRequest(friendship.id), "Couldn't accept request")}
          />
          <Button
            size="sm"
            variant="ghost"
            title="Decline"
            disabled={busy}
            onPress={() => void act(friendship.id, () => deleteFriendship(friendship.id), "Couldn't decline request")}
          />
        </View>
      );
    } else {
      actions = (
        <Button
          size="sm"
          variant="secondary"
          title="Cancel"
          loading={busy}
          onPress={() =>
            Alert.alert('Cancel friend request?', `Cancel your request to ${profile.display_name}?`, [
              { text: 'Keep', style: 'cancel' },
              {
                text: 'Cancel request',
                style: 'destructive',
                onPress: () => void act(friendship.id, () => deleteFriendship(friendship.id), "Couldn't cancel request"),
              },
            ])
          }
        />
      );
    }
    return (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${profile.display_name}'s profile`}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: profile.id } })}
          style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}
        >
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={44} />
          <View style={styles.names}>
            <Text style={styles.name} numberOfLines={1}>{profile.display_name}</Text>
            {profile.username ? <Text variant="caption" numberOfLines={1}>@{profile.username}</Text> : null}
          </View>
        </Pressable>
        {actions}
      </View>
    );
  };

  const empty =
    segment === 'friends' ? (
      <EmptyState
        icon="people-outline"
        title="No friends yet"
        message={`Find players in the ${t.words.squad} finder and add them as friends.`}
        action={<Button title={`Find a ${t.words.squad}`} icon="people" onPress={() => router.push('/(tabs)/squad')} />}
      />
    ) : segment === 'requests' ? (
      <EmptyState icon="mail-open-outline" title="No friend requests" message="When someone adds you, it shows up here." />
    ) : (
      <EmptyState icon="paper-plane-outline" title="No sent requests" message="Requests you send appear here until they're answered." />
    );

  return (
    <Screen edges={['bottom']} padded={false}>
      <SegmentedControl
        accessibilityLabel="Friends lists"
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'friends', label: 'Friends' },
          { value: 'requests', label: 'Requests', badge: incoming.length },
          { value: 'sent', label: 'Sent' },
        ]}
        style={styles.segments}
      />

      {loading && items.length === 0 ? (
        <LoadingState />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.friendship.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={data.length === 0 ? { flexGrow: 1 } : { paddingBottom: spacing.xl }}
          ListEmptyComponent={empty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await reload();
                setRefreshing(false);
              }}
              tintColor={t.colors.primary}
              colors={[t.colors.primary]}
              progressBackgroundColor={t.colors.surface}
            />
          }
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    segments: { marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    person: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    names: { flex: 1, marginLeft: spacing.md },
    name: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.lg,
      color: t.colors.text,
      letterSpacing: t.shape.headingLetterSpacing * 0.6,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: designTokens(t).hairline,
      marginLeft: spacing.lg + 44 + spacing.md,
      marginRight: spacing.lg,
    },
  }),
);
