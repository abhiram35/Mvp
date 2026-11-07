import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { ConversationSummary } from '../../lib/types';

/** Conversations for the signed-in user (rpc list_my_conversations), refreshed on new messages. */
export function useConversationList() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
    if (mode === 'initial' && !loadedOnce.current) setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    const { data, error: err } = await supabase.rpc('list_my_conversations');
    if (err) {
      // Keep showing stale data on background refresh failures.
      if (!loadedOnce.current || mode !== 'silent') setError(errorMessage(err));
    } else {
      setError(null);
      setConversations(((data ?? []) as ConversationSummary[]).slice());
      loadedOnce.current = true;
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Realtime: any new message visible to me (RLS limits rows) → refresh the list.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`chat-list:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // Coalesce bursts of messages into one refresh.
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void load('silent'), 300);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return { conversations, loading, refreshing, error, load };
}
