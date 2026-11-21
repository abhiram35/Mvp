import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { designTokens, fontSize, makeStyles, useTheme } from '../../theme';
import { useUnreadNotifications } from './unread';

/** Header icon button → /notifications, with a small primary unread badge. */
export function NotificationBell() {
  const t = useTheme();
  const s = useStyles();
  const { count, refresh } = useUnreadNotifications();

  // Cheap re-check whenever the screen with the bell comes back into view.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const label = count > 99 ? '99+' : String(count);
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={`Notifications, ${count} unread`}
      hitSlop={6}
      style={({ pressed }) => [s.button, pressed && { backgroundColor: t.colors.surfaceRaised }]}
    >
      <Ionicons name={count > 0 ? 'notifications' : 'notifications-outline'} size={20} color={count > 0 ? t.colors.text : t.colors.textMuted} />
      {count > 0 ? (
        <View style={s.badge} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <RNText style={s.badgeText} numberOfLines={1}>
            {label}
          </RNText>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      borderRadius: designTokens(t).lang.corner === 'soft' ? 22 : t.radius.md,
      backgroundColor: designTokens(t).chip.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: 4,
      right: 3,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: t.shape.round ? 9 : t.radius.sm,
      backgroundColor: t.colors.primary,
      borderWidth: 1.5,
      borderColor: designTokens(t).chip.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: t.colors.onPrimary, fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs - 2, lineHeight: 13 },
  }),
);
