import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '../../lib/hooks';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Message, MessageWithSender } from '../../lib/types';
import { fetchProfiles, PROFILE_FIELDS, unknownProfile, type MemberProfile } from './useConversation';

export const PAGE_SIZE = 50;
export const MAX_MESSAGE_LENGTH = 2000;

/** A message as shown in the UI. `pending` is true while an optimistic send is in flight. */
export type ChatMessage = MessageWithSender & { pending?: boolean };

const SELECT_WITH_SENDER = `*, sender:profiles!sender_id(${PROFILE_FIELDS})`;

/** Newest first (the order an inverted FlatList wants). */
function sortNewestFirst(list: ChatMessage[]): ChatMessage[] {
  return list.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

function mergeUnique(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(existing.map((m) => m.id));
  const extra = incoming.filter((m) => !seen.has(m.id));
  if (extra.length === 0) return existing;
  return sortNewestFirst([...existing, ...extra]);
}

/** Calls rpc mark_conversation_read, ignoring failures (it's best-effort). */
export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

/**
 * Messages for one conversation: first page, "load older" pagination, realtime inserts,
 * optimistic sending and read receipts.
 *
 * `membersById` is the members cache used to attach sender profiles to realtime messages.
 */
export function useMessages(conversationId: string | undefined, myId: string, membersById: Map<string, MemberProfile>) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs so realtime callbacks always see the latest values without resubscribing.
  const membersRef = useLatestRef(membersById);
  const extraProfiles = useRef(new Map<string, MemberProfile>());
  const messagesRef = useLatestRef(messages);
  const mounted = useRef(true);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (readTimer.current) clearTimeout(readTimer.current);
    };
  }, []);

  const lookupProfile = useCallback(
    (id: string): MemberProfile | undefined => membersRef.current.get(id) ?? extraProfiles.current.get(id),
    [membersRef],
  );

  /** Attaches sender profiles to plain message rows, fetching any we don't know yet. */
  const withSenders = useCallback(
    async (rows: Message[]): Promise<ChatMessage[]> => {
      const missing = rows.map((r) => r.sender_id).filter((id) => !lookupProfile(id));
      if (missing.length > 0) {
        try {
          const profiles = await fetchProfiles(missing);
          profiles.forEach((p) => extraProfiles.current.set(p.id, p));
        } catch {
          // fall back to placeholders below
        }
      }
      return rows.map((r) => ({ ...r, sender: lookupProfile(r.sender_id) ?? unknownProfile(r.sender_id) }));
    },
    [lookupProfile],
  );

  /** Fetches a page of messages older than `before` (or the newest page). */
  const fetchPage = useCallback(
    async (before: string | null): Promise<ChatMessage[]> => {
      if (!conversationId) return [];
      const build = (select: string) => {
        let q = supabase
          .from('messages')
          .select(select)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (before) q = q.lt('created_at', before);
        return q;
      };
      const joined = await build(SELECT_WITH_SENDER);
      if (!joined.error) {
        const rows = (joined.data ?? []) as unknown as (Message & { sender: MemberProfile | null })[];
        return rows.map((r) => ({ ...r, sender: r.sender ?? lookupProfile(r.sender_id) ?? unknownProfile(r.sender_id) }));
      }
      // If the profiles join isn't available, load plain rows and attach senders ourselves.
      const plain = await build('*');
      if (plain.error) throw plain.error;
      return withSenders((plain.data ?? []) as unknown as Message[]);
    },
    [conversationId, lookupProfile, withSenders],
  );

  const scheduleMarkRead = useCallback(() => {
    if (!conversationId) return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => void markConversationRead(conversationId), 500);
  }, [conversationId]);

  /** Shows the newest page, keeping anything that arrived over realtime while it loaded. */
  const applyFirstPage = useCallback(
    (page: ChatMessage[]) => {
      if (!mounted.current) return;
      setMessages((prev) =>
        mergeUnique(
          sortNewestFirst(page.slice()),
          prev.filter((m) => m.conversation_id === conversationId),
        ),
      );
      setHasMore(page.length === PAGE_SIZE);
      setError(null);
      setLoading(false);
      if (conversationId) void markConversationRead(conversationId);
    },
    [conversationId],
  );

  const failFirstPage = useCallback((err: unknown) => {
    if (!mounted.current) return;
    setError(errorMessage(err));
    setLoading(false);
  }, []);

  /** Retry / reload: shows the spinner again. */
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyFirstPage(await fetchPage(null));
    } catch (err) {
      failFirstPage(err);
    }
  }, [fetchPage, applyFirstPage, failFirstPage]);

  // First page (and again if the conversation changes). State is set only when the request settles.
  useEffect(() => {
    let live = true;
    fetchPage(null).then(
      (page) => {
        if (live) applyFirstPage(page);
      },
      (err: unknown) => {
        if (live) failFirstPage(err);
      },
    );
    return () => {
      live = false;
    };
  }, [fetchPage, applyFirstPage, failFirstPage]);

  const loadOlder = useCallback(async () => {
    if (loading || loadingOlder || !hasMore) return;
    const confirmed = messagesRef.current.filter((m) => !m.pending);
    const oldest = confirmed[confirmed.length - 1];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await fetchPage(oldest.created_at);
      if (!mounted.current) return;
      setMessages((prev) => mergeUnique(prev, page));
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      // Silent: the user can scroll again to retry.
    } finally {
      if (mounted.current) setLoadingOlder(false);
    }
  }, [fetchPage, hasMore, loading, loadingOlder, messagesRef]);

  // Realtime inserts for this conversation.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat:${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on<Message>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as Message;
          if (!row?.id) return;
          void (async () => {
            const [msg] = await withSenders([row]);
            if (!mounted.current || !msg) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              let next = prev;
              if (msg.sender_id === myId) {
                // Our own message echoed back: drop the matching optimistic copy.
                const idx = prev.findIndex((m) => m.pending && m.body === msg.body);
                if (idx !== -1) next = prev.filter((_, i) => i !== idx);
              }
              return sortNewestFirst([msg, ...next]);
            });
            if (msg.sender_id !== myId) scheduleMarkRead();
          })();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, myId, withSenders, scheduleMarkRead]);

  /** Optimistically sends a message. Throws (after rolling back) if the insert fails. */
  const send = useCallback(
    async (text: string): Promise<void> => {
      const body = text.trim();
      if (!conversationId || !body) return;
      if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: ChatMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: myId,
        body,
        created_at: new Date().toISOString(),
        sender: lookupProfile(myId) ?? unknownProfile(myId),
        pending: true,
      };
      setMessages((prev) => [optimistic, ...prev]);

      const { data, error: err } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: myId, body })
        .select('*')
        .single();

      if (!mounted.current) return;
      if (err || !data) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw err ?? new Error('Message not sent.');
      }
      const saved: ChatMessage = { ...(data as Message), sender: optimistic.sender };
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId);
        if (without.some((m) => m.id === saved.id)) return without;
        return sortNewestFirst([saved, ...without]);
      });
      scheduleMarkRead();
    },
    [conversationId, myId, lookupProfile, scheduleMarkRead],
  );

  return { messages, loading, loadingOlder, hasMore, error, reload: loadInitial, loadOlder, send };
}
