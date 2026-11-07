import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { unblockUser } from '../../features/safety/blocks';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { spacing } from '../../theme';

type BlockedRow = { blocked_id: string; profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null };

export default function BlockedPlayersScreen() {
  const me = useUserId();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: blocks, error: bErr } = await supabase
        .from('blocks')
        .select('blocked_id, created_at')
        .eq('blocker_id', me)
        .order('created_at', { ascending: false });
      if (bErr) throw bErr;
      const ids = (blocks ?? []).map((b: { blocked_id: string }) => b.blocked_id);
      let profiles: BlockedRow['profile'][] = [];
      if (ids.length) {
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', ids);
        if (pErr) throw pErr;
        profiles = (p ?? []) as NonNullable<BlockedRow['profile']>[];
      }
      setRows(ids.map((id) => ({ blocked_id: id, profile: profiles.find((x) => x?.id === id) ?? null })));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await unblockUser(id);
      setRows((r) => r.filter((x) => x.blocked_id !== id));
    } catch (e) {
      Alert.alert("Couldn't unblock", errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  if (error && rows.length === 0) {
    return (
      <Screen edges={[]}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.blocked_id}
        contentContainerStyle={rows.length === 0 ? { flexGrow: 1 } : styles.list}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <EmptyState icon="shield-checkmark-outline" title="No blocked players" message="Players you block will show up here." />
        }
        renderItem={({ item }) => {
          const name = item.profile?.display_name ?? 'Deleted player';
          return (
            <Card style={styles.row}>
              <Avatar uri={item.profile?.avatar_url} name={name} />
              <View style={styles.names}>
                <Text variant="heading" numberOfLines={1}>{name}</Text>
                {item.profile ? <Text muted numberOfLines={1}>@{item.profile.username}</Text> : null}
              </View>
              <Button
                title="Unblock"
                size="sm"
                variant="secondary"
                loading={busyId === item.blocked_id}
                onPress={() => void unblock(item.blocked_id)}
              />
            </Card>
          );
        }}
        ListFooterComponent={
          rows.length > 0 ? (
            <Button title="Done" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
          ) : undefined
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  names: { flex: 1, marginHorizontal: spacing.md },
});
