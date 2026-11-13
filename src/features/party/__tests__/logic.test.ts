import {
  activeIncomingInvites,
  buildSlots,
  canInvite,
  expiresInLabel,
  invitableFriends,
  inviteExpiresAt,
  isLeader,
  isPartyUnavailable,
  isReady,
  memberCount,
  normaliseParty,
  partyErrorMessage,
  partyHeadcount,
  slotA11yLabel,
  slotLabel,
} from '../logic';
import type { IncomingPartyInvite, Party } from '../types';

const me = { id: 'me', username: 'me', display_name: 'Me', avatar_url: null };

const member = (id: string, joined: string, ready = false) => ({
  profile_id: id,
  username: id,
  display_name: id.toUpperCase(),
  avatar_url: null,
  ready,
  joined_at: joined,
});

const party = (over: Partial<Party> = {}): Party => ({
  party_id: 'p1',
  leader_id: 'lead',
  members: [member('b', '2026-01-01T10:02:00Z'), member('me', '2026-01-01T10:01:00Z'), member('lead', '2026-01-01T10:00:00Z', true)],
  invites: [{ id: 'i1', to_id: 'c', username: 'c', display_name: 'C', avatar_url: null, created_at: '2026-01-01T10:05:00Z' }],
  ...over,
});

describe('normaliseParty', () => {
  it('returns null for null / garbage', () => {
    expect(normaliseParty(null)).toBeNull();
    expect(normaliseParty('nope')).toBeNull();
    expect(normaliseParty({ foo: 1 })).toBeNull();
    expect(normaliseParty([])).toBeNull();
  });

  it('parses objects, JSON strings, arrays and wrapped columns', () => {
    const raw = { party_id: 'p1', leader_id: 'a', members: [{ profile_id: 'a', username: 'a', ready: true }], invites: [] };
    for (const v of [raw, JSON.stringify(raw), [raw], { get_my_party: raw }]) {
      const p = normaliseParty(v);
      expect(p?.party_id).toBe('p1');
      expect(p?.members[0]).toMatchObject({ profile_id: 'a', display_name: 'a', ready: true, avatar_url: null });
    }
  });

  it('drops malformed members and invites', () => {
    const p = normaliseParty({ party_id: 'p', leader_id: 'a', members: [{ username: 'x' }, { profile_id: 'a' }], invites: [{ id: 'i' }, null] });
    expect(p?.members).toHaveLength(1);
    expect(p?.invites).toHaveLength(0);
  });
});

describe('permissions and counts', () => {
  it('solo players are leaders-to-be and can invite', () => {
    expect(isLeader(null, 'me')).toBe(true);
    expect(canInvite(null, 'me')).toBe(true);
    expect(memberCount(null)).toBe(1);
    expect(partyHeadcount(null)).toBe(1);
  });

  it('only the leader invites, and only while under 5', () => {
    expect(canInvite(party(), 'me')).toBe(false);
    expect(canInvite(party(), 'lead')).toBe(true);
    const full = party({ invites: [...party().invites, { id: 'i2', to_id: 'd', username: 'd', display_name: 'D', avatar_url: null, created_at: '' }] });
    expect(partyHeadcount(full)).toBe(5);
    expect(canInvite(full, 'lead')).toBe(false);
    expect(memberCount(full)).toBe(3);
  });

  it('reads my ready flag', () => {
    expect(isReady(party(), 'lead')).toBe(true);
    expect(isReady(party(), 'me')).toBe(false);
    expect(isReady(null, 'me')).toBe(false);
  });
});

