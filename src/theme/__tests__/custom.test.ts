import {
  contrastRatio,
  customRowId,
  customThemeId,
  specFonts,
  specToAppTheme,
  validateSpec,
  type ThemeSpec,
} from '../custom';

/** A readable dark theme that passes every rule in docs/CUSTOM_THEMES.md. */
function goodSpec(): Record<string, any> {
  return {
    version: 1,
    name: 'Frost Warlord',
    vibe: 'Cold Norse war, blood and gold.',
    dark: true,
    colors: {
      bg: '#101418',
      surface: '#1A2028',
      surfaceRaised: '#242B35',
      border: '#3A4350',
      text: '#F2F4F7',
      textMuted: '#B8C0CC',
      textFaint: '#8A94A3',
      primary: '#E8584A',
      primaryPressed: '#C8473A',
      onPrimary: '#000000',
      accent: '#D9A441',
      info: '#5AA9E6',
      warning: '#E6B85A',
      danger: '#E65A5A',
      panel: '#F2E6C8',
      onPanel: '#1A1A1A',
    },
    fonts: { display: 'cinzel', heading: 'cinzel', body: 'barlow' },
    shape: { radius: 4, cut: 6, panelStyle: 'frame', headingUppercase: true, headingLetterSpacing: 1.5 },
    texture: 'frost',
    words: { gg: 'GGs', squad: 'warband', squadUp: 'Join warband', lobbies: 'Halls', community: 'Sagas' },
  };
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio(hex('#000000'), hex('#FFFFFF'))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex('#777777'), hex('#777777'))).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(hex('#E8584A'), hex('#101418'))).toBeCloseTo(contrastRatio(hex('#101418'), hex('#E8584A')), 10);
  });
});

