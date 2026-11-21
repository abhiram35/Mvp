import { contrast, designLanguage, designTokens, ensureContrast, formatIndex, mixHex } from '../design';
import { customThemeId, specToAppTheme, validateSpec } from '../custom';
import { THEMES, THEME_ORDER, type AppTheme } from '../themes';

function spec(shape: { radius: number; cut: number }, dark = true) {
  const raw = {
    version: 1,
    name: 'Test Theme',
    vibe: 'Test.',
    dark,
    colors: dark
      ? {
          bg: '#101418', surface: '#1A2028', surfaceRaised: '#242B35', border: '#3A4350',
          text: '#F2F4F7', textMuted: '#B8C0CC', textFaint: '#8A94A3',
          primary: '#E8584A', primaryPressed: '#C8473A', onPrimary: '#000000',
          accent: '#D9A441', info: '#5AA9E6', warning: '#E6B85A', danger: '#E65A5A',
          panel: '#F2E6C8', onPanel: '#1A1A1A',
        }
      : {
          bg: '#F4F1EA', surface: '#FFFFFF', surfaceRaised: '#E6E1D6', border: '#C8C2B5',
          text: '#15181C', textMuted: '#4B5058', textFaint: '#6B6860',
          primary: '#2F6FDB', primaryPressed: '#255BB5', onPrimary: '#FFFFFF',
          accent: '#2E7D4F', info: '#2F5D8A', warning: '#8A5A0A', danger: '#B3261E',
          panel: '#15181C', onPanel: '#F4F1EA',
        },
    fonts: { display: 'cinzel', heading: 'cinzel', body: 'barlow' },
    shape: { radius: shape.radius, cut: shape.cut, panelStyle: 'frame', headingUppercase: true, headingLetterSpacing: 1 },
    texture: 'none',
    words: { gg: 'GGs', squad: 'squad', squadUp: 'Squad up', lobbies: 'Lobbies', community: 'Community' },
  };
  const valid = validateSpec(raw);
  if (!valid) throw new Error('test spec should be valid');
  return specToAppTheme(valid, customThemeId('t1'), 'Test');
}

const ALL: AppTheme[] = [
  ...THEME_ORDER.map((id) => THEMES[id]),
  spec({ radius: 0, cut: 0 }),
  spec({ radius: 10, cut: 0 }),
  spec({ radius: 2, cut: 8 }, false),
];

describe('designTokens', () => {
  it.each(ALL.map((t) => [t.name + (t.dark ? ' dark' : ' light'), t] as const))('%s: readable pairs meet AA', (_name, t) => {
    const d = designTokens(t);
    expect(contrast(d.primaryText, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.primaryText, t.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.selected.fg, d.selected.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.chip.fg, d.chip.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.colors.onPanel, d.hero.from)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.colors.onPanel, d.hero.to)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.colors.textMuted, d.track)).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens Protocol red for text but keeps the fill colour', () => {
    const t = THEMES.protocol;
    expect(contrast(t.colors.primary, t.colors.bg)).toBeLessThan(4.5);
    expect(designTokens(t).primaryText).not.toBe(t.colors.primary);
  });

  it('is cached per theme object', () => {
    expect(designTokens(THEMES.defuse)).toBe(designTokens(THEMES.defuse));
  });
});

describe('designLanguage', () => {
  it('uses the pinned personality on built-ins', () => {
    expect(designLanguage(THEMES.protocol).corner).toBe('cut');
    expect(designLanguage(THEMES.defuse).header).toBe('hud');
    expect(designLanguage(THEMES.ronin).rule).toBe('brush');
  });

  it('derives one for custom themes from shape', () => {
    expect(designLanguage(spec({ radius: 2, cut: 8 }, false)).corner).toBe('cut');
    expect(designLanguage(spec({ radius: 10, cut: 0 })).corner).toBe('soft');
    expect(designLanguage(spec({ radius: 0, cut: 0 })).corner).toBe('square');
    expect(designLanguage(spec({ radius: 2, cut: 8 }, false)).heroAngle).toBeGreaterThan(0);
  });
});

describe('colour helpers', () => {
  it('formats section indexes per theme', () => {
    expect(formatIndex(designLanguage(THEMES.protocol), 1)).toBe('/01');
    expect(formatIndex(designLanguage(THEMES.defuse), 12)).toBe('[12]');
    expect(formatIndex(designLanguage(THEMES.ronin), 3)).toBe('No.03');
  });

  it('mixes and repairs colours', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('rgba(0,0,0,1)', '#FFFFFF', 0.5)).toBe('rgba(0,0,0,1)');
    const fixed = ensureContrast('#D63A2F', ['#EEE9E0'], 4.5);
    expect(contrast(fixed, '#EEE9E0')).toBeGreaterThanOrEqual(4.5);
  });
});
