import { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { status } = useAuth();

  if (status === 'loading') return <p>Chargement…</p>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}
