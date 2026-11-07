// Push registration for GG (Expo push service). See docs/PHASE2.md §1.
// Remote push needs an EAS build (not Expo Go on Android) and an EAS projectId.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

const TOKEN_KEY = 'gg.push.token';

/** Token registered from this device in this install (memory + AsyncStorage). */
let currentToken: string | null = null;

// Foreground notifications: show a banner, keep it in the list, play the sound.
// The app icon badge is set from the unread count by NotificationsBridge.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** The EAS project id, or null before `eas init`. */
export function getEasProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** True when this build can receive remote push at all (real device, native, projectId set). */
export function canUsePush(): boolean {
  return Platform.OS !== 'web' && Device.isDevice && getEasProjectId() !== null;
}

/** Current notification permission: granted, can still be asked, or blocked. */
export async function getPushPermission(): Promise<'granted' | 'undetermined' | 'denied'> {
  if (Platform.OS === 'web') return 'denied';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    showBadge: true,
  });
}

/**
 * Registers this device for push and saves the Expo push token to `push_tokens`.
 * Quietly returns null on simulators, on web, without an EAS projectId, or when the
 * player declines. `askPermission: false` only registers if permission is already granted.
 */
export async function registerForPush(userId: string, { askPermission = true }: { askPermission?: boolean } = {}): Promise<string | null> {
  if (!userId || Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    // The channel must exist before the permission prompt on Android 13+.
    await ensureAndroidChannel();

    let permission = await getPushPermission();
    if (permission !== 'granted' && askPermission && permission === 'undetermined') {
      const req = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      permission = req.granted || req.ios?.status === IosAuthorizationStatus.PROVISIONAL ? 'granted' : 'denied';
    }
    if (permission !== 'granted') return null;

    const projectId = getEasProjectId();
    if (!projectId) return null; // before `eas init`: inbox still works, push is skipped

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
    // RPC so a token from a phone shared by two accounts moves to whoever signed in last.
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platform });
    if (error) return null;

    currentToken = token;
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return token;
  } catch {
    // Offline, Expo push service down, missing credentials… try again next launch.
    return null;
  }
}

/**
 * Deletes this device's push token row so the signed-out account stops getting pushes.
 * Call BEFORE supabase.auth.signOut() (the delete needs the session). Never throws.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = currentToken ?? (await AsyncStorage.getItem(TOKEN_KEY).catch(() => null));
    currentToken = null;
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
    if (Platform.OS !== 'web') await Notifications.setBadgeCountAsync(0).catch(() => false);
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // Best effort: the send-push function also prunes dead tokens.
  }
}
