export const palette = {
  teal900: '#0B3A4A',
  teal700: '#145A6E',
  teal500: '#1F7A8C',
  mint500: '#2BB3A0',
  mint300: '#7DDBC9',
  coral600: '#C94C4C',
  red700: '#B91C1C',
  red600: '#DC2626',
  amber500: '#D97706',
  slate900: '#0F172A',
  slate700: '#334155',
  slate500: '#64748B',
  slate300: '#CBD5E1',
  slate100: '#F1F5F9',
  white: '#FFFFFF',
  black: '#000000',
};

export const lightColors = {
  background: '#F8F9FB',
  surface: palette.white,
  surfaceAlt: '#FFF1F2',
  text: palette.slate900,
  textSecondary: palette.slate500,
  border: '#E2E5EA',
  primary: palette.red700,
  primaryContrast: palette.white,
  accent: palette.red600,
  danger: palette.coral600,
  warning: palette.amber500,
  success: palette.mint500,
  bannerConnected: '#E6F7F3',
  bannerDisconnected: '#FDECEC',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors = {
  background: '#1C1012',
  surface: '#2B191C',
  surfaceAlt: '#3B2227',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#644047',
  primary: '#FCA5A5',
  primaryContrast: '#1C1012',
  accent: '#FCA5A5',
  danger: '#F07178',
  warning: '#FBBF24',
  success: palette.mint300,
  bannerConnected: '#123C3A',
  bannerDisconnected: '#3A1E1E',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export type ThemeColors = typeof lightColors;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  lg: 4,
  xl: 6,
} as const;

export const typography = {
  hero: {fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3},
  title: {fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2},
  subtitle: {fontSize: 17, fontWeight: '600' as const},
  body: {fontSize: 16, fontWeight: '400' as const},
  caption: {fontSize: 13, fontWeight: '500' as const},
  mono: {fontSize: 12, fontWeight: '400' as const, fontFamily: 'monospace' as const},
};

export const shadows = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 1,
  },
};
