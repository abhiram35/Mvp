// Clips data access (docs/CLIPS_AND_PARTY.md, migration 0017). All writes go through RPCs;
// counters (gg_count, comment_count) are maintained by the server.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, Share } from 'react-native';
import { useLatestRef } from '../../lib/hooks';
import { errorMessage, supabase } from '../../lib/supabase';
import { useUserId } from '../../providers/AuthProvider';
import { useBlockedIds } from '../safety/blocks';
import { friendlyClipError, PLATFORM_LABELS } from './logic';
import type { Clip, ClipAuthor, ClipComment, ClipFeed, ClipGgResult, ClipPlatform } from './types';

export const CLIP_PAGE_SIZE = 10;
const COMMENTS_LIMIT = 200;
const AUTHOR_SELECT = 'author:profiles!author_id(id, username, display_name, avatar_url)';

/** Readable copy for any clip / comment / party error. */
export function clipErrorMessage(err: unknown): string {
  const raw = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : null;
  return friendlyClipError(raw) ?? errorMessage(err);
}

// ── Normalising rows ────────────────────────────────────────────────────────
// `returns setof jsonb` rows can arrive as objects, JSON strings, or wrapped in one column.

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asObject(v: unknown): Obj | null {
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

function unwrap(raw: unknown, expectedKey: string): Obj | null {
  let row = asObject(raw);
  if (!row) return null;
  if (!(expectedKey in row)) {
    const values = Object.values(row);
    if (values.length === 1) row = asObject(values[0]);
  }
  return row;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

function normaliseAuthor(raw: unknown, fallbackId: string): ClipAuthor {
  const a = asObject(Array.isArray(raw) ? raw[0] : raw);
  return {
    id: str(a?.id, fallbackId),
    username: str(a?.username),
    display_name: str(a?.display_name) || str(a?.username) || 'Player',
    avatar_url: strOrNull(a?.avatar_url),
  };
}

const PLATFORMS: readonly ClipPlatform[] = ['youtube', 'twitch', 'medal'];

export function normaliseClip(raw: unknown, myGg?: boolean): Clip | null {
  const c = unwrap(raw, 'id');
  if (!c || typeof c.id !== 'string' || typeof c.url !== 'string') return null;
  if (c.removed_at) return null;
  const platform = PLATFORMS.includes(c.platform as ClipPlatform) ? (c.platform as ClipPlatform) : null;
  if (!platform) return null;
  const authorId = str(c.author_id);
  return {
    id: c.id,
    author_id: authorId,
    game_id: strOrNull(c.game_id),
    url: c.url,
    platform,
    video_id: str(c.video_id),
    title: str(c.title, 'Clip'),
    caption: strOrNull(c.caption),
    tournament_id: strOrNull(c.tournament_id),
    gg_count: num(c.gg_count),
    comment_count: num(c.comment_count),
    created_at: str(c.created_at, new Date().toISOString()),
    author: normaliseAuthor(c.author, authorId),
    my_gg: myGg ?? c.my_gg === true,
  };
}

function normaliseComment(raw: unknown): ClipComment | null {
  const c = asObject(raw);
  if (!c || typeof c.id !== 'string') return null;
  const authorId = str(c.author_id);
  return {
    id: c.id,
    clip_id: str(c.clip_id),
    author_id: authorId,
    body: str(c.body),
    created_at: str(c.created_at, new Date().toISOString()),
    author: normaliseAuthor(c.author, authorId),
  };
}

// ── Local overrides store ───────────────────────────────────────────────────
// One place for optimistic GG state, comment counts and deletions, so the feed and the
// single-clip screen always agree without refetching.

interface ClipOverride {
  my_gg?: boolean;
  gg_count?: number;
  comment_count?: number;
  deleted?: boolean;
}

let overrides = new Map<string, ClipOverride>();
/** Separate snapshot so lists only re-filter when something was actually deleted. */
let deletedIds: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();
const ggInFlight = new Set<string>();

function setOverride(id: string, patch: ClipOverride) {
  const next = new Map(overrides);
  next.set(id, { ...overrides.get(id), ...patch });
  overrides = next;
  if (patch.deleted && !deletedIds.has(id)) deletedIds = new Set([...deletedIds, id]);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getOverrides = () => overrides;

/** Fresh server data wins: drop local overrides for these clips (after a refetch). */
function clearOverrides(ids: string[]) {
  let changed = false;
  const next = new Map(overrides);
  for (const id of ids) {
    const o = next.get(id);
    if (o && !o.deleted && !ggInFlight.has(id)) {
      next.delete(id);
      changed = true;
    }
  }
  if (changed) {
    overrides = next;
    listeners.forEach((l) => l());
  }
}

/** A clip with local changes (GG, comments, deletion) applied; null when deleted. */
export function useLiveClip(clip: Clip): Clip | null;
export function useLiveClip(clip: Clip | null): Clip | null;
export function useLiveClip(clip: Clip | null): Clip | null {
  const map = useSyncExternalStore(subscribe, getOverrides, getOverrides);
  if (!clip) return null;
  const o = map.get(clip.id);
  if (!o) return clip;
  if (o.deleted) return null;
  return {
    ...clip,
    my_gg: o.my_gg ?? clip.my_gg,
    gg_count: o.gg_count ?? clip.gg_count,
    comment_count: o.comment_count ?? clip.comment_count,
  };
}

/** Ids of clips deleted in this session (to drop them from lists). */
const getDeletedIds = () => deletedIds;
export function useDeletedClipIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getDeletedIds, getDeletedIds);
}

// ── GG ──────────────────────────────────────────────────────────────────────

/**
 * Optimistic GG toggle: flips the state at once, then settles on the server's answer, or rolls
 * back and throws. Returns null when a toggle for this clip is already in flight (tap spam).
 */
export async function toggleClipGg(clip: Pick<Clip, 'id' | 'my_gg' | 'gg_count'>): Promise<ClipGgResult | null> {
  if (ggInFlight.has(clip.id)) return null;
  ggInFlight.add(clip.id);
  const before = { my_gg: clip.my_gg, gg_count: clip.gg_count };
  const optimistic = { my_gg: !clip.my_gg, gg_count: Math.max(0, clip.gg_count + (clip.my_gg ? -1 : 1)) };
  setOverride(clip.id, optimistic);
  try {
    const { data, error } = await supabase.rpc('toggle_clip_gg', { p_clip_id: clip.id });
    if (error) throw error;
    const row = unwrap(Array.isArray(data) ? data[0] : data, 'gg');
    const result: ClipGgResult = row
      ? { gg: row.gg === true, gg_count: num(row.gg_count) }
      : { gg: optimistic.my_gg, gg_count: optimistic.gg_count };
    setOverride(clip.id, { my_gg: result.gg, gg_count: result.gg_count });
    return result;
  } catch (e) {
    setOverride(clip.id, before);
    throw e;
  } finally {
    ggInFlight.delete(clip.id);
  }
}

// ── Feed ────────────────────────────────────────────────────────────────────

export async function fetchClipFeed(feed: ClipFeed, offset: number, gameId: string | null = null, limit = CLIP_PAGE_SIZE): Promise<Clip[]> {
  const { data, error } = await supabase.rpc('get_clip_feed', { p_feed: feed, p_game_id: gameId, p_limit: limit, p_offset: offset });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  return rows.map((r) => normaliseClip(r)).filter((c): c is Clip => !!c);
}

interface FeedState {
  clips: Clip[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** A load-more failure (the list stays; shown as a small notice). */
  moreError: string | null;
}

const INITIAL: FeedState = { clips: [], loading: true, refreshing: false, loadingMore: false, hasMore: true, error: null, moreError: null };

/** One feed tab, paged by offset. Blocked authors and clips deleted here are filtered out. */
export function useClipFeed(feed: ClipFeed, gameId: string | null = null) {
  const [state, setState] = useState<FeedState>(INITIAL);
  const { blockedIds } = useBlockedIds();
  const deleted = useDeletedClipIds();
  const requestId = useRef(0);
  const stateRef = useLatestRef(state);

  const loadFirst = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      setState((s) => (mode === 'refresh' ? { ...s, refreshing: true, moreError: null } : { ...INITIAL }));
      try {
        const page = await fetchClipFeed(feed, 0, gameId);
        if (id !== requestId.current) return;
        clearOverrides(page.map((c) => c.id));
        setState({ ...INITIAL, loading: false, clips: page, hasMore: page.length >= CLIP_PAGE_SIZE });
      } catch (e) {
        if (id !== requestId.current) return;
        setState((s) => ({ ...s, loading: false, refreshing: false, error: s.clips.length ? null : clipErrorMessage(e), moreError: s.clips.length ? clipErrorMessage(e) : null }));
      }
    },
    [feed, gameId],
  );

  useEffect(() => {
    void loadFirst('initial');
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    const s = stateRef.current;
    if (s.loading || s.refreshing || s.loadingMore || !s.hasMore || s.error) return;
    const id = requestId.current;
    setState((p) => ({ ...p, loadingMore: true, moreError: null }));
    try {
      const page = await fetchClipFeed(feed, s.clips.length, gameId);
      if (id !== requestId.current) return;
      setState((p) => {
        const seen = new Set(p.clips.map((c) => c.id));
        const fresh = page.filter((c) => !seen.has(c.id));
        return { ...p, loadingMore: false, clips: [...p.clips, ...fresh], hasMore: page.length >= CLIP_PAGE_SIZE };
      });
    } catch (e) {
      if (id !== requestId.current) return;
      setState((p) => ({ ...p, loadingMore: false, moreError: clipErrorMessage(e) }));
    }
  }, [feed, gameId, stateRef]);

  const clips = useMemo(
    () => state.clips.filter((c) => !blockedIds.has(c.author_id) && !deleted.has(c.id)),
    [state.clips, blockedIds, deleted],
  );

  return {
    ...state,
    clips,
    refresh: useCallback(() => loadFirst('refresh'), [loadFirst]),
    retry: useCallback(() => loadFirst('initial'), [loadFirst]),
    loadMore,
  };
}

