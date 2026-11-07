import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { CustomTheme } from '../lib/types';
import { customThemeId, specToAppTheme, validateSpec } from './custom';
import { DEFAULT_THEME, THEMES, THEME_FONTS, isBuiltInThemeId, isCustomThemeId, type AppTheme, type ThemeId } from './themes';

const STORAGE_KEY = 'gg.theme';
/** Show the app with system fonts if the theme fonts haven't loaded by then. */
const FONT_TIMEOUT_MS = 6000;

/** idle = signed out / not configured; loaded = the signed-in player's list is known. */
type CustomStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface ThemeState {
  theme: AppTheme;
  /** The theme actually shown (a saved custom theme that hasn't loaded yet shows as Protocol). */
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  /** false until fonts and the saved choice have loaded */
  ready: boolean;
  /** The signed-in player's saved AI themes, newest first (only ones that pass validateSpec). */
  customThemes: AppTheme[];
  customStatus: CustomStatus;
  refreshCustomThemes: () => Promise<void>;
  /** Add (or replace) a theme the generate-theme function just saved. */
  addCustomTheme: (theme: AppTheme) => void;
  /** Local state only — call deleteTheme() from features/themes/api first. Switches to Protocol if it was active. */
  removeCustomTheme: (id: ThemeId) => void;
  /** Local state only — call renameTheme() from features/themes/api first. */
  renameCustomTheme: (id: ThemeId, name: string) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Turns custom_themes rows into AppThemes, silently dropping any that fail validation. */
function rowsToThemes(rows: CustomTheme[]): AppTheme[] {
  const out: AppTheme[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') continue;
    const spec = validateSpec(row.spec);
    if (!spec) continue;
    out.push(specToAppTheme(spec, customThemeId(row.id), typeof row.name === 'string' ? row.name : spec.name));
  }
  return out;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts(THEME_FONTS);
  const [savedId, setSavedId] = useState<ThemeId>(DEFAULT_THEME);
  const [choiceLoaded, setChoiceLoaded] = useState(false);
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  const [customThemes, setCustomThemes] = useState<AppTheme[]>([]);
  const [customStatus, setCustomStatus] = useState<CustomStatus>('idle');
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setFontsTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && (isBuiltInThemeId(saved) || isCustomThemeId(saved))) setSavedId(saved);
      })
      .catch(() => undefined)
      .finally(() => setChoiceLoaded(true));
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setSavedId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const loadFor = useCallback(async (uid: string) => {
    setCustomStatus('loading');
    const { data, error } = await supabase
      .from('custom_themes')
      .select('id,name,spec,created_at')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });
    if (userIdRef.current !== uid) return; // signed out / switched meanwhile
    if (error) {
      setCustomStatus('error');
      return;
    }
    setCustomThemes(rowsToThemes((data ?? []) as CustomTheme[]));
    setCustomStatus('loaded');
  }, []);

  const refreshCustomThemes = useCallback(async () => {
    const uid = userIdRef.current;
    if (uid) await loadFor(uid);
  }, [loadFor]);

  // Follow the auth session directly (AuthProvider sits inside this provider).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const apply = (uid: string | null) => {
      if (!active || uid === userIdRef.current) return;
      userIdRef.current = uid;
      if (!uid) {
        setCustomThemes([]);
        setCustomStatus('idle');
        return;
      }
      setCustomThemes([]);
      void loadFor(uid);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.user.id ?? null))
      .catch(() => apply(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer so the query doesn't run inside the auth callback.
      setTimeout(() => apply(session?.user.id ?? null), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadFor]);

  // A saved custom theme that is gone from the player's list (deleted elsewhere, other
  // account) falls back to Protocol for good. While signed out / loading / on error we
  // only show Protocol and keep the saved choice.
  useEffect(() => {
    if (customStatus !== 'loaded' || !isCustomThemeId(savedId)) return;
    if (!customThemes.some((c) => c.id === savedId)) setThemeId(DEFAULT_THEME);
  }, [customStatus, customThemes, savedId, setThemeId]);

  const addCustomTheme = useCallback((theme: AppTheme) => {
    setCustomThemes((prev) => [theme, ...prev.filter((c) => c.id !== theme.id)]);
  }, []);

  const removeCustomTheme = useCallback(
    (id: ThemeId) => {
      setCustomThemes((prev) => prev.filter((c) => c.id !== id));
      setSavedId((cur) => {
        if (cur === id) {
          AsyncStorage.setItem(STORAGE_KEY, DEFAULT_THEME).catch(() => undefined);
          return DEFAULT_THEME;
        }
        return cur;
      });
    },
    [],
  );

  const renameCustomTheme = useCallback((id: ThemeId, name: string) => {
    // A new object, so makeStyles (keyed by theme object) never serves stale styles.
    setCustomThemes((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }, []);

  const theme = useMemo<AppTheme>(() => {
    if (isBuiltInThemeId(savedId)) return THEMES[savedId];
    return customThemes.find((c) => c.id === savedId) ?? THEMES[DEFAULT_THEME];
  }, [savedId, customThemes]);

  // If a font fails (or takes too long) to load we still show the app with the system
  // font rather than hang on the loading screen.
  const ready = (fontsLoaded || !!fontError || fontsTimedOut) && choiceLoaded;

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      themeId: theme.id,
      setThemeId,
      ready,
      customThemes,
      customStatus,
      refreshCustomThemes,
      addCustomTheme,
      removeCustomTheme,
      renameCustomTheme,
    }),
    // fontsLoaded: re-render everything once late fonts arrive after a timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, setThemeId, ready, fontsLoaded, customThemes, customStatus, refreshCustomThemes, addCustomTheme, removeCustomTheme, renameCustomTheme],
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

/** The signed-in player's saved AI themes and helpers to keep the list in sync. */
export function useCustomThemes() {
  const { customThemes, customStatus, refreshCustomThemes, addCustomTheme, removeCustomTheme, renameCustomTheme } = useThemeState();
  return { customThemes, customStatus, refreshCustomThemes, addCustomTheme, removeCustomTheme, renameCustomTheme };
}

/**
 * Theme-aware styles. Define once at module level, call inside the component:
 *
 *   const useStyles = makeStyles((t) => StyleSheet.create({ title: { color: t.colors.text, fontFamily: t.fonts.heading } }));
 *   function Screen() { const s = useStyles(); ... }
 *
 * Cached per theme OBJECT: built-ins are static, and a custom theme gets a new object
 * whenever it is reloaded, renamed or regenerated, so styles are never stale.
 */
export function makeStyles<T>(factory: (t: AppTheme) => T): () => T {
  const cache = new WeakMap<AppTheme, T>();
  return function useStyles() {
    const t = useTheme();
    let styles = cache.get(t);
    if (!styles) {
      styles = factory(t);
      cache.set(t, styles);
    }
    return styles;
  };
}

/** Styles for an explicit theme (e.g. a preview of a theme that isn't active). */
export function makeThemedStyles<T>(factory: (t: AppTheme) => T): (t: AppTheme) => T {
  const cache = new WeakMap<AppTheme, T>();
  return (t) => {
    let styles = cache.get(t);
    if (!styles) {
      styles = factory(t);
      cache.set(t, styles);
    }
    return styles;
  };
}
