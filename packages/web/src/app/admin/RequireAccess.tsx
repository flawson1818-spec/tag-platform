import { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccess } from '../auth/AccessContext';

/** Shows an administration page only to members holding one of `permissions`. */
export function RequireAccess({ permissions, children }: { permissions: string[]; children: ReactElement }) {
  const { t } = useTranslation();
  const { loaded, canAny } = useAccess();
  if (!loaded) return <p className="hint">{t('posts.loading')}</p>;
  if (!canAny(permissions)) {
    return (
      <section className="admin-denied">
        <h2>{t('admin.deniedTitle')}</h2>
        <p className="hint">{t('admin.deniedText')}</p>
        <Link to="/dashboard">{t('admin.backToDashboard')}</Link>
      </section>
    );
  }
  return children;
}
