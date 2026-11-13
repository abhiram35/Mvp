// Friends row under the feed tabs: avatar rings, tap → profile. There is no presence data yet,
// so nobody is marked online; `onlineIds` lights the ring + dot once presence exists.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { FlatList, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Avatar } from '../../components/ui';
import { spacing, useDesign, useTheme } from '../../theme';
import { useFriends, type FriendshipWithProfile } from '../friends';
import { firstName } from './logic';

const RING = 56;
const AVATAR = 46;

export const FriendsRings = memo(function FriendsRings({ onlineIds }: { onlineIds?: ReadonlySet<string> }) {
  const t = useTheme();
  const d = useDesign();
  const { friends, loading } = useFriends();
  if (loading && friends.length === 0) return <View style={{ height: RING + 26 }} />;

  const round = !!t.shape.round || d.lang.corner === 'soft';
  const ringRadius = round ? RING / 2 : t.radius.md + 2;

  const sorted = onlineIds?.size
    ? [...friends].sort((a, b) => Number(onlineIds.has(b.profile.id)) - Number(onlineIds.has(a.profile.id)))
    : friends;

  return (
    <FlatList<FriendshipWithProfile | 'add'>
      horizontal
      data={['add', ...sorted]}
      keyExtractor={(i) => (i === 'add' ? 'add' : i.profile.id)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityLabel="Friends"
      renderItem={({ item }) => {
        if (item === 'add') {
          return (
            <Pressable
              onPress={() => router.push('/friends')}
              accessibilityRole="button"
              accessibilityLabel={friends.length ? 'Friends and requests' : 'Find friends'}
              style={styles.item}
            >
              <View style={[styles.ring, { borderRadius: ringRadius, borderColor: t.colors.border, borderStyle: 'dashed' }]}>
                <Ionicons name={friends.length ? 'people-outline' : 'person-add-outline'} size={22} color={t.colors.textMuted} />
              </View>
              <RNText style={[styles.name, { color: t.colors.textMuted, fontFamily: t.fonts.bodyMedium }]} numberOfLines={1}>
                {friends.length ? 'Friends' : 'Add'}
              </RNText>
            </Pressable>
          );
        }
        const p = item.profile;
        const online = !!onlineIds?.has(p.id);
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${p.display_name}${online ? ', online' : ''}`}
            style={styles.item}
          >
            <View style={[styles.ring, { borderRadius: ringRadius, borderColor: online ? t.colors.accent : d.hairline }]}>
              <Avatar uri={p.avatar_url} name={p.display_name} size={AVATAR} online={online} />
            </View>
            <RNText style={[styles.name, { color: t.colors.text, fontFamily: t.fonts.bodyMedium }]} numberOfLines={1}>
              {firstName(p.display_name, 9)}
            </RNText>
          </Pressable>
        );
      }}
    />
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  item: { alignItems: 'center', width: RING + 8 },
  ring: { width: RING, height: RING, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 12, marginTop: 4, maxWidth: RING + 8 },
});
