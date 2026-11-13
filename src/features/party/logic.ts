// Pure party logic (no Supabase / React): parsing get_my_party, building the five squad slots,
// who may do what, and friendly error text. Tested in __tests__/logic.test.ts.
import type { MemberProfile } from '../chat/useConversation';
import { INVITE_TTL_MS, PARTY_SIZE, type IncomingPartyInvite, type Party, type PartyInvite, type PartyMember, type PartySlot } from './types';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** RPC jsonb may arrive as an object, a JSON string, a one-element array or wrapped in one column. */
function unwrap(raw: unknown): Record<string, unknown> | null {
  let v: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!isObject(v)) return null;
  if (!('party_id' in v)) {
    const values = Object.values(v);
    if (values.length === 1 && values[0] !== v) return unwrap(values[0]);
    return null;
  }
  return v;
}

function parseMember(raw: unknown): PartyMember | null {
  if (!isObject(raw) || typeof raw.profile_id !== 'string') return null;
  return {
    profile_id: raw.profile_id,
    username: str(raw.username),
    display_name: str(raw.display_name) || str(raw.username) || 'Player',
    avatar_url: strOrNull(raw.avatar_url),
    ready: raw.ready === true,
    joined_at: str(raw.joined_at),
  };
}

function parseInvite(raw: unknown): PartyInvite | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.to_id !== 'string') return null;
  return {
    id: raw.id,
    to_id: raw.to_id,
    username: str(raw.username),
    display_name: str(raw.display_name) || str(raw.username) || 'Player',
    avatar_url: strOrNull(raw.avatar_url),
    created_at: str(raw.created_at),
    expires_at: str(raw.expires_at),
  };
}

/** get_my_party() result → Party, or null (not in a party / unreadable). */
export function normaliseParty(raw: unknown): Party | null {
  const r = unwrap(raw);
  if (!r || typeof r.party_id !== 'string' || typeof r.leader_id !== 'string') return null;
  const members = (Array.isArray(r.members) ? r.members : []).map(parseMember).filter((m): m is PartyMember => !!m);
  const invites = (Array.isArray(r.invites) ? r.invites : []).map(parseInvite).filter((i): i is PartyInvite => !!i);
  return { party_id: r.party_id, leader_id: r.leader_id, members, invites };
}

/** I lead the party, or I'm solo (inviting creates a party with me as leader). */
export function isLeader(party: Party | null, myId: string): boolean {
  return !party || party.leader_id === myId;
}

/** Members + pending invites (a solo player counts as 1). */
export function partyHeadcount(party: Party | null): number {
  if (!party) return 1;
  return Math.max(1, party.members.length) + party.invites.length;
}

/** Players actually in the party (the "n" in "YOUR SQUAD · n/5"); 1 when solo. */
export function memberCount(party: Party | null): number {
  return party ? Math.max(1, party.members.length) : 1;
}

/** May I send another invite right now? */
export function canInvite(party: Party | null, myId: string): boolean {
  return isLeader(party, myId) && partyHeadcount(party) < PARTY_SIZE;
}

/** Am I marked ready? */
export function isReady(party: Party | null, myId: string): boolean {
  return !!party?.members.find((m) => m.profile_id === myId)?.ready;
}

function byJoined(a: PartyMember, b: PartyMember) {
  return a.joined_at.localeCompare(b.joined_at) || a.profile_id.localeCompare(b.profile_id);
}

/**
 * The five squad slots, in order: leader, me, other members (by join time), pending invites
 * (oldest first), then empty slots. Solo players (no party) see themselves in slot 1.
 */
