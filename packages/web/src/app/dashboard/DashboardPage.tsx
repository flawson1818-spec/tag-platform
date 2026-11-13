import { EMAIL_VERIFICATION_ON, isPhoneAccountEmail } from '../../lib/features';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useAccess } from '../auth/AccessContext';
import { ADMIN_SECTIONS } from '../admin/adminSections';

const QUICK_LINK_KEYS = [
  { to: '/room', key: 'room' },
  { to: '/prayer-requests', key: 'prayerRequests' },
  { to: '/testimonies', key: 'testimonies' },
  { to: '/communities', key: 'communities' },
  { to: '/world-map', key: 'worldMap' },
];


const SECURITY_LINK_KEYS = [
  { to: '/security/mfa', key: 'mfa' },
  { to: '/profile', key: 'profile' },
];

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canAny } = useAccess();
  const adminSections = ADMIN_SECTIONS.filter((section) => canAny(section.permissions));

  if (!user) return null;

  return (
    <div className="dashboard-page">
      <h2>{t('dashboard.welcome', { name: user.display_name })}</h2>
      {EMAIL_VERIFICATION_ON && !user.email_verified_at && !isPhoneAccountEmail(user.email) && (
        <p className="hint">
          {t('dashboard.emailUnverified')} <Link to="/onboarding">{t('dashboard.verifyIt')}</Link>.
        </p>
      )}
      <dl className="user-summary">
        <dt>{t('dashboard.emailLabel')}</dt>
        <dd>{isPhoneAccountEmail(user.email) ? (user.phone ?? '—') : user.email}</dd>
        <dt>{t('dashboard.statusLabel')}</dt>
        <dd>{t(`userStatuses.${user.status}`, user.status)}</dd>
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

      {adminSections.length > 0 && (
        <>
          <h3>{t('dashboard.managementTitle')}</h3>
          <Link to="/admin" className="admin-entry">
            <span aria-hidden="true">🛡️</span>
            <span>
              <strong>{t('admin.title')}</strong>
              <span className="hint">{t('dashboard.adminEntry')}</span>
            </span>
          </Link>
          <div className="quick-links">
            {adminSections.map((section) => (
              <Link key={section.to} to={section.to} className="quick-link-card">
                <strong>{t(`admin.sections.${section.key}.label`)}</strong>
                <span>{t(`admin.sections.${section.key}.description`)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

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
