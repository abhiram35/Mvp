import { contrast } from '../../../theme/design';
import {
  artGradient,
  CLIP_FEEDS,
  emptyFeedCopy,
  feedLabel,
  firstName,
  formatCount,
  friendlyClipError,
  isClipFeed,
  mediaBase,
  parseClipUrl,
  thumbnailFor,
  timeAgo,
  validateClipCaption,
  validateClipDraft,
  validateClipTitle,
  validateClipUrl,
  validateComment,
  watchLabel,
} from '../logic';

const YT = 'dQw4w9WgXcQ';

describe('parseClipUrl', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${YT}`, YT],
    [`https://youtube.com/watch?feature=share&v=${YT}&t=42`, YT],
    [`https://m.youtube.com/watch?v=${YT}`, YT],
    [`https://youtu.be/${YT}`, YT],
    [`https://youtu.be/${YT}?si=abc`, YT],
    [`https://www.youtube.com/shorts/${YT}`, YT],
    [`https://youtube.com/shorts/${YT}/`, YT],
    [`https://www.youtube.com/watch/?v=${YT}`, YT],
    [`https://www.youtu.be/${YT}`, YT],
    [`  https://YOUTUBE.com/watch?v=${YT}  `, YT],
  ])('YouTube %s', (url, id) => {
    expect(parseClipUrl(url)).toEqual({ platform: 'youtube', videoId: id });
  });

  it.each([
    ['https://clips.twitch.tv/FunnyCleverSlothPJSalt-abc_12', 'FunnyCleverSlothPJSalt-abc_12'],
    ['https://www.twitch.tv/shroud/clip/BraveTenderOwl-xyz', 'BraveTenderOwl-xyz'],
    ['https://twitch.tv/videos/123456789', '123456789'],
    ['https://m.twitch.tv/videos/123456789?t=1h', '123456789'],
  ])('Twitch %s', (url, id) => {
    expect(parseClipUrl(url)).toEqual({ platform: 'twitch', videoId: id });
  });

  it.each([
    ['https://medal.tv/games/valorant/clips/1a2B3c4D/ace-on-ascent', '1a2B3c4D'],
    ['https://medal.tv/clips/zz9-_x', 'zz9-_x'],
  ])('Medal %s', (url, id) => {
    expect(parseClipUrl(url)).toEqual({ platform: 'medal', videoId: id });
  });

  it.each([
    '',
    'not a url',
    `http://www.youtube.com/watch?v=${YT}`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/watch`,
    `https://www.youtube.com/channel/UC123`,
    `https://youtube.com@evil.example/watch?v=${YT}`,
    `https://evil.example/watch?v=${YT}`,
    `https://youtube.com.evil.example/watch?v=${YT}`,
    `https://youtube.com:8443/watch?v=${YT}`,
    'https://twitch.tv/shroud',
    'https://twitch.tv/videos/abc',
    'https://clips.twitch.tv/ab',
    `https://youtu.be/${YT} trailing`,
    `https://youtu.be/${YT}?x=${'a'.repeat(500)}`,
    'https://clips.twitch.tv/',
    'https://medal.tv/games/valorant',
    'https://vimeo.com/123',
  ])('rejects %s', (url) => {
    expect(parseClipUrl(url)).toBeNull();
  });

  it('handles null / undefined', () => {
    expect(parseClipUrl(null)).toBeNull();
    expect(parseClipUrl(undefined)).toBeNull();
  });
});

