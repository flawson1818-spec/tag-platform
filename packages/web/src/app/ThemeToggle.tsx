import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getStoredTheme, prefersDark, setStoredTheme } from '../lib/theme';

export function ThemeToggle() {
  const { t } = useTranslation();
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
      aria-label={isDark ? t('themeToggle.switchToLight') : t('themeToggle.switchToDark')}
      title={isDark ? t('themeToggle.lightTheme') : t('themeToggle.darkTheme')}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

export default ThemeToggle;
