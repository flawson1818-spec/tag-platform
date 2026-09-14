import { useTranslation } from 'react-i18next';
import { changeLocale, LOCALE_LABELS, SUPPORTED_LOCALES, SupportedLocale } from '../i18n/config';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      className="language-switcher"
      aria-label={t('nav.languageLabel')}
      value={i18n.resolvedLanguage}
      onChange={(e) => changeLocale(e.target.value as SupportedLocale)}
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALE_LABELS[locale]}
        </option>
      ))}
    </select>
  );
}

export default LanguageSwitcher;
