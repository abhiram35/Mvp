// GG themes. Players pick one in Profile → Theme; the choice is saved on the phone.
// Every screen reads the active theme through useTheme() / makeStyles() — never
// hard-code a colour, font family or radius.

import type { DesignLanguage } from './design';

export type BuiltInThemeId = 'protocol' | 'defuse' | 'ronin';
/** Built-in themes, or a player's AI-generated theme (`custom:<custom_themes.id>`). */
export type ThemeId = BuiltInThemeId | `custom:${string}`;

/** How media panels are decorated: corner brackets, a thin accent frame, or nothing. */
export type PanelStyle = 'bracket' | 'frame' | 'plain';
/** Subtle full-screen background pattern drawn behind content (see ScreenTexture). */
export type TextureId =
  | 'none' | 'grain' | 'scanlines' | 'frost' | 'ash' | 'rust' | 'moss' | 'stone' | 'paper' | 'hex' | 'circuit' | 'waves';

export interface AppTheme {
  id: ThemeId;
  name: string;
  /** One-line description shown in the theme picker. */
  vibe: string;
  /** true when the background is dark (status bar uses light content). */
  dark: boolean;
  colors: {
    bg: string; // screen background
    surface: string; // cards, inputs
    surfaceRaised: string; // pressed / selected surfaces, sheets
    border: string;
    text: string;
    textMuted: string; // secondary text (AA contrast on bg and surface)
    textFaint: string; // timestamps, hints (≥ 3:1, large or non-essential text only)
    primary: string; // main action colour
    primaryPressed: string;
    onPrimary: string; // text/icons on primary
    accent: string; // online / open / success
    info: string; // secondary highlight
    warning: string;
    danger: string;
    overlay: string; // modal scrim
    panel: string; // dark media panel behind clips / hero areas
    onPanel: string; // text on panel
  };
  fonts: {
    display: string; // huge moment titles (ACE, 1v3 RETAKE)
    heading: string; // screen titles, buttons, tab labels
    body: string;
    bodyMedium: string;
    bodyBold: string;
  };
  radius: { sm: number; md: number; lg: number; pill: number };
  shape: {
    /** Size in px of the diagonal notch cut from the top-right / bottom-left of panels and buttons. 0 = none. */
    cut: number;
    /** Headings and buttons in capitals (shooter UIs) or as written. */
    headingUppercase: boolean;
    headingLetterSpacing: number;
    /** Round avatars / dots (Ronin, and custom themes with radius ≥ 8). Defaults to false. */
    round?: boolean;
  };
  /** Media panel decoration. Defaults to 'bracket'. */
  panelStyle?: PanelStyle;
  /** Background texture behind screens. Defaults to 'none'. */
  texture?: TextureId;
  /**
   * Design personality (corner language, header treatment, rules, index numbers, hero angle).
   * Optional: custom themes derive it from `shape` — see designLanguage() in ./design.
   */
  design?: DesignLanguage;
  /** Theme-flavoured words. Screens use these instead of hard-coded copy. */
  words: {
    gg: string; // what a like is called: "GGs" / "honours"
    squad: string; // "squad" / "clan"
    squadUp: string; // main CTA: "Squad up" / "Join clan"
    lobbies: string; // "Lobbies" / "Dojo"
    community: string; // discussion tab: "Community" / "Scrolls"
  };
}

