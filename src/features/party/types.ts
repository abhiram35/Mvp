// Party (the Lobby's squad slots). Mirrors supabase/migrations/0017_clips_party.sql — see
// docs/CLIPS_AND_PARTY.md ("Party" and the get_my_party RPC).
import type { MemberProfile } from '../chat/useConversation';

/** A party holds at most this many players (members + pending invites). */
export const PARTY_SIZE = 5;

/** Party invites expire this long after they're sent (server: created_at + 1 h). */
export const INVITE_TTL_MS = 60 * 60_000;

/** One row of get_my_party().members. */
export interface PartyMember {
  profile_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  ready: boolean;
  joined_at: string;
}

/** One row of get_my_party().invites (pending, unexpired, sent by my party). */
export interface PartyInvite {
  id: string;
  to_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  /** created_at + 1 h on the server ('' from an older server: inviteExpiresAt falls back). */
  expires_at: string;
}

/** get_my_party() → this, or null when I'm not in a party. */
export interface Party {
  party_id: string;
  leader_id: string;
  members: PartyMember[];
  invites: PartyInvite[];
}

/** A pending party invite sent TO me (party_invites row + the sender's profile). */
export interface IncomingPartyInvite {
  id: string;
  party_id: string;
  from_id: string;
  created_at: string;
  expires_at: string;
  from: MemberProfile;
}

/** What one of the five squad slots shows. */
export type PartySlot =
  | { kind: 'member'; member: PartyMember; leader: boolean; me: boolean }
  | { kind: 'invited'; invite: PartyInvite }
  | { kind: 'empty' };
