// GG design system entry point.
//
// Theme-dependent values (colours, fonts, radius, shape, words) come from the
// ACTIVE theme — read them with useTheme() or makeStyles(). Spacing and font
// sizes are shared by every theme and can be imported directly.

export { ThemeProvider, makeStyles, useTheme, useThemeSwitcher } from './ThemeProvider';
export { THEMES, THEME_ORDER, DEFAULT_THEME, type AppTheme, type ThemeId } from './themes';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
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
