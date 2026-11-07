import { router } from 'expo-router';
import { Alert } from 'react-native';
import { errorMessage, supabase } from './supabase';

/** Opens (creating if needed) the 1-to-1 chat with another player. Any feature may call this. */
export async function openDm(otherId: string): Promise<void> {
  const { data, error } = await supabase.rpc('get_or_create_dm', { other_id: otherId });
  if (error || !data) {
    Alert.alert("Can't start chat", error ? errorMessage(error) : 'Please try again.');
    return;
  }
  router.push({ pathname: '/chat/[id]', params: { id: String(data) } });
}

/** Opens the report screen for any profile, message or LFG post. */
export function openReport(type: 'profile' | 'message' | 'lfg_post', id: string): void {
  router.push({ pathname: '/report', params: { type, id } });
}
