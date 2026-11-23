import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onUpdateAvailable } from '../lib/update';

/** "Une nouvelle version est disponible": one tap and the installed app is up to date. */
export function UpdateBanner() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  useEffect(() => onUpdateAvailable(() => setAvailable(true)), []);
  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span aria-hidden="true">✨</span>
      <span>{t('update.available')}</span>
      <button type="button" onClick={() => window.location.reload()}>{t('update.reload')}</button>
    </div>
  );
}
