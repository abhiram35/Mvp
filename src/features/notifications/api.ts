import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '../../lib/hooks';
import { errorMessage, supabase } from '../../lib/supabase';
import type { AppNotification, NotificationType } from '../../lib/types';
import { decrementUnread, refreshUnread, setUnreadCount } from './unread';

export const NOTIFICATIONS_PAGE = 30;

const TYPES: NotificationType[] = [
  'lfg_request',
  'lfg_accepted',
  'message',
  'friend_request',
  'friend_accepted',
  'community_reply',
  'community_solution',
  'rating_received',
  'moderation',
  'team_invite',
  'scrim_request',
  'scrim_update',
];

function channelName(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keeps only well-formed rows (the data column is jsonb, so be defensive). */
function normalise(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AppNotification>;
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.created_at !== 'string') return null;
  let data: unknown = r.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
    }
  }
  return {
    id: r.id,
    recipient_id: String(r.recipient_id ?? ''),
    type: TYPES.includes(r.type as NotificationType) ? (r.type as NotificationType) : 'moderation',
    title: r.title,
    body: typeof r.body === 'string' ? r.body : null,
    data: (data && typeof data === 'object' ? data : {}) as AppNotification['data'],
    read_at: typeof r.read_at === 'string' ? r.read_at : null,
    created_at: r.created_at,
  };
}

function sortNewest(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

function merge(prev: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return sortNewest(Array.from(byId.values()));
}

async function fetchPage(userId: string, before: string | null): Promise<AppNotification[]> {
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalise).filter((n): n is AppNotification => n !== null);
}

/** The signed-in player's inbox, newest first, 30 per page, live-updated. */
export function useNotifications(userId: string) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useLatestRef(items);
  const reqId = useRef(0);

  type Mode = 'initial' | 'refresh' | 'silent';

  const commitFirstPage = useCallback((id: number, mode: Mode, page: AppNotification[]) => {
    if (id !== reqId.current) return;
    // Replace the first page but keep older pages already loaded.
    setItems((prev) => {
      if (mode !== 'silent') return page;
      const oldest = page.length ? page[page.length - 1].created_at : null;
      const older = oldest ? prev.filter((n) => n.created_at < oldest) : [];
      return merge(older, page);
    });
    if (mode !== 'silent') setHasMore(page.length === NOTIFICATIONS_PAGE);
    setError(null);
    setLoading(false);
    setRefreshing(false);
    if (mode !== 'silent') void refreshUnread();
  }, []);

  const failFirstPage = useCallback((id: number, mode: Mode, e: unknown) => {
    if (id !== reqId.current) return;
    if (mode !== 'silent') setError(errorMessage(e));
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadFirst = useCallback(
    async (mode: Mode) => {
      if (!userId) return;
      const id = ++reqId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        commitFirstPage(id, mode, await fetchPage(userId, null));
      } catch (e) {
        failFirstPage(id, mode, e);
      }
    },
    [userId, commitFirstPage, failFirstPage],
  );

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore || itemsRef.current.length === 0) return;
    setLoadingMore(true);
    try {
      const last = itemsRef.current[itemsRef.current.length - 1];
      const page = await fetchPage(userId, last.created_at);
      setItems((prev) => merge(prev, page));
      setHasMore(page.length === NOTIFICATIONS_PAGE);
    } catch {
      // Keep what we have; the next scroll tries again.
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore, itemsRef]);

  useEffect(() => {
    if (!userId) return;
    const id = ++reqId.current;
    fetchPage(userId, null).then(
      (page) => commitFirstPage(id, 'initial', page),
      (e: unknown) => failFirstPage(id, 'initial', e),
    );
  }, [userId, commitFirstPage, failFirstPage]);

  // Live: new rows and collapsed message rows (UPDATE) appear without a pull.
  useEffect(() => {
    if (!userId) return;
    const upsert = (payload: { new: unknown }) => {
      const row = normalise(payload.new);
      if (row && row.recipient_id === userId) setItems((prev) => merge(prev, [row]));
    };
    const channel = supabase
      .channel(channelName(`inbox-${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, upsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, upsert)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  /** Optimistically marks one row read, then tells the server. */
  const markRead = useCallback(async (id: string) => {
    const row = itemsRef.current.find((n) => n.id === id);
    if (!row || row.read_at) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    decrementUnread();
    const { error: e } = await supabase.rpc('mark_notifications_read', { p_id: id });
    if (e) {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
    }
    void refreshUnread();
  }, [itemsRef]);

  /** Marks everything read. Returns an error message, or null on success. */
  const markAllRead = useCallback(async (): Promise<string | null> => {
    const before = itemsRef.current;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnreadCount(0);
    const { error: e } = await supabase.rpc('mark_notifications_read', { p_id: null });
    if (e) {
      setItems(before);
      void refreshUnread();
      return errorMessage(e);
    }
    void refreshUnread();
    return null;
  }, [itemsRef]);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh: () => loadFirst('refresh'),
    retry: () => loadFirst('initial'),
    reloadSilently: () => loadFirst('silent'),
    loadMore,
    markRead,
    markAllRead,
  };
}
