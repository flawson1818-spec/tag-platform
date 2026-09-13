import { useState } from 'react';
import { getStoredTheme, prefersDark, setStoredTheme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => getStoredTheme());
  const isDark = theme === 'dark' || (theme === null && prefersDark());

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    setStoredTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

export default ThemeToggle;
