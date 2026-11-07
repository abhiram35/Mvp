// Community (takes + questions) data access.
// Counters (gg_count, reply_count), solved_reply_id and last_activity_at are maintained
// by the server: this file never writes them directly — only through the RPCs.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  CommunityPost,
  CommunityPostKind,
  CommunityPostSummary,
  CommunityReply,
  CommunityReplyItem,
  CommunitySort,
  GgToggleResult,
  UUID,
} from '../../lib/types';
import { useBlockedIds } from '../safety/blocks';

export const FEED_PAGE_SIZE = 20;
const REPLIES_PAGE_SIZE = 50;

type AuthorLite = CommunityPostSummary['author'];

// ── Normalising RPC results ─────────────────────────────────────────────────
// `returns setof jsonb` / composite rows can arrive as plain objects, as JSON strings,
// or wrapped in a single column (e.g. { list_community_posts: {...} }).

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isObject(v) ? v : null;
}

/** Unwraps a single-jsonb-column row when the expected key is missing. */
function unwrap(raw: unknown, expectedKey: string): Record<string, unknown> | null {
  let row = asObject(raw);
  if (!row) return null;
  if (!(expectedKey in row)) {
    const values = Object.values(row);
    if (values.length === 1) row = asObject(values[0]);
  }
  return row;
}

function toList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  return data == null ? [] : [data];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function normaliseAuthor(raw: unknown, fallbackId: string): AuthorLite {
  const a = asObject(raw);
  return {
    id: str(a?.id, fallbackId),
    username: str(a?.username),
    display_name: str(a?.display_name) || str(a?.username) || 'Player',
    avatar_url: typeof a?.avatar_url === 'string' ? a.avatar_url : null,
  };
}

function normalisePost(raw: unknown): CommunityPost | null {
  const p = asObject(raw);
  if (!p || typeof p.id !== 'string') return null;
  return {
    id: p.id,
    author_id: str(p.author_id),
    kind: p.kind === 'question' ? 'question' : 'take',
    game_id: typeof p.game_id === 'string' && p.game_id ? p.game_id : null,
    title: str(p.title),
    body: str(p.body),
    solved_reply_id: typeof p.solved_reply_id === 'string' ? p.solved_reply_id : null,
    gg_count: num(p.gg_count),
    reply_count: num(p.reply_count),
    last_activity_at: str(p.last_activity_at) || str(p.created_at),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at) || str(p.created_at),
  };
}

function normaliseSummary(raw: unknown): CommunityPostSummary | null {
  const row = unwrap(raw, 'post');
  if (!row) return null;
  const post = normalisePost(row.post);
  if (!post) return null;
  return {
    post,
    author: normaliseAuthor(row.author, post.author_id),
    has_gg: row.has_gg === true,
    is_solved: row.is_solved === true || (post.kind === 'question' && post.solved_reply_id !== null),
  };
}

function normaliseReply(raw: unknown): CommunityReply | null {
  const r = asObject(raw);
  if (!r || typeof r.id !== 'string') return null;
  return {
    id: r.id,
    post_id: str(r.post_id),
    author_id: str(r.author_id),
    body: str(r.body),
    gg_count: num(r.gg_count),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at) || str(r.created_at),
  };
}

function normaliseReplyItem(raw: unknown): CommunityReplyItem | null {
  const row = unwrap(raw, 'reply');
  if (!row) return null;
  const reply = normaliseReply(row.reply);
  if (!reply) return null;
  return {
    reply,
    author: normaliseAuthor(row.author, reply.author_id),
    has_gg: row.has_gg === true,
    is_solution: row.is_solution === true,
  };
}

export function normalisePostSummaries(data: unknown): CommunityPostSummary[] {
  return toList(data).map(normaliseSummary).filter((s): s is CommunityPostSummary => s !== null);
}

export function normaliseReplyItems(data: unknown): CommunityReplyItem[] {
  return toList(data).map(normaliseReplyItem).filter((r): r is CommunityReplyItem => r !== null);
}

function normaliseGgResult(data: unknown): GgToggleResult | null {
  const row = unwrap(toList(data)[0], 'has_gg');
  if (!row || typeof row.has_gg !== 'boolean') return null;
  return { has_gg: row.has_gg, gg_count: num(row.gg_count) };
}

function messageOf(e: unknown): string {
  return (e as { message?: string })?.message ?? 'Something went wrong. Please try again.';
}

function errorCode(e: unknown): string | null {
  const code = (e as { code?: unknown })?.code;
  return typeof code === 'string' ? code : null;
}

