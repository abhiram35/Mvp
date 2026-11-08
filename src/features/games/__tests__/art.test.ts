import { gameArtUrl, groupByCategory, steamHeaderUrl } from '../art';

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
