import { useCallback, useEffect, useRef, useState } from 'react';
import { pausedMessageFor, supabase } from '../../lib/supabase';
import type { LfgPost, LfgPostWithAuthor, LfgRequest, Profile, Region, UUID } from '../../lib/types';

// Column-name hints (`!author_id`) disambiguate the profiles join without
// depending on the exact foreign-key constraint name chosen by the backend.
const AUTHOR_SELECT = 'author:profiles!author_id(id, username, display_name, avatar_url)';
export const LFG_POST_SELECT = `*, ${AUTHOR_SELECT}`;
const REQUESTER_SELECT = 'requester:profiles!requester_id(id, username, display_name, avatar_url)';

export type ProfileLite = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type LfgRequestWithRequester = LfgRequest & { requester: ProfileLite | null };

export interface LfgFilters {
  gameId: string | null;
  region: Region | null;
  language: string | null;
}

/** Unique channel names so two mounted screens never share a channel. */
function channelName(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Board ───────────────────────────────────────────────────────────────────

export async function fetchOpenLfgPosts(filters: LfgFilters, limit = 50): Promise<LfgPostWithAuthor[]> {
  let query = supabase
    .from('lfg_posts')
    .select(LFG_POST_SELECT)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.gameId) query = query.eq('game_id', filters.gameId);
  if (filters.region) query = query.eq('region', filters.region);
  if (filters.language) query = query.eq('language', filters.language);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as LfgPostWithAuthor[];
}