/** The server's "Post not found" / "Reply not found" (P0002). */
export function isNotFoundError(e: unknown): boolean {
  return errorCode(e) === 'P0002';
}

/** "You cannot GG your own post/reply" (22023). */
export function isOwnGgError(e: unknown): boolean {
  return errorCode(e) === '22023';
}

/** Short, user-safe message for community errors. */
export function communityErrorMessage(e: unknown): string {
  switch (errorCode(e)) {
    case 'P0002':
      return 'This was deleted or is no longer available.';
    case '42501':
      return 'Only the author can choose the answer.';
    default:
      return messageOf(e);
  }
}

/** updated_at later than created_at means the author edited it. */
export function wasEdited(row: { created_at: string; updated_at: string }): boolean {
  const c = new Date(row.created_at).getTime();
  const u = new Date(row.updated_at).getTime();
  return Number.isFinite(c) && Number.isFinite(u) && u - c > 1000;
}

/** Unique channel names so two mounted screens never share a channel. */
function channelName(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You need to be signed in.');
  return id;
}

// ── GG state (shared, optimistic) ───────────────────────────────────────────
// Optimistic GG values live in a tiny store so the feed and the thread agree while a
// toggle is in flight. Settled values are dropped once fresh server data arrives.

export type GgTarget = 'post' | 'reply';
export interface GgState {
  has_gg: boolean;
  gg_count: number;
}
interface GgEntry {
  value: GgState;
  pending: boolean;
}

const ggEntries = new Map<string, GgEntry>();
const ggListeners = new Set<() => void>();
const ggKey = (kind: GgTarget, id: string) => `${kind}:${id}`;

function emitGg() {
  ggListeners.forEach((l) => l());
}

function subscribeGg(listener: () => void) {
  ggListeners.add(listener);
  return () => {
    ggListeners.delete(listener);
  };
}

/** Forget settled optimistic values for rows that were just re-fetched from the server. */
function clearSettledGg(kind: GgTarget, ids: string[]) {
  let changed = false;
  for (const id of ids) {
    const key = ggKey(kind, id);
    const entry = ggEntries.get(key);
    if (entry && !entry.pending) {
      ggEntries.delete(key);
      changed = true;
    }
  }
  if (changed) emitGg();
}

/** The GG state to show: the optimistic / just-toggled value if any, else the server row. */
export function useGgState(kind: GgTarget, id: string, base: GgState): GgState & { pending: boolean } {
  const key = ggKey(kind, id);
  const entry = useSyncExternalStore(
    subscribeGg,
    () => ggEntries.get(key),
    () => ggEntries.get(key),
  );
  return entry ? { ...entry.value, pending: entry.pending } : { ...base, pending: false };
}

/**
 * Gives or takes back the caller's GG. Updates the UI immediately and rolls back if the
 * server refuses. `current` is what the UI shows right now. Throws on failure.
 */
export async function toggleGg(kind: GgTarget, id: UUID, current: GgState): Promise<GgState> {
  const key = ggKey(kind, id);
  const previous = ggEntries.get(key);
  if (previous?.pending) return previous.value; // ignore double taps
  const optimistic: GgState = {
    has_gg: !current.has_gg,
    gg_count: Math.max(0, current.gg_count + (current.has_gg ? -1 : 1)),
  };
  ggEntries.set(key, { value: optimistic, pending: true });
  emitGg();
  try {
    const { data, error } =
      kind === 'post'
        ? await supabase.rpc('toggle_post_gg', { p_post_id: id })
        : await supabase.rpc('toggle_reply_gg', { p_reply_id: id });
    if (error) throw error;
    const result = normaliseGgResult(data) ?? optimistic;
    ggEntries.set(key, { value: result, pending: false });
    emitGg();
    return result;
  } catch (e) {
    if (previous) ggEntries.set(key, previous);
    else ggEntries.delete(key);
    emitGg();
    throw e;
  }
}

// ── Feed ────────────────────────────────────────────────────────────────────

export interface CommunityFeedParams {
  sort: CommunitySort;
  kind: CommunityPostKind | null;
  gameId: string | null;
  /** Free text; blank = no search. */
  search: string | null;
}