describe('buildSlots', () => {
  it('solo: me then four empty slots', () => {
    const slots = buildSlots(null, me);
    expect(slots).toHaveLength(5);
    expect(slots[0]).toMatchObject({ kind: 'member', me: true });
    expect(slotLabel(slots[0])).toBe('YOU');
    expect(slots.slice(1).every((s) => s.kind === 'empty')).toBe(true);
  });

  it('orders leader, me, members by join time, invites, empty', () => {
    const slots = buildSlots(party(), me);
    expect(slots.map((s) => (s.kind === 'member' ? s.member.profile_id : s.kind === 'invited' ? `inv:${s.invite.to_id}` : 'empty'))).toEqual([
      'lead',
      'me',
      'b',
      'inv:c',
      'empty',
    ]);
    expect(slots.map(slotLabel)).toEqual(['LEADER', 'IN PARTY', 'IN PARTY', 'INVITED', '']);
  });

  it('marks ready members READY and never exceeds 5 slots', () => {
    const p = party({
      members: [member('lead', '1'), member('me', '2', true), member('b', '3'), member('c', '4'), member('d', '5')],
      invites: [{ id: 'x', to_id: 'e', username: 'e', display_name: 'E', avatar_url: null, created_at: '' }],
    });
    const slots = buildSlots(p, me);
    expect(slots).toHaveLength(5);
    expect(slotLabel(slots[1])).toBe('READY');
  });

  it('has readable a11y labels', () => {
    const slots = buildSlots(party(), me);
    expect(slotA11yLabel(slots[0])).toBe('LEAD, party leader, ready');
    expect(slotA11yLabel(slots[1])).toMatch(/^You, ME, in party/);
    expect(slotA11yLabel(slots[3])).toMatch(/invited/);
    expect(slotA11yLabel(slots[4])).toMatch(/Invite a friend/);
  });
});

describe('invitableFriends', () => {
  it('skips me, members and invited players', () => {
    const friends = [{ id: 'b' }, { id: 'c' }, { id: 'z' }, { id: 'me' }];
    expect(invitableFriends(friends, party(), 'me').map((f) => f.id)).toEqual(['z']);
    expect(invitableFriends(friends, null, 'me').map((f) => f.id)).toEqual(['b', 'c', 'z']);
  });
});

describe('incoming invites', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const inv = (id: string, party_id: string, created: string, expires: string): IncomingPartyInvite => ({
    id,
    party_id,
    from_id: 'x',
    created_at: created,
    expires_at: expires,
    from: { id: 'x', username: 'x', display_name: 'X', avatar_url: null },
  });

  it('falls back to created_at + 1 h for expiry', () => {
    expect(inviteExpiresAt({ created_at: '2026-01-01T11:30:00Z', expires_at: '' })).toBe(Date.parse('2026-01-01T12:30:00Z'));
  });

  it('drops expired and own-party invites, keeps the newest per party', () => {
    const list = [
      inv('old', 'p2', '2026-01-01T11:10:00Z', '2026-01-01T12:10:00Z'),
      inv('new', 'p2', '2026-01-01T11:20:00Z', '2026-01-01T12:20:00Z'),
      inv('gone', 'p3', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
      inv('mine', 'p1', '2026-01-01T11:50:00Z', '2026-01-01T12:50:00Z'),
      inv('other', 'p4', '2026-01-01T11:00:00Z', '2026-01-01T12:01:00Z'),
    ];
    expect(activeIncomingInvites(list, 'p1', now).map((i) => i.id)).toEqual(['new', 'other']);
  });

  it('formats time left', () => {
    expect(expiresInLabel(now + 42 * 60_000, now)).toBe('expires in 42 min');
    expect(expiresInLabel(now + 10_000, now)).toBe('expires in 1 min');
    expect(expiresInLabel(now + 60 * 60_000, now)).toBe('expires in 1 h');
  });
});

describe('errors', () => {
  it('detects a database without the party RPCs', () => {
    expect(isPartyUnavailable({ code: 'PGRST202', message: 'Could not find the function public.get_my_party' })).toBe(true);
    expect(isPartyUnavailable({ code: '42501', message: 'nope' })).toBe(false);
    expect(partyErrorMessage({ code: 'PGRST202' })).toMatch(/aren't available/);
  });

  it('maps server wording to friendly text', () => {
    expect(partyErrorMessage(new Error('Failed to fetch'))).toMatch(/No connection/);
    expect(partyErrorMessage(new Error('invite expired'))).toMatch(/expired/);
    expect(partyErrorMessage(new Error('party is full'))).toMatch(/full/);
    expect(partyErrorMessage(new Error('only the leader can invite'))).toMatch(/leader/);
    expect(partyErrorMessage({})).toMatch(/Something went wrong/);
  });
});
