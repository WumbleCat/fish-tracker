import { afterEach, describe, expect, it } from 'vitest';

import { applyTheme, nextTheme, readTheme, resolveTheme, THEME_KEY } from './theme';

afterEach(() => {
  localStorage.removeItem(THEME_KEY);
  document.documentElement.classList.remove('dark');
});

describe('theme', () => {
  it('resolves system to whatever the OS prefers, and explicit choices to themselves', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('cycles light → dark → system → light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });

  it('reads a saved choice and falls back to system for anything else', () => {
    expect(readTheme()).toBe('system');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readTheme()).toBe('dark');
    localStorage.setItem(THEME_KEY, 'garbage');
    expect(readTheme()).toBe('system');
  });

  it('applies dark as a class on <html> and removes it for light', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
