import { supabase } from '../../lib/supabase';
import type { Friendship } from '../../lib/types';

// Tiny in-app event bus so every friends hook refreshes right after a local change,
// without waiting for realtime (which may not deliver DELETEs under RLS).
type Listener = () => void;
const listeners = new Set<Listener>();

export function onFriendshipsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyFriendshipsChanged(): void {
  listeners.forEach((l) => l());
}

/** The friendship row between two users, in either direction, or null. */
export async function fetchFriendshipBetween(myId: string, otherId: string): Promise<Friendship | null> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`and(requester_id.eq.${myId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${myId})`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Friendship | null) ?? null;
}

/** All friendship rows I'm part of (accepted and pending, either direction). */
export async function fetchMyFriendships(myId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Friendship[];
}

export async function sendFriendRequest(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase.from('friendships').insert({ requester_id: myId, addressee_id: otherId, status: 'pending' });
  if (error) throw error;
  notifyFriendshipsChanged();
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  if (error) throw error;
  notifyFriendshipsChanged();
}

/** Used for decline, cancel and unfriend. */
export async function deleteFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
  notifyFriendshipsChanged();
}