describe('validateSpec', () => {
  it('accepts a good spec and returns a clean copy', () => {
    const out = validateSpec(goodSpec());
    expect(out).not.toBeNull();
    expect(out!.name).toBe('Frost Warlord');
    expect(out!.fonts).toEqual({ display: 'cinzel', heading: 'cinzel', body: 'barlow' });
    expect(out!.texture).toBe('frost');
    expect(out!.words.squadUp).toBe('Join warband');
  });

  it('accepts a missing version but rejects a different one', () => {
    const noVersion = goodSpec();
    delete noVersion.version;
    expect(validateSpec(noVersion)).not.toBeNull();
    expect(validateSpec({ ...goodSpec(), version: 2 })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(validateSpec(null)).toBeNull();
    expect(validateSpec('theme')).toBeNull();
    expect(validateSpec([])).toBeNull();
  });

  it('normalises colours to upper case and trims them', () => {
    const s = goodSpec();
    s.colors.accent = '  #d9a441 ';
    expect(validateSpec(s)!.colors.accent).toBe('#D9A441');
  });

  it.each(['#FFF', 'red', '#GGGGGG', '#1234567', 123, undefined])('rejects a bad hex colour (%p)', (bad) => {
    const s = goodSpec();
    s.colors.info = bad;
    expect(validateSpec(s)).toBeNull();
  });

  it('rejects a spec with a colour key missing', () => {
    const s = goodSpec();
    delete s.colors.onPanel;
    expect(validateSpec(s)).toBeNull();
  });

  it('rejects unknown fonts, textures and panel styles', () => {
    expect(validateSpec({ ...goodSpec(), fonts: { display: 'comic-sans', heading: 'cinzel', body: 'barlow' } })).toBeNull();
    expect(validateSpec({ ...goodSpec(), fonts: { display: 'cinzel', heading: 'cinzel', body: 'cinzel' } })).toBeNull();
    expect(validateSpec({ ...goodSpec(), texture: 'lava' })).toBeNull();
    const s = goodSpec();
    s.shape.panelStyle = 'neon';
    expect(validateSpec(s)).toBeNull();
  });

  it('rejects unreadable contrast', () => {
    const lowText = goodSpec();
    lowText.colors.text = '#2A3038'; // dark grey on near-black
    expect(validateSpec(lowText)).toBeNull();

    const lowOnPrimary = goodSpec();
    lowOnPrimary.colors.onPrimary = '#E0584A';
    expect(validateSpec(lowOnPrimary)).toBeNull();

    const lowPanel = goodSpec();
    lowPanel.colors.onPanel = '#E8DCC0';
    expect(validateSpec(lowPanel)).toBeNull();
  });

  it('derives `dark` from the background instead of trusting the input', () => {
    expect(validateSpec({ ...goodSpec(), dark: false })!.dark).toBe(true);

    const light = goodSpec();
    Object.assign(light.colors, {
      bg: '#FFFFFF',
      surface: '#F4F4F4',
      text: '#111111',
      textMuted: '#4A4A4A',
      textFaint: '#767676',
      primary: '#B3261E',
      onPrimary: '#FFFFFF',
    });
    expect(validateSpec({ ...light, dark: true })!.dark).toBe(false);
  });

  it('clamps and rounds shape numbers', () => {
    const s = goodSpec();
    s.shape = { ...s.shape, radius: 40, cut: -3, headingLetterSpacing: 2.345 };
    const out = validateSpec(s)!;
    expect(out.shape.radius).toBe(12);
    expect(out.shape.cut).toBe(0);
    expect(out.shape.headingLetterSpacing).toBe(2.3);

    const s2 = goodSpec();
    s2.shape = { ...s2.shape, radius: 4.6, headingLetterSpacing: 9 };
    expect(validateSpec(s2)!.shape.radius).toBe(5);
    expect(validateSpec(s2)!.shape.headingLetterSpacing).toBe(3);
  });

  it('rejects non-numeric shape numbers and a non-boolean headingUppercase', () => {
    const s = goodSpec();
    s.shape.radius = '4';
    expect(validateSpec(s)).toBeNull();
    const s2 = goodSpec();
    s2.shape.cut = Number.NaN;
    expect(validateSpec(s2)).toBeNull();
    const s3 = goodSpec();
    s3.shape.headingUppercase = 'yes';
    expect(validateSpec(s3)).toBeNull();
  });

  it('trims and length-limits the name, vibe and words', () => {
    const s = goodSpec();
    s.name = '   An Extremely Long Theme Name That Goes On   ';
    s.vibe = 'x'.repeat(100);
    s.words.lobbies = '  Great   Halls  ';
    const out = validateSpec(s)!;
    expect(out.name.length).toBeLessThanOrEqual(24);
    expect(out.name.startsWith('An Extremely')).toBe(true);
    expect(out.vibe).toHaveLength(60);
    expect(out.words.lobbies).toBe('Great Halls');
  });

  it('defaults a missing vibe to an empty string', () => {
    const s = goodSpec();
    delete s.vibe;
    expect(validateSpec(s)!.vibe).toBe('');
  });

  it('rejects names and words with disallowed characters or that are too short', () => {
    expect(validateSpec({ ...goodSpec(), name: 'X' })).toBeNull();
    expect(validateSpec({ ...goodSpec(), name: '<script>' })).toBeNull();
    const s = goodSpec();
    s.words.gg = 'GG 🔥';
    expect(validateSpec(s)).toBeNull();
    const s2 = goodSpec();
    s2.words.squad = '   ';
    expect(validateSpec(s2)).toBeNull();
  });

  it('accepts non-Latin letters in names and words', () => {
    const s = goodSpec();
    s.name = 'Élan Noir';
    s.words.squad = '侍';
    expect(validateSpec(s)).not.toBeNull();
  });

  it('accepts scripts with combining marks (Devanagari matras)', () => {
    const s = goodSpec();
    s.name = 'रणभूमि';
    s.words.squad = 'दस्ता';
    const out = validateSpec(s);
    expect(out).not.toBeNull();
    expect(out!.name).toBe('रणभूमि');
    // Decomposed accents (e + U+0301) are fine too.
    expect(validateSpec({ ...goodSpec(), name: 'Cafe\u0301 Noir' })).not.toBeNull();
  });

  it('rejects stray or stacked combining marks', () => {
    expect(validateSpec({ ...goodSpec(), name: '\u0301\u0301ab' })).toBeNull();
    expect(validateSpec({ ...goodSpec(), name: 'Za\u0301\u0302\u0303\u0304lgo' })).toBeNull();
  });
});

describe('custom theme ids', () => {
  it('round-trips a row id through a ThemeId', () => {
    const id = customThemeId('abc-123');
    expect(id).toBe('custom:abc-123');
    expect(customRowId(id)).toBe('abc-123');
  });

  it('returns null for built-in theme ids', () => {
    expect(customRowId('protocol')).toBeNull();
  });
});

describe('specFonts', () => {
  it('uses the display cut for display and the heading cut for heading', () => {
    const f = specFonts({ display: 'cinzel', heading: 'cinzel', body: 'atkinson-hyperlegible' });
    expect(f.display).toBe('Cinzel_800ExtraBold');
    expect(f.heading).toBe('Cinzel_700Bold');
    expect(f.body).toBe('AtkinsonHyperlegible_400Regular');
    expect(f.bodyBold).toBe('AtkinsonHyperlegible_700Bold');
  });
});

describe('specToAppTheme', () => {
  const spec = (radius: number): ThemeSpec => {
    const s = goodSpec();
    s.shape.radius = radius;
    return validateSpec(s)!;
  };

  it('maps a small radius to every size, without round avatars', () => {
    const t = specToAppTheme(spec(4), customThemeId('r1'), 'My Theme');
    expect(t.radius).toEqual({ sm: 4, md: 4, lg: 4, pill: 4 });
    expect(t.shape.round).toBe(false);
  });

  it('uses pill = 999 and round avatars when radius >= 8', () => {
    const t = specToAppTheme(spec(8), customThemeId('r1'), 'My Theme');
    expect(t.radius).toEqual({ sm: 8, md: 8, lg: 8, pill: 999 });
    expect(t.shape.round).toBe(true);
  });

  it('copies identity, words, shape and texture', () => {
    const s = spec(2);
    const t = specToAppTheme(s, customThemeId('r1'), '  Renamed  ');
    expect(t.id).toBe('custom:r1');
    expect(t.name).toBe('Renamed');
    expect(t.vibe).toBe(s.vibe);
    expect(t.dark).toBe(true);
    expect(t.words).toEqual(s.words);
    expect(t.words).not.toBe(s.words);
    expect(t.texture).toBe('frost');
    expect(t.panelStyle).toBe('frame');
    expect(t.shape).toMatchObject({ cut: 6, headingUppercase: true, headingLetterSpacing: 1.5 });
  });

  it("falls back to the spec's name when the row name is blank", () => {
    expect(specToAppTheme(spec(2), customThemeId('r1'), '   ').name).toBe('Frost Warlord');
  });

  it('derives the overlay from bg at 72% opacity', () => {
    const t = specToAppTheme(spec(2), customThemeId('r1'), 'x');
    expect(t.colors.overlay).toBe('rgba(16,20,24,0.72)');
    expect(t.colors.bg).toBe('#101418');
  });
});
