// Invisible root component for notifications. Mount ONCE inside <AuthProvider>, next to
// the root navigator (it uses expo-router's imperative `router`). It:
//  (a) asks for push permission once per install (after a short explanation) and registers,
//  (b) routes notification taps (warm and cold start) to data.route,
//  (c) keeps the shared unread count fresh (realtime + foreground) and the app icon badge.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import type { NotificationRoute } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { canUsePush, getPushPermission, registerForPush } from './push';
import { openNotificationRoute, routeFromData } from './routes';
import { onUnreadChange, refreshUnread, resetUnread } from './unread';

export { useUnreadNotifications } from './unread';

const ASKED_KEY = 'gg.push.asked';
/** Let the first screen settle before the permission explanation shows. */
const ASK_DELAY_MS = 1800;

/** Unique channel names so two mounts never share a channel. */
function channelName(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

export function NotificationsBridge() {
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  const ready = !!userId && !!profile; // signed in AND onboarded
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  // ── (a) Permission + registration ─────────────────────────────────────────
  useEffect(() => {
    if (!ready || !userId || !canUsePush()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const permission = await getPushPermission();
      if (cancelled) return;
      if (permission === 'granted') {
        // Already allowed (earlier install, or allowed in Settings): just (re)register.
        await registerForPush(userId, { askPermission: false });
        return;
      }
      if (permission === 'denied') return;
      const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => '1');
      if (cancelled || asked) return;
      await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
      Alert.alert('Turn on notifications?', 'Get pinged when someone wants to join your lobby or messages you.', [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Turn on',
          onPress: () => {
            void registerForPush(userId, { askPermission: true });
          },
        },
      ]);
    }, ASK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, userId]);

  // ── (b) Notification taps ─────────────────────────────────────────────────
  const pendingRoute = useRef<NotificationRoute | null>(null);
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledIds.current.has(id)) return;
      handledIds.current.add(id);
      const route = routeFromData(response.notification.request.content.data);
      if (!route) return;
      if (readyRef.current) {
        // Next tick: let the navigator finish whatever it is doing (resume, guard redirect).
        setTimeout(() => openNotificationRoute(route), 0);
      } else {
        pendingRoute.current = route; // opened once signed in (cold start)
      }
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // not available on this platform
      }
    };
    // Cold start: the tap that launched the app.
    try {
      handle(Notifications.getLastNotificationResponse());
    } catch {
      // ignore
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !pendingRoute.current) return;
    const route = pendingRoute.current;
    pendingRoute.current = null;
    // Give the signed-in stack a moment to mount after the auth guard flips.
    const timer = setTimeout(() => openNotificationRoute(route), 350);
    return () => clearTimeout(timer);
  }, [ready]);

  // ── (c) Unread count + app icon badge ─────────────────────────────────────
  useEffect(() => {
    if (!ready || !userId) {
      resetUnread();
      return;
    }
    void refreshUnread();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refreshUnread(), 250);
    };
    const channel = supabase
      .channel(channelName(`notifications-${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, schedule)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, schedule)
      .subscribe();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [ready, userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    return onUnreadChange((n) => {
      Notifications.setBadgeCountAsync(n).catch(() => false);
    });
  }, []);

  return null;
}
