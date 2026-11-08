import { gameArtUrl, gameCategory, groupByCategory, isSquadable, steamHeaderUrl } from '../art';

describe('game art', () => {
  it('prefers a self-hosted logo, then Steam art, else null', () => {
    expect(gameArtUrl({ logo_url: 'https://x.supabase.co/a.png', steam_appid: 730 })).toBe('https://x.supabase.co/a.png');
    expect(gameArtUrl({ logo_url: null, steam_appid: 730 })).toBe(steamHeaderUrl(730));
    expect(gameArtUrl({ logo_url: null, steam_appid: null })).toBeNull();
    expect(gameArtUrl(undefined)).toBeNull();
  });

  it('groups games by category in display order and skips empty groups', () => {
    const groups = groupByCategory([
      { id: 'a', category: 'story' as const },
      { id: 'b', category: 'competitive' as const },
      { id: 'c', category: 'story' as const },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['competitive', 'story']);
    expect(groups[1].games.map((g) => g.id)).toEqual(['a', 'c']);
  });
});

describe('category / squadable fallbacks (database not migrated yet)', () => {
  it('puts games with a missing or unknown category under competitive', () => {
    const groups = groupByCategory([
      { id: 'a' } as { id: string; category?: string },
      { id: 'b', category: 'something_new' },
      { id: 'c', category: 'story' },
      { id: 'd', category: null },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['competitive', 'story']);
    expect(groups[0].games.map((g) => g.id)).toEqual(['a', 'b', 'd']);
  });

  it('gameCategory and isSquadable default sensibly', () => {
    expect(gameCategory(undefined)).toBe('competitive');
    expect(gameCategory({ category: 'casual' })).toBe('casual');
    expect(isSquadable({})).toBe(true);
    expect(isSquadable({ squadable: undefined })).toBe(true);
    expect(isSquadable({ squadable: false })).toBe(false);
    expect(isSquadable(undefined)).toBe(true);
  });
});
