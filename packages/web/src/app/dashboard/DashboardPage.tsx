import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

const QUICK_LINK_KEYS = [
  { to: '/room', key: 'room' },
  { to: '/prayer-requests', key: 'prayerRequests' },
  { to: '/testimonies', key: 'testimonies' },
  { to: '/communities', key: 'communities' },
  { to: '/world-map', key: 'worldMap' },
];

const MANAGEMENT_LINK_KEYS = [
  { to: '/programs', key: 'programs' },
  { to: '/room/moderate', key: 'moderateRoom' },
  { to: '/social-publications', key: 'socialPublications' },
  { to: '/admin/moderation', key: 'moderationQueue' },
  { to: '/admin/users', key: 'adminUsers' },
  { to: '/admin/analytics', key: 'adminAnalytics' },
  { to: '/admin/system', key: 'adminSystem' },
];

const SECURITY_LINK_KEYS = [
  { to: '/security/mfa', key: 'mfa' },
  { to: '/profile', key: 'profile' },
];

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="dashboard-page">
      <h2>{t('dashboard.welcome', { name: user.display_name })}</h2>
      {!user.email_verified_at && (
        <p className="hint">
          {t('dashboard.emailUnverified')} <Link to="/onboarding">{t('dashboard.verifyIt')}</Link>.
        </p>
      )}
      <dl className="user-summary">
        <dt>{t('dashboard.emailLabel')}</dt>
        <dd>{user.email}</dd>
        <dt>{t('dashboard.statusLabel')}</dt>
        <dd>{user.status}</dd>
        <dt>{t('dashboard.languageLabel')}</dt>
        <dd>{user.locale}</dd>
        <dt>{t('dashboard.timezoneLabel')}</dt>
        <dd>{user.timezone}</dd>
        <dt>{t('dashboard.mfaLabel')}</dt>
        <dd>{user.mfa_enabled ? t('dashboard.mfaEnabled') : t('dashboard.mfaDisabled')}</dd>
      </dl>

      <h3>{t('dashboard.quickAccessTitle')}</h3>
      <div className="quick-links">
        {QUICK_LINK_KEYS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-link-card">
            <strong>{t(`dashboard.links.${link.key}.label`)}</strong>
            <span>{t(`dashboard.links.${link.key}.description`)}</span>
          </Link>
        ))}
      </div>

      <h3>{t('dashboard.managementTitle')}</h3>
      <p className="hint">{t('dashboard.managementIntro')}</p>
      <div className="quick-links">
        {MANAGEMENT_LINK_KEYS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-link-card quick-link-card-muted">
            <strong>{t(`dashboard.links.${link.key}.label`)}</strong>
            <span>{t(`dashboard.links.${link.key}.description`)}</span>
          </Link>
        ))}
      </div>

      <h3>{t('dashboard.securityTitle')}</h3>
      <div className="quick-links">
        {SECURITY_LINK_KEYS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-link-card quick-link-card-muted">
            <strong>{t(`dashboard.links.${link.key}.label`)}</strong>
            <span>{t(`dashboard.links.${link.key}.description`)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default DashboardPage;