/** Open, unexpired posts matching filters, newest first. */
export function useLfgPosts(filters: LfgFilters) {
  const [posts, setPosts] = useState<LfgPostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const { gameId, region, language } = filters;

  // Filters changed: show the spinner straight away (state adjusted during render).
  const filterKey = `${gameId ?? ''}|${region ?? ''}|${language ?? ''}`;
  const [activeKey, setActiveKey] = useState(filterKey);
  if (activeKey !== filterKey) {
    setActiveKey(filterKey);
    setLoading(true);
  }

  const commit = useCallback((id: number, rows: LfgPostWithAuthor[]) => {
    if (id !== requestId.current) return;
    setPosts(rows);
    setError(null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const fail = useCallback((id: number, mode: 'initial' | 'refresh' | 'silent', e: unknown) => {
    if (id !== requestId.current) return;
    // Keep showing stale posts on a failed background refresh.
    if (mode !== 'silent') setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    setLoading(false);
    setRefreshing(false);
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        commit(id, await fetchOpenLfgPosts({ gameId, region, language }));
      } catch (e) {
        fail(id, mode, e);
      }
    },
    [gameId, region, language, commit, fail],
  );

  useEffect(() => {
    const id = ++requestId.current;
    fetchOpenLfgPosts({ gameId, region, language }).then(
      (rows) => commit(id, rows),
      (e: unknown) => fail(id, 'initial', e),
    );
  }, [gameId, region, language, commit, fail]);

  return {
    posts,
    loading,
    refreshing,
    error,
    refresh: () => load('refresh'),
    reloadSilently: () => load('silent'),
    retry: () => load('initial'),
  };
}

/**
 * Counts realtime inserts on lfg_posts by other people since the last reset,
 * so the board can show a "New posts — tap to refresh" pill.
 */
export function useNewLfgPostsCount(myId: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const channel = supabase
      .channel(channelName('lfg-board'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lfg_posts' }, (payload) => {
        const row = payload.new as Partial<LfgPost>;
        if (row.author_id && row.author_id === myId) return;
        setCount((c) => c + 1);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myId]);
  return { count, reset: () => setCount(0) };
}

// ── Single post ─────────────────────────────────────────────────────────────

export async function fetchLfgPost(id: UUID): Promise<LfgPostWithAuthor | null> {
  const { data, error } = await supabase.from('lfg_posts').select(LFG_POST_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as LfgPostWithAuthor | null) ?? null;
}

export function useLfgPost(id: UUID | undefined) {
  const [post, setPost] = useState<LfgPostWithAuthor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const commit = useCallback((reqId: number, row: LfgPostWithAuthor | null) => {
    if (reqId !== requestId.current) return;
    setPost(row);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((reqId: number, silent: boolean, e: unknown) => {
    if (reqId !== requestId.current) return;
    if (!silent) setError((e as { message?: string })?.message ?? 'Something went wrong.');
    setLoading(false);
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!id) return;
      const reqId = ++requestId.current;
      if (!silent) setLoading(true);
      try {
        commit(reqId, await fetchLfgPost(id));
      } catch (e) {
        fail(reqId, silent, e);
      }
    },
    [id, commit, fail],
  );

  useEffect(() => {
    if (!id) return;
    const reqId = ++requestId.current;
    fetchLfgPost(id).then(
      (row) => commit(reqId, row),
      (e: unknown) => fail(reqId, false, e),
    );
  }, [id, commit, fail]);

  // Live status / conversation_id changes (e.g. the post fills up or the chat is created).
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(channelName(`lfg-post-${id}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lfg_posts', filter: `id=eq.${id}` }, () => {
        void load(true);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  return { post, loading: loading && !!id, error, reload: () => load(true), retry: () => load(false) };
}

export interface NewLfgPostInput {
  game_id: string;
  title: string;
  description: string | null;
  rank: string | null;
  region: Region;
  language: string;
  slots_needed: number;
  mic_required: boolean;
  durationHours: number;
}

export async function createLfgPost(authorId: UUID, input: NewLfgPostInput): Promise<UUID> {
  const { durationHours, ...rest } = input;
  const expires_at = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('lfg_posts')
    .insert({ ...rest, author_id: authorId, expires_at })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: UUID }).id;
}

export async function closeLfgPost(id: UUID): Promise<void> {
  const { error } = await supabase.from('lfg_posts').update({ status: 'closed' }).eq('id', id);
  if (error) throw error;
}

export async function deleteLfgPost(id: UUID): Promise<void> {
  const { error } = await supabase.from('lfg_posts').delete().eq('id', id);
  if (error) throw error;
}

// ── Join requests ───────────────────────────────────────────────────────────

/** All requests for a post (author view), live-updated. Pass enabled=false for non-authors. */
async function fetchLfgRequests(postId: UUID): Promise<LfgRequestWithRequester[]> {
  const { data, error } = await supabase
    .from('lfg_requests')
    .select(`*, ${REQUESTER_SELECT}`)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LfgRequestWithRequester[];
}

export function useLfgRequests(postId: UUID | undefined, enabled: boolean) {
  const [requests, setRequests] = useState<LfgRequestWithRequester[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const active = !!postId && enabled;

  // Became enabled (e.g. the post loaded and I'm its author): spinner until the first load.
  const key = `${postId ?? ''}|${active}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setLoading(active);
  }

  const commit = useCallback((rows: LfgRequestWithRequester[]) => {
    setRequests(rows);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((e: unknown) => {
    setError((e as { message?: string })?.message ?? 'Something went wrong.');
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    if (!postId || !enabled) return;
    try {
      commit(await fetchLfgRequests(postId));
    } catch (e) {
      fail(e);
    }
  }, [postId, enabled, commit, fail]);

  useEffect(() => {
    if (!postId || !enabled) return;
    fetchLfgRequests(postId).then(commit, fail);
  }, [postId, enabled, commit, fail]);

  useEffect(() => {
    if (!postId || !enabled) return;
    const channel = supabase
      .channel(channelName(`lfg-requests-${postId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lfg_requests', filter: `post_id=eq.${postId}` }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [postId, enabled, load]);

  return { requests, loading: loading && active, error, reload: load };
}

/** The current user's own request for a post (requester view), live-updated. */
async function fetchMyLfgRequest(postId: UUID, myId: UUID): Promise<LfgRequest | null> {
  const { data, error } = await supabase
    .from('lfg_requests')
    .select('*')
    .eq('post_id', postId)
    .eq('requester_id', myId)
    .maybeSingle();
  if (error) throw error;
  return (data as LfgRequest | null) ?? null;
}

export function useMyLfgRequest(postId: UUID | undefined, myId: UUID, enabled: boolean) {
  const [request, setRequest] = useState<LfgRequest | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const active = !!postId && !!myId && enabled;

  const key = `${postId ?? ''}|${myId}|${active}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setLoading(active);
  }

  const commit = useCallback((row: LfgRequest | null) => {
    setRequest(row);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((e: unknown) => {
    setError((e as { message?: string })?.message ?? 'Something went wrong.');
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    if (!postId || !myId || !enabled) return;
    try {
      commit(await fetchMyLfgRequest(postId, myId));
    } catch (e) {
      fail(e);
    }
  }, [postId, myId, enabled, commit, fail]);

  useEffect(() => {
    if (!postId || !myId || !enabled) return;
    fetchMyLfgRequest(postId, myId).then(commit, fail);
  }, [postId, myId, enabled, commit, fail]);

  useEffect(() => {
    if (!postId || !myId || !enabled) return;
    const channel = supabase
      .channel(channelName(`lfg-my-request-${postId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lfg_requests', filter: `post_id=eq.${postId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<LfgRequest>;
        if (!row.requester_id || row.requester_id === myId) void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [postId, myId, enabled, load]);

  return { request, loading: loading && active, error, reload: load };
}

export async function requestToJoin(postId: UUID, requesterId: UUID, message: string | null): Promise<void> {
  const { error } = await supabase.from('lfg_requests').insert({ post_id: postId, requester_id: requesterId, message });
  // 23505 = unique violation: a request already exists; the caller just reloads.
  if (!error || error.code === '23505') return;
  // 42501 = RLS rejected it: post closed/expired, your own post, or a block between you.
  if (error.code === '42501') throw new Error(pausedMessageFor(error) ?? "This squad isn't taking your request right now.");
  throw error;
}

/** Accepts a request; returns the squad conversation id. */
export async function acceptLfgRequest(requestId: UUID): Promise<UUID> {
  const { data, error } = await supabase.rpc('accept_lfg_request', { request_id: requestId });
  if (error) throw error;
  return String(data);
}

export async function declineLfgRequest(requestId: UUID): Promise<void> {
  const { error } = await supabase.from('lfg_requests').update({ status: 'declined' }).eq('id', requestId);
  if (error) throw error;
}

/** Requesters may withdraw their own pending request. */
export async function cancelLfgRequest(requestId: UUID): Promise<void> {
  const { error } = await supabase.from('lfg_requests').delete().eq('id', requestId).eq('status', 'pending');
  if (error) throw error;
}
