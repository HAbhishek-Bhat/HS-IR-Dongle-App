export const palette = {
  teal900: '#0B3A4A',
  teal700: '#145A6E',
  teal500: '#1F7A8C',
  mint500: '#2BB3A0',
  mint300: '#7DDBC9',
  coral600: '#C94C4C',
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
  background: '#F5F8FA',
  surface: palette.white,
  surfaceAlt: palette.slate100,
  text: palette.slate900,
  textSecondary: palette.slate500,
  border: palette.slate300,
  primary: palette.teal700,
  primaryContrast: palette.white,
  accent: palette.mint500,
  danger: palette.coral600,
  warning: palette.amber500,
  success: palette.mint500,
  bannerConnected: '#E6F7F3',
  bannerDisconnected: '#FDECEC',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors = {
  background: '#071820',
  surface: '#0F2A35',
  surfaceAlt: '#143442',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#1F4654',
  primary: palette.mint500,
  primaryContrast: palette.slate900,
  accent: palette.mint300,
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
};
