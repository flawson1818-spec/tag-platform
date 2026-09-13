const THEME_KEY = 'tag.theme';

export type Theme = 'light' | 'dark';

/** null means "follow the OS/browser preference" — no explicit override has been chosen. */
export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
}

export function setStoredTheme(theme: Theme | null): void {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Per-viewer convenience only — a private window or blocked storage just falls back to
    // the OS preference every load, which is a perfectly fine default.
  }
  applyTheme(theme);
}

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}
