import { DISCORD_INVITE_URL, isDiscordInvite } from '../links';

describe('Discord invite link', () => {
  it('ships a valid default invite', () => {
    expect(isDiscordInvite(DISCORD_INVITE_URL)).toBe(true);
  });
  it('accepts discord.gg and discord.com/invite links', () => {
    expect(isDiscordInvite('https://discord.gg/sQa6fnPhw')).toBe(true);
    expect(isDiscordInvite('https://discord.com/invite/vinq')).toBe(true);
  });
  it('rejects anything that is not a Discord invite', () => {
    expect(isDiscordInvite('http://discord.gg/abc')).toBe(false);
    expect(isDiscordInvite('https://discord.gg.evil.com/abc')).toBe(false);
    expect(isDiscordInvite('https://evil.com/discord.gg/abc')).toBe(false);
    expect(isDiscordInvite('javascript:alert(1)')).toBe(false);
  });
});
