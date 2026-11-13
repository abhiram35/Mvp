import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import type { IconName } from '../../components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PLAY_RAISE, PlayTabButton } from '../../features/lobby/PlayTabButton';
import { BannedBanner, BannedBannerHost } from '../../features/moderation/BannedBanner';
import { ensureContrast, mixHex, useDesign, useTheme } from '../../theme';

/**
 * Tab icon with the theme's active marker above it: a skewed red slash (Protocol), a flat gold
 * bar (Defuse), a red seal dot (Ronin). Outline icon when inactive, filled when active.
 */
function TabIcon({ name, focused, color }: { name: string; focused: boolean; color: string }) {
  const t = useTheme();
  const d = useDesign();
  const icon = (focused ? name : `${name}-outline`) as IconName;
  const marker =
    d.lang.header === 'ink'
      ? { width: 5, height: 5, borderRadius: 3 }
      : d.lang.header === 'hud'
        ? { width: 18, height: 2 }
        : { width: 14, height: 3, transform: [{ skewX: '-20deg' }] };
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[marker, { backgroundColor: t.colors.primary, opacity: focused ? 1 : 0, marginBottom: 3 }]} />
      <Ionicons name={icon} color={color} size={22} />
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const d = useDesign();
  const insets = useSafeAreaInsets();
  // Protocol keeps its navy command bar; other themes sit the bar one tone below the page.
  const onPanelBar = t.id === 'protocol';
  const barBg = onPanelBar ? t.colors.panel : t.dark ? d.surface.sunken : d.surface.raised;
  const active = onPanelBar ? t.colors.onPanel : t.colors.text;
  const inactive = onPanelBar ? ensureContrast(mixHex(t.colors.onPanel, t.colors.panel, 0.4), [t.colors.panel], 4.5) : ensureContrast(t.colors.textMuted, [barBg], 4.5);
  const label = (text: string) => (t.shape.headingUppercase ? text.toUpperCase() : text);
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* Banned players see this above every tab (renders nothing otherwise). It pads the top
          safe area itself; tab screens' SafeAreaViews then only pad what still overlaps. */}
      <BannedBanner safeArea force />
      <BannedBannerHost>
        <Tabs
          screenOptions={{
            headerShown: false,
            // The bar is PLAY_RAISE taller than it looks: a transparent strip on top holds the
            // raised hexagon inside the bar's bounds (Android ignores touches outside them).
            tabBarStyle: {
              height: 56 + insets.bottom + PLAY_RAISE,
              paddingBottom: insets.bottom,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
              overflow: 'visible',
            },
            tabBarBackground: () => (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  top: PLAY_RAISE,
                  backgroundColor: barBg,
                  borderTopColor: onPanelBar ? t.colors.panel : d.hairline,
                  borderTopWidth: StyleSheet.hairlineWidth,
                }}
              />
            ),
            tabBarItemStyle: { paddingTop: PLAY_RAISE },
            tabBarActiveTintColor: active,
            tabBarInactiveTintColor: inactive,
            tabBarLabelStyle: { fontFamily: t.fonts.heading, fontSize: 12, letterSpacing: t.shape.headingLetterSpacing, marginTop: 2 },
            tabBarIconStyle: { marginTop: 2 },
          }}
        >
          {/* Clips feed (opens first) — owned by the Clips engineer */}
          <Tabs.Screen
            name="index"
            options={{ title: label('Clips'), tabBarIcon: ({ color, focused }) => <TabIcon name="film" focused={focused} color={String(color)} /> }}
          />
          {/* Game Lobby: player bar, party slots, find a duo, modes, live ticker */}
          <Tabs.Screen
            name="lobby"
            options={{ title: label('Lobby'), tabBarIcon: ({ color, focused }) => <TabIcon name="game-controller" focused={focused} color={String(color)} /> }}
          />
          {/* PLAY: the duo finder, behind a raised hexagon button */}
          <Tabs.Screen
            name="squad"
            options={{
              title: label('Play'),
              tabBarAccessibilityLabel: 'Play: find a duo',
              tabBarButton: (props) => <PlayTabButton {...props} barBg={barBg} />,
            }}
          />
          {/* Community: takes (opinions) and questions — "Hub" in the bar */}
          <Tabs.Screen
            name="community"
            options={{ title: label('Hub'), tabBarIcon: ({ color, focused }) => <TabIcon name="newspaper" focused={focused} color={String(color)} /> }}
          />
          <Tabs.Screen
            name="profile"
            options={{ title: label('Me'), tabBarIcon: ({ color, focused }) => <TabIcon name="person-circle" focused={focused} color={String(color)} /> }}
          />
        </Tabs>
      </BannedBannerHost>
    </View>
  );
}
