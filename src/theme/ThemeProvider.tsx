import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME, THEMES, THEME_FONTS, type AppTheme, type ThemeId } from './themes';

const STORAGE_KEY = 'gg.theme';
/** Show the app with system fonts if the theme fonts haven't loaded by then. */
const FONT_TIMEOUT_MS = 6000;

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
  const [fontsTimedOut, setFontsTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFontsTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && Object.prototype.hasOwnProperty.call(THEMES, saved)) setThemeIdState(saved as ThemeId);
      })
      .catch(() => undefined)
      .finally(() => setChoiceLoaded(true));
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  // If a font fails (or takes too long) to load we still show the app with the system
  // font rather than hang on the loading screen.
  const ready = (fontsLoaded || !!fontError || fontsTimedOut) && choiceLoaded;

  const value = useMemo<ThemeState>(
    () => ({ theme: THEMES[themeId], themeId, setThemeId, ready }),
    // fontsLoaded: re-render everything once late fonts arrive after a timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId, setThemeId, ready, fontsLoaded],
  );

  // Paint nothing until the saved choice is known (a few ms), so a Defuse / Ronin
  // player never sees a flash of the default light theme.
  if (!choiceLoaded) return null;

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