export async function fetchCommunityPosts(params: CommunityFeedParams, offset = 0, limit = FEED_PAGE_SIZE): Promise<CommunityPostSummary[]> {
  const search = params.search?.trim() ? params.search.trim() : null;
  const { data, error } = await supabase.rpc('list_community_posts', {
    p_sort: params.sort,
    p_kind: params.kind,
    p_game_id: params.gameId,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const rows = normalisePostSummaries(data);
  clearSettledGg(
    'post',
    rows.map((r) => r.post.id),
  );
  return rows;
}

/** Paged community feed. Hides posts by players I blocked (the server also hides both directions). */
export function useCommunityFeed({ sort, kind, gameId, search }: CommunityFeedParams) {
  const { blockedIds } = useBlockedIds();
  const [items, setItems] = useState<CommunityPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const offset = useRef(0);
  const loadingMoreRef = useRef(false);
  const searchKey = search?.trim() || null;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const gen = ++generation.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      if (mode === 'initial') {
        setLoading(true);
        setItems([]);
        setError(null);
      }
      if (mode === 'refresh') setRefreshing(true);
      try {
        const rows = await fetchCommunityPosts({ sort, kind, gameId, search: searchKey }, 0);
        if (gen !== generation.current) return;
        setItems(rows);
        offset.current = rows.length;
        setHasMore(rows.length >= FEED_PAGE_SIZE);
        setError(null);
        setLoadMoreError(null);
      } catch (e) {
        if (gen !== generation.current) return;
        // Keep stale rows on a failed background refresh.
        if (mode !== 'silent') setError(messageOf(e));
      } finally {
        if (gen === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [sort, kind, gameId, searchKey],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || loading || refreshing) return;
    const gen = generation.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const rows = await fetchCommunityPosts({ sort, kind, gameId, search: searchKey }, offset.current);
      if (gen !== generation.current) return;
      offset.current += rows.length;
      setHasMore(rows.length >= FEED_PAGE_SIZE);
      setLoadMoreError(null);
      // Hot ordering can shift between pages: skip anything already shown.
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.post.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.post.id))];
      });
    } catch (e) {
      if (gen === generation.current) setLoadMoreError(messageOf(e));
    } finally {
      if (gen === generation.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, loading, refreshing, sort, kind, gameId, searchKey]);

  const posts = useMemo(() => items.filter((p) => !blockedIds.has(p.post.author_id)), [items, blockedIds]);

  return {
    posts,
    loading,
    refreshing,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    empty: !loading && !error && posts.length === 0,
    refresh: () => load('refresh'),
    reloadSilently: () => load('silent'),
    retry: () => load('initial'),
    loadMore,
  };
}

// ── Single post ─────────────────────────────────────────────────────────────

export async function fetchCommunityPost(id: UUID): Promise<CommunityPostSummary | null> {
  const { data, error } = await supabase.rpc('get_community_post', { p_post_id: id });
  if (error) throw error;
  const row = normalisePostSummaries(data)[0] ?? null;
  if (row) clearSettledGg('post', [row.post.id]);
  return row;
}