export const THEMES: Record<BuiltInThemeId, AppTheme> = {
  protocol: {
    id: 'protocol',
    name: 'Protocol',
    vibe: 'Tactical shooter. Cream, navy and a sharp red.',
    dark: false,
    colors: {
      bg: '#EEE9E0',
      surface: '#F8F5EF',
      surfaceRaised: '#E2DCD1',
      border: '#C9C2B6',
      text: '#111A22',
      textMuted: '#4A5059',
      textFaint: '#66625A',
      primary: '#D63A2F',
      primaryPressed: '#B82E24',
      onPrimary: '#FFFFFF',
      accent: '#2E7D4F',
      info: '#2F5D8A',
      warning: '#A8670F',
      danger: '#B3261E',
      overlay: 'rgba(17,26,34,0.62)',
      panel: '#111A22',
      onPanel: '#EEE9E0',
    },
    fonts: {
      display: 'BigShouldersDisplay_900Black',
      heading: 'BigShouldersDisplay_700Bold',
      body: 'Barlow_400Regular',
      bodyMedium: 'Barlow_500Medium',
      bodyBold: 'Barlow_600SemiBold',
    },
    radius: { sm: 2, md: 2, lg: 2, pill: 2 },
    shape: { cut: 12, headingUppercase: true, headingLetterSpacing: 1.5 },
    panelStyle: 'bracket',
    texture: 'none',
    design: { corner: 'cut', header: 'tactical', rule: 'tick', index: 'slash', heroAngle: 22 },
    words: { gg: 'GGs', squad: 'squad', squadUp: 'Squad up', lobbies: 'Lobbies', community: 'Community' },
  },
  defuse: {
    id: 'defuse',
    name: 'Defuse',
    vibe: 'Counter-strike HUD. Desert dust, gold and CT blue.',
    dark: true,
    colors: {
      bg: '#1A1C1A',
      surface: '#232622',
      surfaceRaised: '#2D312B',
      border: '#3A3E35',
      text: '#E9E4D4',
      textMuted: '#B5AF9C',
      textFaint: '#8A8676',
      primary: '#D9A23A',
      primaryPressed: '#BF8B27',
      onPrimary: '#141614',
      accent: '#8FBF5A',
      info: '#7F9CCB',
      warning: '#D9A23A',
      danger: '#E8655A', // 4.5:1 on surface for error text
      overlay: 'rgba(10,11,10,0.72)',
      panel: '#141614',
      onPanel: '#E9E4D4',
    },
    fonts: {
      display: 'SairaCondensed_800ExtraBold',
      heading: 'SairaCondensed_700Bold',
      body: 'Saira_400Regular',
      bodyMedium: 'Saira_500Medium',
      bodyBold: 'Saira_600SemiBold',
    },
    radius: { sm: 0, md: 0, lg: 0, pill: 0 },
    shape: { cut: 0, headingUppercase: true, headingLetterSpacing: 1 },
    panelStyle: 'bracket',
    texture: 'grain',
    design: { corner: 'square', header: 'hud', rule: 'dashed', index: 'bracket', heroAngle: 0 },
    words: { gg: 'GGs', squad: 'squad', squadUp: 'Squad up', lobbies: 'Lobbies', community: 'Community' },
  },
  ronin: {
    id: 'ronin',
    name: 'Ronin',
    vibe: 'Samurai. Black lacquer, blood red and old gold.',
    dark: true,
    colors: {
      bg: '#0F0D0C',
      surface: '#1A1614',
      surfaceRaised: '#241E1B',
      border: '#2E2723',
      text: '#EAE1CF',
      textMuted: '#B8AD98',
      textFaint: '#8F8574',
      // Lifted from #A3241D so red text, links and ghost buttons reach 3:1 on the black bg.
      primary: '#C0302A',
      primaryPressed: '#A3241D',
      onPrimary: '#F4EDE0',
      accent: '#C7A363',
      info: '#C7A363',
      warning: '#C7A363',
      danger: '#D9584C',
      overlay: 'rgba(8,7,6,0.75)',
      panel: '#0B0908',
      onPanel: '#F4EDE0',
    },
    fonts: {
      display: 'ShipporiMincho_800ExtraBold',
      heading: 'ShipporiMincho_700Bold',
      body: 'ZenKakuGothicNew_400Regular',
      bodyMedium: 'ZenKakuGothicNew_500Medium',
      bodyBold: 'ZenKakuGothicNew_700Bold',
    },
    radius: { sm: 3, md: 4, lg: 6, pill: 999 },
    shape: { cut: 0, headingUppercase: false, headingLetterSpacing: 0.5, round: true },
    panelStyle: 'frame',
    texture: 'none',
    design: { corner: 'soft', header: 'ink', rule: 'brush', index: 'numero', heroAngle: 0 },
    words: { gg: 'honours', squad: 'clan', squadUp: 'Join clan', lobbies: 'Dojo', community: 'Scrolls' },
  },
};

export const THEME_ORDER: BuiltInThemeId[] = ['protocol', 'defuse', 'ronin'];
export const DEFAULT_THEME: BuiltInThemeId = 'protocol';

export function isBuiltInThemeId(id: string): id is BuiltInThemeId {
  return Object.prototype.hasOwnProperty.call(THEMES, id);
}

export function isCustomThemeId(id: string): id is `custom:${string}` {
  return id.startsWith('custom:') && id.length > 'custom:'.length;
}

