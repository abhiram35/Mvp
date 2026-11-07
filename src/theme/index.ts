// SquadUp design tokens. Every screen and component must use these values
// instead of hard-coded colours, sizes or fonts.

export const colors = {
  bg: '#0B0D12', // app background
  surface: '#141821', // cards, inputs
  surfaceRaised: '#1C2230', // pressed / elevated surfaces, modals
  border: '#262D3D',
  text: '#F2F4F8',
  textMuted: '#9AA3B5',
  textFaint: '#5F687A',
  primary: '#7C5CFF', // brand violet
  primaryPressed: '#6646F0',
  onPrimary: '#FFFFFF',
  accent: '#2EE6A6', // "online / open / success" green
  warning: '#FFB547',
  danger: '#FF5470',
  overlay: 'rgba(5, 6, 10, 0.72)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const theme = { colors, spacing, radius, font };
export type Theme = typeof theme;
