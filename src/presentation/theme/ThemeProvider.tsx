import React, {createContext, useContext, useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {darkColors, lightColors, radius, spacing, typography, type ThemeColors} from './tokens';
import {useAppStore} from '../store/appStore';

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  isDark: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({children}: {children: React.ReactNode}): React.JSX.Element {
  const scheme = useColorScheme();
  const darkMode = useAppStore(s => s.settings.darkMode);
  const isDark = darkMode === 'system' ? scheme === 'dark' : darkMode === 'dark';
  const theme = useMemo<Theme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      isDark,
    }),
    [isDark],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return theme;
}