// ── Single clip ─────────────────────────────────────────────────────────────

export async function fetchClip(id: string, myId: string | null): Promise<Clip | null> {
  const [clipRes, ggRes] = await Promise.all([
    supabase.from('clips').select(`*, ${AUTHOR_SELECT}`).eq('id', id).is('removed_at', null).maybeSingle(),
    myId
      ? supabase.from('clip_ggs').select('clip_id').eq('clip_id', id).eq('profile_id', myId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (clipRes.error) throw clipRes.error;
  return normaliseClip(clipRes.data, !!ggRes.data);
}

export function useClip(id: string | undefined) {
  const myId = useUserId();
  const key = `${id ?? ''}:${myId ?? ''}`;
  const [res, setRes] = useState<{ key: string; clip: Clip | null; error: string | null } | null>(null);
  const [reloading, setReloading] = useState(false);
  const reqId = useRef(0);

  const fetchIt = useCallback(() => {
    const rid = ++reqId.current;
    return (id ? fetchClip(id, myId) : Promise.resolve(null)).then(
      (c) => {
        if (rid !== reqId.current) return;
        if (c) clearOverrides([c.id]);
        setRes({ key, clip: c, error: null });
        setReloading(false);
      },
      (e: unknown) => {
        if (rid !== reqId.current) return;
        setRes({ key, clip: null, error: clipErrorMessage(e) });
        setReloading(false);
      },
    );
  }, [id, myId, key]);

  useEffect(() => {
    void fetchIt();
  }, [fetchIt]);

  const reload = useCallback(() => {
    setReloading(true);
    return fetchIt();
  }, [fetchIt]);

  const current = res && res.key === key ? res : null;
  const clip = useLiveClip(current?.clip ?? null);
  return { clip, loading: !current || reloading, error: current?.error ?? null, reload };
}

// ── Post / delete ───────────────────────────────────────────────────────────

export async function postClip(input: { url: string; gameId: string; title: string; caption: string | null; tournamentId?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('post_clip', {
    p_url: input.url.trim(),
    p_game_id: input.gameId,
    p_title: input.title.trim(),
    p_caption: input.caption?.trim() ? input.caption.trim() : null,
    p_tournament_id: input.tournamentId ?? null,
  });
  if (error) throw error;
  const id = typeof data === 'string' ? data : Array.isArray(data) ? String(data[0] ?? '') : '';
  if (!id) throw new Error('The clip was not saved. Please try again.');
  return id;
}

export async function deleteClip(clipId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_clip', { p_clip_id: clipId });
  if (error) throw error;
  setOverride(clipId, { deleted: true });
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function fetchClipComments(clipId: string): Promise<ClipComment[]> {
  const { data, error } = await supabase
    .from('clip_comments')
    .select(`id, clip_id, author_id, body, created_at, ${AUTHOR_SELECT}`)
    .eq('clip_id', clipId)
    .is('removed_at', null)
    .order('created_at', { ascending: true })
    .limit(COMMENTS_LIMIT);
  if (error) throw error;
  return (data ?? []).map(normaliseComment).filter((c): c is ClipComment => !!c);
}

/** Comments of one clip (oldest first). `enabled` lets a closed sheet skip the fetch. */
export function useClipComments(clipId: string | null, enabled = true) {
  const { blockedIds } = useBlockedIds();
  const [res, setRes] = useState<{ key: string; comments: ClipComment[]; error: string | null } | null>(null);
  const reqId = useRef(0);

  const load = useCallback(() => {
    if (!clipId || !enabled) return Promise.resolve();
    const rid = ++reqId.current;
    return fetchClipComments(clipId).then(
      (rows) => {
        if (rid === reqId.current) setRes({ key: clipId, comments: rows, error: null });
      },
      (e: unknown) => {
        if (rid === reqId.current) setRes((r) => ({ key: clipId, comments: r?.key === clipId ? r.comments : [], error: clipErrorMessage(e) }));
      },
    );
  }, [clipId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = res && res.key === clipId ? res : null;
  const all = current?.comments;
  const comments = useMemo(() => (all ?? []).filter((c) => !blockedIds.has(c.author_id)), [all, blockedIds]);
  return { comments, loading: enabled && !current, error: current?.error ?? null, reload: load };
}

export async function addClipComment(clip: Pick<Clip, 'id' | 'comment_count'>, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('add_clip_comment', { p_clip_id: clip.id, p_body: body.trim() });
  if (error) throw error;
  setOverride(clip.id, { comment_count: clip.comment_count + 1 });
  return typeof data === 'string' ? data : String(data ?? '');
}

export async function deleteClipComment(clip: Pick<Clip, 'id' | 'comment_count'>, commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_clip_comment', { p_comment_id: commentId });
  if (error) throw error;
  setOverride(clip.id, { comment_count: Math.max(0, clip.comment_count - 1) });
}

// ── Party + share ───────────────────────────────────────────────────────────

/** Invites a player to my party (creates the party if I have none). Returns the invite id. */
export async function inviteToParty(profileId: string): Promise<string> {
  const { data, error } = await supabase.rpc('invite_to_party', { p_profile_id: profileId });
  if (error) throw error;
  return typeof data === 'string' ? data : String(data ?? '');
}

/** Native share sheet with the clip's link. Resolves false when the player dismissed it. */
export async function shareClip(clip: Pick<Clip, 'title' | 'url' | 'platform'>): Promise<boolean> {
  const text = `${clip.title} (${PLATFORM_LABELS[clip.platform]} clip, shared on Vinq)`;
  // iOS shows `url` as its own attachment; Android only reads `message`.
  const content = Platform.OS === 'ios' ? { message: text, url: clip.url } : { message: `${text}\n${clip.url}`, title: clip.title };
  const res = await Share.share(content, { dialogTitle: 'Share clip' });
  return res.action !== Share.dismissedAction;
}
