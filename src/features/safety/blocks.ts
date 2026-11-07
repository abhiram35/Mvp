import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You need to be signed in.');
  return id;
}

// Tiny pub/sub so every mounted useBlockedIds() refreshes after a block/unblock anywhere.
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

/** Blocks a player and removes any friendship (pending or accepted) between us. */
export async function blockUser(id: string): Promise<void> {
  const me = await currentUserId();
  if (me === id) throw new Error("You can't block yourself.");
  const { error } = await supabase.from('blocks').upsert(
    { blocker_id: me, blocked_id: id },
    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
  );
  if (error) throw error;
  // The backend already deletes any friendship between the two users when a block is
  // inserted; this client-side delete is a best-effort belt-and-braces, so ignore errors.
  await supabase
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${me},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${me})`);
  notify();
}

export async function unblockUser(id: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', id);
  if (error) throw error;
  notify();
}

/**
 * Ids of players the current user has blocked.
 *
 * NOTE: this only contains ids *I* blocked. Rows where someone else blocked me are not
 * readable under RLS (the `blocks` table is only visible to the blocker), so the
 * "they blocked me" direction must be enforced server-side (RLS / RPCs like
 * find_squadmates and get_or_create_dm already exclude blocked users either way).
 */
export function useBlockedIds(): { blockedIds: Set<string>; reload(): void } {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(() => {
    void (async () => {
      const { data: s } = await supabase.auth.getSession();
      const me = s.session?.user.id;
      if (!me) {
        setBlockedIds(new Set());
        return;
      }
      const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', me);
      if (error) return; // keep the previous set on transient errors
      setBlockedIds(new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id)));
    })();
  }, []);

  useEffect(() => {
    reload();
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);

  return { blockedIds, reload };
}
