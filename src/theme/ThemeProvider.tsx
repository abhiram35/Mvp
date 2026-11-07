import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME, THEMES, THEME_FONTS, type AppTheme, type ThemeId } from './themes';

const STORAGE_KEY = 'gg.theme';

interface ThemeState {
  theme: AppTheme;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  /** false until fonts and the saved choice have loaded */
  ready: boolean;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts(THEME_FONTS);
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME);
  const [choiceLoaded, setChoiceLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && saved in THEMES) setThemeIdState(saved as ThemeId);
      })
      .catch(() => undefined)
      .finally(() => setChoiceLoaded(true));
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  // If a font fails to load we still show the app (system font fallback) rather than hang.
  const ready = (fontsLoaded || !!fontError) && choiceLoaded;

  const value = useMemo<ThemeState>(
    () => ({ theme: THEMES[themeId], themeId, setThemeId, ready }),
    [themeId, setThemeId, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeState(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** The active theme: colours, fonts, radius, shape and theme words. */
export function useTheme(): AppTheme {
  return useThemeState().theme;
}

/** Read and change the active theme (for the theme picker). */
export function useThemeSwitcher() {
  const { themeId, setThemeId, ready } = useThemeState();
  return { themeId, setThemeId, ready };
}

/**
 * Theme-aware styles. Define once at module level, call inside the component:
 *
 *   const useStyles = makeStyles((t) => StyleSheet.create({ title: { color: t.colors.text, fontFamily: t.fonts.heading } }));
 *   function Screen() { const s = useStyles(); ... }
 */
export function makeStyles<T>(factory: (t: AppTheme) => T): () => T {
  const cache = new Map<ThemeId, T>();
  return function useStyles() {
    const t = useTheme();
    let styles = cache.get(t.id);
    if (!styles) {
      styles = factory(t);
      cache.set(t.id, styles);
    }
    return styles;
  };
}
