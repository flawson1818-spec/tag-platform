import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** The platform's Facebook page; a deployment can point elsewhere with VITE_FACEBOOK_URL. */
export const FACEBOOK_URL = import.meta.env.VITE_FACEBOOK_URL || 'https://www.facebook.com/Touravantgarde/';

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="site-footer">
      <p className="site-footer-brand">{t('footer.tagline')}</p>
      <a className="site-footer-facebook" href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
        </svg>
        <span>{t('footer.facebook')}</span>
      </a>
      <nav className="site-footer-links" aria-label={t('footer.links')}>
        <Link to="/room">{t('nav.room')}</Link>
        <Link to="/testimonies">{t('nav.testimonies')}</Link>
        <Link to="/world-map">{t('nav.worldMap')}</Link>
      </nav>
      <p className="site-footer-copy">© {new Date().getFullYear()} Tour d&apos;avant-garde</p>
    </footer>
  );
}
