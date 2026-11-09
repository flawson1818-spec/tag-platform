import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { useAccess } from '../auth/AccessContext';
import { AdminOverview, ROLE_HIERARCHY, usersApi } from '../../lib/api';
import { ADMIN_SECTIONS } from './adminSections';

const FIGURES: (keyof AdminOverview)[] = ['members', 'newMembers', 'newRequests', 'activePrograms', 'postsThisWeek', 'testimoniesThisWeek'];

/** The administration home: who I am here, the key figures, and every area my roles open. */
export function AdminHomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roles, canAny, can } = useAccess();
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !can('user.manage')) return;
    usersApi.adminOverview(token).then(setOverview).catch(() => setOverview(null));
  }, [can]);

  const sections = ADMIN_SECTIONS.filter((s) => canAny(s.permissions));
  const highest = [...roles].sort((a, b) => ROLE_HIERARCHY.indexOf(b as never) - ROLE_HIERARCHY.indexOf(a as never))[0];

  return (
    <section className="admin-home">
      <div className="admin-hero">
        <div>
          <p className="admin-eyebrow">{t('admin.eyebrow')}</p>
          <h2>{t('admin.title')}</h2>
          <p className="hint">{t('admin.intro', { name: user?.display_name ?? '' })}</p>
        </div>
        {highest && <span className="admin-role-badge">{t(`roles.${highest}`, highest)}</span>}
      </div>

      {overview && (
        <div className="admin-figures">
          {FIGURES.map((key) => (
            <div key={key} className="admin-figure">
              <strong>{overview[key]}</strong>
              <span>{t(`admin.figures.${key}`)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="admin-sections">
        {sections.map((s) => (
          <Link key={s.to} to={s.to} className="admin-section-card">
            <span className="admin-section-icon" aria-hidden="true">
              {s.icon}
            </span>
            <span>
              <strong>{t(`admin.sections.${s.key}.label`)}</strong>
              <span className="hint">{t(`admin.sections.${s.key}.description`)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
