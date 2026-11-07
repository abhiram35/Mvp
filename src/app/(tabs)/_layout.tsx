import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { useIncomingRequestCount } from '../../features/friends/hooks';
import { colors } from '../../theme';

export default function TabsLayout() {
  const { count: friendRequests } = useIncomingRequestCount();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      {/* LFG agent: live "looking for group" board */}
      <Tabs.Screen
        name="index"
        options={{ title: 'LFG', tabBarIcon: ({ color, size }) => <Ionicons name="flash" color={String(color)} size={size} /> }}
      />
      {/* LFG agent: squad finder (player matching) */}
      <Tabs.Screen
        name="squad"
        options={{ title: 'Find Squad', tabBarIcon: ({ color, size }) => <Ionicons name="people" color={String(color)} size={size} /> }}
      />
      {/* Chat & Friends agent */}
      <Tabs.Screen
        name="chats"
        options={{ title: 'Chats', tabBarBadge: friendRequests > 0 ? friendRequests : undefined, tabBarBadgeStyle: { backgroundColor: colors.primary }, tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={String(color)} size={size} /> }}
      />
      {/* Auth & Profile agent */}
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={String(color)} size={size} /> }}
      />
    </Tabs>
  );
}
