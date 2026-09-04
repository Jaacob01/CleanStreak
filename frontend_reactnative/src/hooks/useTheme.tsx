import { useContext, createContext } from 'react';
import { ThemeColors, colors } from '../theme';

const ThemeContext = createContext<ThemeColors>(colors);

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
