import { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { t } = useTranslation();
  const { status } = useAuth();

  if (status === 'loading') return <p>{t('events.loading')}</p>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}
