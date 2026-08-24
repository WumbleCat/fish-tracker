/** Light / dark / follow-the-system. The choice persists per browser and
 * is applied as a `dark` class on <html>, which index.css keys the whole
 * palette off. index.html applies the same rule inline before first paint. */

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export const THEME_KEY = 'fish-theme';
const ORDER: Theme[] = ['light', 'dark', 'system'];

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
}

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', resolveTheme(theme, systemPrefersDark()) === 'dark');
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || !window.matchMedia) return;
    // following the system: re-apply when the OS switches
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    setThemeState(next);
  };

  return [theme, setTheme];
}