/** One post, or null when it's missing / hidden / by a player I blocked. */
export function useCommunityPost(id: UUID | undefined) {
  const { blockedIds } = useBlockedIds();
  const [summary, setSummary] = useState<CommunityPostSummary | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(
    async (silent = false) => {
      const reqId = ++requestId.current;
      if (!id) {
        setSummary(null);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const row = await fetchCommunityPost(id);
        if (reqId !== requestId.current) return;
        setSummary(row);
        setError(null);
      } catch (e) {
        if (reqId !== requestId.current) return;
        if (isNotFoundError(e)) {
          // Deleted / hidden: show the not-found state rather than an error.
          setSummary(null);
          setError(null);
        } else if (!silent) setError(communityErrorMessage(e));
      } finally {
        if (reqId === requestId.current) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = summary && !blockedIds.has(summary.post.author_id) ? summary : null;
  return { summary: visible, loading, error, reload };
}

// ── Replies ─────────────────────────────────────────────────────────────────

export async function fetchCommunityReplies(postId: UUID, offset = 0, limit = REPLIES_PAGE_SIZE): Promise<CommunityReplyItem[]> {
  const { data, error } = await supabase.rpc('list_community_replies', { p_post_id: postId, p_limit: limit, p_offset: offset });
  if (error) throw error;
  const rows = normaliseReplyItems(data);
  clearSettledGg(
    'reply',
    rows.map((r) => r.reply.id),
  );
  return rows;
}

/** Solution first, then oldest first (the server already orders like this; keep it stable client-side). */
function orderReplies(list: CommunityReplyItem[]): CommunityReplyItem[] {
  const seen = new Set<string>();
  const unique = list.filter((r) => (seen.has(r.reply.id) ? false : (seen.add(r.reply.id), true)));
  const solution = unique.filter((r) => r.is_solution);
  const rest = unique.filter((r) => !r.is_solution);
  return [...solution, ...rest];
}

/**
 * Replies for a post, live: new / deleted replies (from anyone) trigger a re-fetch.
 * `onChange` runs after each realtime-driven re-fetch (e.g. to refresh the post's counts).
 */
export function useCommunityReplies(postId: UUID | undefined, onChange?: () => void) {
  const { blockedIds } = useBlockedIds();
  const [items, setItems] = useState<CommunityReplyItem[]>([]);
  const [loading, setLoading] = useState(!!postId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const loadedCount = useRef(0);
  const itemsRef = useRef<CommunityReplyItem[]>([]);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** (Re)loads everything shown so far, in one request. */
  const reload = useCallback(
    async (silent = false) => {
      const gen = ++generation.current;
      if (!postId) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const limit = Math.max(REPLIES_PAGE_SIZE, loadedCount.current + 5);
        const rows = await fetchCommunityReplies(postId, 0, limit);
        if (gen !== generation.current) return;
        loadedCount.current = rows.length;
        setHasMore(rows.length >= limit);
        setItems(orderReplies(rows));
        setError(null);
      } catch (e) {
        if (gen !== generation.current) return;
        if (!silent) setError(messageOf(e));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    loadedCount.current = 0;
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!postId || loadingMore || !hasMore || loading) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const rows = await fetchCommunityReplies(postId, loadedCount.current, REPLIES_PAGE_SIZE);
      if (gen !== generation.current) return;
      loadedCount.current += rows.length;
      setHasMore(rows.length >= REPLIES_PAGE_SIZE);
      setItems((prev) => orderReplies([...prev, ...rows]));
    } catch {
      // Leave hasMore as is; the next scroll retries.
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }, [postId, loadingMore, hasMore, loading]);

  // Realtime: INSERT is filtered by post_id. DELETE payloads usually only carry the
  // primary key, so DELETE is unfiltered and matched against the replies we show.
  useEffect(() => {
    if (!postId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void reload(true).then(() => onChangeRef.current?.());
      }, 250);
    };
    const channel = supabase
      .channel(channelName(`community-replies-${postId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_replies', filter: `post_id=eq.${postId}` },
        schedule,
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_replies' }, (payload) => {
        const old = payload.old as Partial<CommunityReply> | undefined;
        if (old?.post_id === postId || (old?.id && itemsRef.current.some((r) => r.reply.id === old.id))) schedule();
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [postId, reload]);

  const replies = useMemo(() => items.filter((r) => !blockedIds.has(r.reply.author_id)), [items, blockedIds]);

  return { replies, loading, loadingMore, error, hasMore, reload, loadMore };
}

// ── Writes ──────────────────────────────────────────────────────────────────

export interface NewCommunityPost {
  kind: CommunityPostKind;
  game_id: string | null;
  title: string;
  body: string;
}

/** Creates a post and returns its id. */
export async function createPost(input: NewCommunityPost): Promise<UUID> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('community_posts')
    .insert({ author_id: me, kind: input.kind, game_id: input.game_id, title: input.title, body: input.body })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: UUID }).id;
}

/** Edits a post's title, body or game. The kind can't change. */
export async function updatePost(id: UUID, patch: Partial<Pick<CommunityPost, 'title' | 'body' | 'game_id'>>): Promise<void> {
  const clean: Partial<Pick<CommunityPost, 'title' | 'body' | 'game_id'>> = {};
  if (patch.title !== undefined) clean.title = patch.title;
  if (patch.body !== undefined) clean.body = patch.body;
  if (patch.game_id !== undefined) clean.game_id = patch.game_id;
  const { error } = await supabase.from('community_posts').update(clean).eq('id', id);
  if (error) throw error;
}

export async function deletePost(id: UUID): Promise<void> {
  const { error } = await supabase.from('community_posts').delete().eq('id', id);
  if (error) throw error;
}

export async function createReply(postId: UUID, body: string): Promise<UUID> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('community_replies')
    .insert({ post_id: postId, author_id: me, body })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: UUID }).id;
}

/** Deletes a reply (my own, or any reply on my post — enforced by RLS). */
export async function deleteReply(id: UUID): Promise<void> {
  const { error } = await supabase.from('community_replies').delete().eq('id', id);
  if (error) throw error;
}

/** Post author marks a reply on their question as the solution, or clears it with null. */
export async function setSolution(postId: UUID, replyId: UUID | null): Promise<void> {
  const { error } = await supabase.rpc('set_solution', { p_post_id: postId, p_reply_id: replyId });
  if (error) throw error;
}
