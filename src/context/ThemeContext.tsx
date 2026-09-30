import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { setAppStatusBarStyle } from '../lib/native/statusBar';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'roommate_theme';

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return getSystemPrefersDark() ? 'dark' : 'light';
}

function syncThemeToEnvironment(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Sync PWA/Browser Status Bar Meta Color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', resolved === 'dark' ? '#0B0B10' : '#F9F9FF');
  }

  // Sync Capacitor Native Mobile Status Bar
  setAppStatusBarStyle(
    resolved === 'dark' ? 'DARK' : 'LIGHT',
    resolved === 'dark' ? '#0B0B10' : '#F9F9FF'
  ).catch(() => {
    // Ignore native plugin failure on web
  });
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    if (typeof localStorage === 'undefined') return 'system';
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference;
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  const applyThemePreference = useCallback((preference: ThemePreference) => {
    const resolved = resolveTheme(preference);
    setThemeState(preference);
    setResolvedTheme(resolved);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }

    syncThemeToEnvironment(resolved);

    // Notify listeners
    window.dispatchEvent(
      new CustomEvent('roommate_theme_changed', {
        detail: { preference, resolvedTheme: resolved },
      })
    );
  }, []);

  // Handle system appearance changes reactively
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = () => {
      // Only reactively adapt if user preference is set to 'system'
      const currentPref = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || 'system';
      if (currentPref === 'system') {
        const resolved = resolveTheme('system');
        setResolvedTheme(resolved);
        syncThemeToEnvironment(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);

    // Run initial sync on mount to ensure class & status bar align with storage
    const currentResolved = resolveTheme(theme);
    syncThemeToEnvironment(currentResolved);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme: applyThemePreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
