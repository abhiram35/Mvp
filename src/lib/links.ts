import { Alert, Linking } from 'react-native';

/**
 * Vinq's community Discord server (suggestions, bugs, announcements).
 * To change it, set EXPO_PUBLIC_DISCORD_INVITE in .env / EAS environment variables and ship an
 * update (`eas update`) — no new store build needed.
 */
export const DISCORD_INVITE_URL = process.env.EXPO_PUBLIC_DISCORD_INVITE || 'https://discord.gg/sQa6fnPhw';

/** Only real Discord invite links are opened. */
export function isDiscordInvite(url: string): boolean {
  return /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,32}\/?$/.test(url);
}

/** Opens the Vinq Discord in the Discord app (or the browser if it isn't installed). */
export async function openDiscord(): Promise<void> {
  if (!isDiscordInvite(DISCORD_INVITE_URL)) {
    Alert.alert('Discord link unavailable', 'Please try again later.');
    return;
  }
  try {
    await Linking.openURL(DISCORD_INVITE_URL);
  } catch {
    Alert.alert("Couldn't open Discord", `Join us at ${DISCORD_INVITE_URL.replace('https://', '')}`);
  }
}
