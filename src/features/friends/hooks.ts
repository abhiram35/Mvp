import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Friendship } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { fetchProfiles, unknownProfile, type MemberProfile } from '../chat/useConversation';
import { fetchMyFriendships, onFriendshipsChanged } from './api';

export type FriendProfile = MemberProfile;

/** A friendship row plus the *other* person's profile. */
export interface FriendshipWithProfile {
  friendship: Friendship;
  profile: FriendProfile;
}

/**
 * Base hook: all of my friendship rows with the other person's profile,
 * refreshed on realtime changes to `friendships` and after local mutations.
 */
export function useFriendships(options: { withProfiles?: boolean } = {}) {
  const withProfiles = options.withProfiles ?? true;
  const myId = useUserId();
  const [items, setItems] = useState<FriendshipWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadedOnce = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!myId) return;
    if (!loadedOnce.current) setLoading(true);
    try {
      const rows = await fetchMyFriendships(myId);
      const otherIds = rows.map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id));
      const profiles = withProfiles ? await fetchProfiles(otherIds) : [];
      const byId = new Map(profiles.map((p) => [p.id, p]));
      if (!mounted.current) return;
      setItems(
        rows.map((f, i) => {
          const otherId = otherIds[i] ?? '';
          return { friendship: f, profile: byId.get(otherId) ?? unknownProfile(otherId) };
        }),
      );
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [myId, withProfiles]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onFriendshipsChanged(() => void load()), [load]);

  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`friendships:${myId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myId, load]);

  return { myId, items, loading, error, reload: load };
}

/** Accepted friends with profiles, sorted by display name. */
export function useFriends() {
  const { items, loading, error, reload } = useFriendships();
  const friends = useMemo(
    () =>
      items
        .filter((i) => i.friendship.status === 'accepted')
        .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name)),
    [items],
  );
  return { friends, loading, error, reload };
}

/** Pending requests: `incoming` (sent to me) and `outgoing` (sent by me), newest first. */
export function useFriendRequests() {
  const { myId, items, loading, error, reload } = useFriendships();
  const { incoming, outgoing } = useMemo(() => {
    const pending = items.filter((i) => i.friendship.status === 'pending');
    return {
      incoming: pending.filter((i) => i.friendship.addressee_id === myId),
      outgoing: pending.filter((i) => i.friendship.requester_id === myId),
    };
  }, [items, myId]);
  return { incoming, outgoing, loading, error, reload };
}

/** Number of incoming pending friend requests (for badges). */
export function useIncomingRequestCount(): { count: number; reload: () => Promise<void> } {
  const { myId, items, reload } = useFriendships({ withProfiles: false });
  const count = useMemo(
    () => items.filter((i) => i.friendship.status === 'pending' && i.friendship.addressee_id === myId).length,
    [items, myId],
  );
  return { count, reload };
}
