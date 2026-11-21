// GG design system entry point.
//
// Theme-dependent values (colours, fonts, radius, shape, words) come from the
// ACTIVE theme — read them with useTheme() or makeStyles(). Spacing and font
// sizes are shared by every theme and can be imported directly.

export { ThemeProvider, makeStyles, makeThemedStyles, useCustomThemes, useTheme, useThemeSwitcher } from './ThemeProvider';
export {
  THEMES,
  THEME_ORDER,
  DEFAULT_THEME,
  isBuiltInThemeId,
  isCustomThemeId,
  type AppTheme,
  type BuiltInThemeId,
  type PanelStyle,
  type TextureId,
  type ThemeId,
} from './themes';
export {
  alpha,
  contrast,
  designLanguage,
  designTokens,
  ensureContrast,
  formatIndex,
  mixHex,
  type CornerStyle,
  type DesignLanguage,
  type DesignTokens,
  type HeaderStyle,
  type IndexStyle,
  type RuleStyle,
} from './design';
export { useDesign } from './ThemeProvider';
export { customRowId, customThemeId, specToAppTheme, validateSpec, SPEC_LIMITS, type ThemeSpec } from './custom';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  /** Gap between major page sections (editorial rhythm). */
  section: 40,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 40,
  moment: 64,
} as const;
