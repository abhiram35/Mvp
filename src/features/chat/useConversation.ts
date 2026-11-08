import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Conversation, ConversationMember, Profile } from '../../lib/types';

export type MemberProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export const PROFILE_FIELDS = 'id, username, display_name, avatar_url';

/** Placeholder for a sender whose profile we can't read (deleted account, hidden by RLS…). */
export function unknownProfile(id: string): MemberProfile {
  return { id, username: '', display_name: 'Player', avatar_url: null };
}

/** Fetches profiles by id (deduped). Missing ids are simply absent from the result. */
export async function fetchProfiles(ids: string[]): Promise<MemberProfile[]> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).in('id', unique);
  if (error) throw error;
  return (data ?? []) as MemberProfile[];
}

type ConversationData = { conversation: Conversation; members: MemberProfile[] };

async function fetchConversation(conversationId: string | undefined): Promise<ConversationData> {
  if (!conversationId) throw new Error('Chat not found.');
  const [convRes, memRes] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
    supabase.from('conversation_members').select('*').eq('conversation_id', conversationId),
  ]);
  if (convRes.error) throw convRes.error;
  if (memRes.error) throw memRes.error;
  if (!convRes.data) throw new Error("This chat doesn't exist or you're not a member.");
  const memberRows = (memRes.data ?? []) as ConversationMember[];
  const profiles = await fetchProfiles(memberRows.map((m) => m.profile_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return {
    conversation: convRes.data as Conversation,
    members: memberRows.map((m) => byId.get(m.profile_id) ?? unknownProfile(m.profile_id)),
  };
}

/** Loads a conversation row plus its members' profiles. */
export function useConversation(conversationId: string | undefined, myId: string) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: ConversationData) => {
    setConversation(d.conversation);
    setMembers(d.members);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((err: unknown) => {
    setError(errorMessage(err));
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      apply(await fetchConversation(conversationId));
    } catch (err) {
      fail(err);
    }
  }, [conversationId, apply, fail]);

  useEffect(() => {
    let live = true;
    fetchConversation(conversationId).then(
      (d) => {
        if (live) apply(d);
      },
      (err: unknown) => {
        if (live) fail(err);
      },
    );
    return () => {
      live = false;
    };
  }, [conversationId, apply, fail]);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  /** For DMs: the other person. */
  const partner = useMemo<MemberProfile | null>(() => {
    if (!conversation || conversation.is_group) return null;
    return members.find((m) => m.id !== myId) ?? null;
  }, [conversation, members, myId]);

  return { conversation, members, membersById, partner, loading, error, reload: load };
}