export function buildSlots(party: Party | null, me: MemberProfile): PartySlot[] {
  const slots: PartySlot[] = [];
  if (!party || party.members.length === 0) {
    slots.push({
      kind: 'member',
      leader: false,
      me: true,
      member: { profile_id: me.id, username: me.username, display_name: me.display_name, avatar_url: me.avatar_url, ready: false, joined_at: '' },
    });
  } else {
    const members = [...party.members].sort((a, b) => {
      const rank = (m: PartyMember) => (m.profile_id === party.leader_id ? 0 : m.profile_id === me.id ? 1 : 2);
      return rank(a) - rank(b) || byJoined(a, b);
    });
    for (const m of members) slots.push({ kind: 'member', member: m, leader: m.profile_id === party.leader_id, me: m.profile_id === me.id });
    const invites = [...(party.invites ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const invite of invites) slots.push({ kind: 'invited', invite });
  }
  while (slots.length < PARTY_SIZE) slots.push({ kind: 'empty' });
  return slots.slice(0, PARTY_SIZE);
}

/** Status line under a slot. */
export function slotLabel(slot: PartySlot): string {
  switch (slot.kind) {
    case 'member':
      if (slot.leader) return 'LEADER';
      if (slot.member.ready) return 'READY';
      return slot.me && !slot.leader && !slot.member.joined_at ? 'YOU' : 'IN PARTY';
    case 'invited':
      return 'INVITED';
    default:
      return '';
  }
}

/** Accessibility text for a slot. */
export function slotA11yLabel(slot: PartySlot): string {
  switch (slot.kind) {
    case 'member': {
      const who = slot.me ? `You, ${slot.member.display_name}` : slot.member.display_name;
      const parts = [who];
      if (slot.leader) parts.push('party leader');
      parts.push(slot.member.ready ? 'ready' : slot.leader ? 'not ready' : 'in party, not ready');
      return parts.join(', ');
    }
    case 'invited':
      return `${slot.invite.display_name}, invited, waiting for an answer`;
    default:
      return 'Empty slot. Invite a friend';
  }
}

/** Friends who can still be invited (not already a member or invited), in the given order. */
export function invitableFriends<T extends { id: string }>(friends: readonly T[], party: Party | null, myId: string): T[] {
  const taken = new Set<string>([myId]);
  for (const m of party?.members ?? []) taken.add(m.profile_id);
  for (const i of party?.invites ?? []) taken.add(i.to_id);
  return friends.filter((f) => !taken.has(f.id));
}

/** Expiry of an invite (expires_at, else created_at + 1 h). */
export function inviteExpiresAt(invite: Pick<IncomingPartyInvite, 'created_at' | 'expires_at'>): number {
  const at = Date.parse(invite.expires_at);
  if (Number.isFinite(at)) return at;
  const created = Date.parse(invite.created_at);
  return Number.isFinite(created) ? created + INVITE_TTL_MS : 0;
}

/**
 * The party without invites that have expired by `now` (get_my_party only returns unexpired
 * ones, but a loaded party ages): expired invites free their slot. Same object when nothing
 * changed, so memoised consumers don't re-render.
 */
export function withoutExpiredInvites(party: Party | null, now: number): Party | null {
  if (!party) return party;
  const invites = party.invites.filter((i) => inviteExpiresAt(i) > now);
  return invites.length === party.invites.length ? party : { ...party, invites };
}

/** When my party's pending invite to this player expires (ms), or null when there's none live. */
export function pendingInviteExpiry(party: Party | null, profileId: string, now: number): number | null {
  const inv = party?.invites.find((i) => i.to_id === profileId && inviteExpiresAt(i) > now);
  return inv ? inviteExpiresAt(inv) : null;
}

/**
 * Incoming invites worth showing: unexpired, not from my own party, one per party (newest),
 * newest first.
 */
export function activeIncomingInvites(invites: readonly IncomingPartyInvite[], myPartyId: string | null, now: number): IncomingPartyInvite[] {
  const byParty = new Map<string, IncomingPartyInvite>();
  for (const inv of invites) {
    if (inviteExpiresAt(inv) <= now) continue;
    if (myPartyId && inv.party_id === myPartyId) continue;
    const prev = byParty.get(inv.party_id);
    if (!prev || prev.created_at < inv.created_at) byParty.set(inv.party_id, inv);
  }
  return [...byParty.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** "in 42 min" / "in 1 min" / "soon" for an invite's remaining time. */
export function expiresInLabel(expiresAt: number, now: number): string {
  const mins = Math.ceil((expiresAt - now) / 60_000);
  if (mins <= 1) return 'expires in 1 min';
  if (mins >= 60) return 'expires in 1 h';
  return `expires in ${mins} min`;
}

function messageOf(e: unknown): string {
  if (typeof e === 'string') return e;
  const m = (e as { message?: unknown })?.message;
  return typeof m === 'string' ? m : '';
}

function codeOf(e: unknown): string {
  const c = (e as { code?: unknown })?.code;
  return typeof c === 'string' ? c : '';
}

/** True when the party RPCs aren't on this database yet (migration 0017 not applied). */
export function isPartyUnavailable(e: unknown): boolean {
  const code = codeOf(e);
  const msg = messageOf(e);
  return code === 'PGRST202' || code === '42883' || code === '42P01' || /could not find the function|does not exist|schema cache/i.test(msg);
}

/**
 * The party RPCs' own messages (supabase/migrations/0017_clips_party.sql), matched exactly
 * (case-insensitive) → the copy the app shows. Unlisted server messages are shown as they are.
 */
const SERVER_MESSAGES: Record<string, string> = {
  'your party is full (5 players, including pending invites)': 'Your party is full (5 players, including pending invites).',
  'this party is full': 'That party is already full.',
  "you can't invite this player": "You can't invite this player.",
  "you can't invite yourself": "You can't invite yourself.",
  'player not found': "We couldn't find that player.",
  'this player is already in your party': "They're already in your party.",
  'only the party leader can invite players': 'Only the party leader can invite players.',
  'only the party leader can remove players': 'Only the party leader can remove players.',
  'only the party leader or the sender can cancel this invite': 'Only the party leader can cancel this invite.',
  'this invite has expired': 'That invite has expired.',
  'this invite is no longer available': 'That invite is no longer available.',
  'this invite is no longer pending': 'That invite was already answered or cancelled.',
  'invite not found': 'That invite is no longer available.',
  "you're not in a party": "You're not in a party.",
  'your party changed. try again.': 'Your party changed. Try again.',
  "this player isn't in your party": "That player isn't in your party anymore.",
  'use leave party to leave': 'Use Leave to leave the party.',
};

/** Short, friendly text for party errors. */
export function partyErrorMessage(e: unknown): string {
  const msg = messageOf(e);
  if (isPartyUnavailable(e)) return "Parties aren't available yet. Try again after the next update.";
  const exact = SERVER_MESSAGES[msg.trim().replace(/[’]/g, "'").toLowerCase()];
  if (exact) return exact;
  if (/network|fetch|timed? ?out|offline/i.test(msg)) return 'No connection. Check your internet and try again.';
  if (/banned|paused|suspend/i.test(msg)) return "Your account is paused, so you can't do that right now.";
  if (codeOf(e) === '42501' && !msg) return "You can't do that in this party.";
  if (/permission denied|row-level/i.test(msg)) return "You can't do that in this party.";
  return msg && msg.length <= 120 ? msg : 'Something went wrong. Please try again.';
}

/**
 * "Invite sent" bookkeeping for clip pages: profile id → when that invite expires (ms).
 * Drops entries that expired by `now`; when `party` is known (a fresh get_my_party read), also
 * drops players with no live pending invite any more (accepted, declined, cancelled) and takes
 * the server's expiry. Returns the same object when nothing changed.
 */
export function reconcileSentInvites(
  sent: Readonly<Record<string, number>>,
  party: Party | null | undefined,
  now: number,
): Readonly<Record<string, number>> {
  let changed = false;
  const next: Record<string, number> = {};
  for (const [id, until] of Object.entries(sent)) {
    const server = party === undefined ? until : pendingInviteExpiry(party, id, now);
    if (server == null || server <= now) {
      changed = true;
      continue;
    }
    if (server !== until) changed = true;
    next[id] = server;
  }
  return changed ? next : sent;
}

/** The soonest expiry in a sent-invites map (ms), or null when it's empty. */
export function nextSentExpiry(sent: Readonly<Record<string, number>>): number | null {
  const all = Object.values(sent);
  return all.length ? Math.min(...all) : null;
}