describe('thumbnailFor', () => {
  it('uses the YouTube thumbnail, nothing for others', () => {
    expect(thumbnailFor({ platform: 'youtube', video_id: YT })).toBe(`https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
    expect(thumbnailFor({ platform: 'twitch', video_id: 'abc' })).toBeNull();
    expect(thumbnailFor({ platform: 'medal', video_id: 'abc' })).toBeNull();
    expect(thumbnailFor({ platform: 'youtube', video_id: '../etc' })).toBeNull();
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1200, '1.2k'],
    [1299, '1.2k'],
    [9999, '9.9k'],
    [12_400, '12k'],
    [999_999, '999k'],
    [1_250_000, '1.2M'],
    [12_000_000, '12M'],
    [-5, '0'],
    [Number.NaN, '0'],
  ])('%p → %p', (n, s) => {
    expect(formatCount(n)).toBe(s);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  it('formats short relative times', () => {
    expect(timeAgo('2026-11-13T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-13T11:48:00Z', now)).toBe('12m');
    expect(timeAgo('2026-11-13T09:00:00Z', now)).toBe('3h');
    expect(timeAgo('2026-11-11T12:00:00Z', now)).toBe('2d');
    expect(timeAgo('2026-10-30T12:00:00Z', now)).toBe('2w');
    expect(timeAgo('garbage', now)).toBe('');
    // Clock skew: a timestamp from the future reads as "just now".
    expect(timeAgo('2026-11-13T12:05:00Z', now)).toBe('just now');
  });
});

describe('feeds', () => {
  it('lists Squad · For you · Cups in order', () => {
    expect(CLIP_FEEDS.map((f) => f.label)).toEqual(['Squad', 'For you', 'Cups']);
    expect(feedLabel('for_you')).toBe('For you');
    expect(isClipFeed('cups')).toBe(true);
    expect(isClipFeed('hot')).toBe(false);
    expect(emptyFeedCopy('squad').title).toMatch(/squad/i);
  });

  it('names the watch platform', () => {
    expect(watchLabel('twitch')).toBe('Watch on Twitch');
  });
});

describe('validation', () => {
  it('validates title, caption, comment and url', () => {
    expect(validateClipTitle('  ab ')).toMatch(/at least 3/);
    expect(validateClipTitle('Ace on Ascent')).toBeNull();
    expect(validateClipTitle('x'.repeat(81))).toMatch(/under 80/);
    expect(validateClipCaption('x'.repeat(300))).toBeNull();
    expect(validateClipCaption('x'.repeat(301))).toMatch(/300/);
    expect(validateComment('   ')).toBe('Write something');
    expect(validateComment('gg wp')).toBeNull();
    expect(validateComment('x'.repeat(501))).toMatch(/500/);
    expect(validateClipUrl('')).toMatch(/Paste/);
    expect(validateClipUrl(`http://youtu.be/${YT}`)).toMatch(/https/);
    expect(validateClipUrl(`https://youtu.be/${YT}?x=${'a'.repeat(500)}`)).toMatch(/too long/);
    expect(validateClipUrl('https://vimeo.com/1')).toMatch(/YouTube, Twitch or Medal/);
    expect(validateClipUrl(`https://youtu.be/${YT}`)).toBeNull();
  });

  it('collects draft errors', () => {
    expect(validateClipDraft({ url: `https://youtu.be/${YT}`, gameId: 'valorant', title: 'Clutch 1v4', caption: '' })).toEqual({});
    expect(Object.keys(validateClipDraft({ url: '', gameId: null, title: '', caption: 'x'.repeat(400) })).sort()).toEqual([
      'caption',
      'game',
      'title',
      'url',
    ]);
  });
});

describe('firstName', () => {
  it('takes the first word, with a fallback and a cap', () => {
    expect(firstName('Riya Sharma')).toBe('Riya');
    expect(firstName('   ')).toBe('them');
    expect(firstName(null)).toBe('them');
    expect(firstName('Supercalifragilistic')).toBe('Supercalifrag…');
  });
});

describe('friendlyClipError', () => {
  it('maps known server refusals', () => {
    expect(friendlyClipError('duplicate key value violates unique constraint "clips_author_url_key"')).toMatch(/already shared/);
    expect(friendlyClipError('Could not find the function public.get_clip_feed')).toMatch(/not available/);
    // The RPCs' own messages are already player-facing: pass through.
    expect(friendlyClipError("You've shared 10 clips today. Try again tomorrow.")).toBeNull();
    expect(friendlyClipError(null)).toBeNull();
  });
});

describe('media colours', () => {
  it('keeps the media base dark even for a light panel', () => {
    expect(contrast('#FFFFFF', mediaBase('#111A22'))).toBeGreaterThanOrEqual(12);
    expect(contrast('#FFFFFF', mediaBase('#F4F1EA'))).toBeGreaterThanOrEqual(12);
  });

  it('art gradient is stable per game and keeps white text readable', () => {
    const base = mediaBase('#111A22');
    const accents = ['#FF4655', '#FFD400', '#29E3A1'];
    const a = artGradient(base, accents, 'valorant');
    expect(artGradient(base, accents, 'valorant')).toEqual(a);
    for (const id of ['valorant', 'bgmi', 'cs2', 'minecraft', '']) {
      const g = artGradient(base, accents, id);
      expect(contrast('#FFFFFF', g.from)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#FFFFFF', g.to)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