/** Every font file the built-in themes and the custom-theme font ids use, keyed by family name.
 *  Files in assets/fonts are Latin-only subsets made with pyftsubset (Ronin's full Japanese files are
 *  ~24 MB; Rajdhani, IBM Plex Sans, Oswald, Black Ops One and Special Elite ship extra scripts). */
export const THEME_FONTS = {
  BigShouldersDisplay_900Black: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf'),
  BigShouldersDisplay_700Bold: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf'),
  Barlow_400Regular: require('@expo-google-fonts/barlow/400Regular/Barlow_400Regular.ttf'),
  Barlow_500Medium: require('@expo-google-fonts/barlow/500Medium/Barlow_500Medium.ttf'),
  Barlow_600SemiBold: require('@expo-google-fonts/barlow/600SemiBold/Barlow_600SemiBold.ttf'),
  SairaCondensed_800ExtraBold: require('@expo-google-fonts/saira-condensed/800ExtraBold/SairaCondensed_800ExtraBold.ttf'),
  SairaCondensed_700Bold: require('@expo-google-fonts/saira-condensed/700Bold/SairaCondensed_700Bold.ttf'),
  Saira_400Regular: require('@expo-google-fonts/saira/400Regular/Saira_400Regular.ttf'),
  Saira_500Medium: require('@expo-google-fonts/saira/500Medium/Saira_500Medium.ttf'),
  Saira_600SemiBold: require('@expo-google-fonts/saira/600SemiBold/Saira_600SemiBold.ttf'),
  ShipporiMincho_800ExtraBold: require('../../assets/fonts/ShipporiMincho_800ExtraBold.ttf'),
  ShipporiMincho_700Bold: require('../../assets/fonts/ShipporiMincho_700Bold.ttf'),
  ZenKakuGothicNew_400Regular: require('../../assets/fonts/ZenKakuGothicNew_400Regular.ttf'),
  ZenKakuGothicNew_500Medium: require('../../assets/fonts/ZenKakuGothicNew_500Medium.ttf'),
  ZenKakuGothicNew_700Bold: require('../../assets/fonts/ZenKakuGothicNew_700Bold.ttf'),
  // ── Custom-theme fonts (see src/theme/custom.ts → FONT_FAMILIES) ──
  Cinzel_800ExtraBold: require('@expo-google-fonts/cinzel/800ExtraBold/Cinzel_800ExtraBold.ttf'),
  Cinzel_700Bold: require('@expo-google-fonts/cinzel/700Bold/Cinzel_700Bold.ttf'),
  BebasNeue_400Regular: require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
  Oswald_700Bold: require('../../assets/fonts/Oswald_700Bold.ttf'),
  Oswald_600SemiBold: require('../../assets/fonts/Oswald_600SemiBold.ttf'),
  Orbitron_800ExtraBold: require('@expo-google-fonts/orbitron/800ExtraBold/Orbitron_800ExtraBold.ttf'),
  Orbitron_700Bold: require('@expo-google-fonts/orbitron/700Bold/Orbitron_700Bold.ttf'),
  BlackOpsOne_400Regular: require('../../assets/fonts/BlackOpsOne_400Regular.ttf'),
  SpecialElite_400Regular: require('../../assets/fonts/SpecialElite_400Regular.ttf'),
  Rajdhani_700Bold: require('../../assets/fonts/Rajdhani_700Bold.ttf'),
  Rajdhani_600SemiBold: require('../../assets/fonts/Rajdhani_600SemiBold.ttf'),
  MetalMania_400Regular: require('@expo-google-fonts/metal-mania/400Regular/MetalMania_400Regular.ttf'),
  Creepster_400Regular: require('@expo-google-fonts/creepster/400Regular/Creepster_400Regular.ttf'),
  AtkinsonHyperlegible_400Regular: require('@expo-google-fonts/atkinson-hyperlegible/400Regular/AtkinsonHyperlegible_400Regular.ttf'),
  AtkinsonHyperlegible_700Bold: require('@expo-google-fonts/atkinson-hyperlegible/700Bold/AtkinsonHyperlegible_700Bold.ttf'),
  IBMPlexSans_400Regular: require('../../assets/fonts/IBMPlexSans_400Regular.ttf'),
  IBMPlexSans_500Medium: require('../../assets/fonts/IBMPlexSans_500Medium.ttf'),
  IBMPlexSans_600SemiBold: require('../../assets/fonts/IBMPlexSans_600SemiBold.ttf'),
} as const;
