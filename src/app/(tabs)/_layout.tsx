import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { useIncomingRequestCount } from '../../features/friends/hooks';
import { useTheme } from '../../theme';

export default function TabsLayout() {
  const t = useTheme();
  const { count: friendRequests } = useIncomingRequestCount();
  const label = (text: string) => (t.shape.headingUppercase ? text.toUpperCase() : text);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.id === 'protocol' ? t.colors.panel : t.colors.bg, borderTopColor: t.colors.border },
        tabBarActiveTintColor: t.id === 'protocol' ? t.colors.onPanel : t.colors.primary,
        tabBarInactiveTintColor: t.id === 'protocol' ? '#8E969E' : t.colors.textFaint,
        tabBarLabelStyle: { fontFamily: t.fonts.heading, fontSize: 12, letterSpacing: t.shape.headingLetterSpacing },
      }}
    >
      {/* Live "looking for group" board — called Lobbies (or Dojo in Ronin) */}
      <Tabs.Screen
        name="index"
        options={{ title: label(t.words.lobbies), tabBarIcon: ({ color, size }) => <Ionicons name="flash" color={String(color)} size={size} /> }}
      />
      {/* Squad finder (player matching) */}
      <Tabs.Screen
        name="squad"
        options={{ title: label('Duo'), tabBarIcon: ({ color, size }) => <Ionicons name="people" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: label('Chats'),
          tabBarBadge: friendRequests > 0 ? friendRequests : undefined,
          tabBarBadgeStyle: { backgroundColor: t.colors.primary, color: t.colors.onPrimary },
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: label('Me'), tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={String(color)} size={size} /> }}
      />
    </Tabs>
  );
}
