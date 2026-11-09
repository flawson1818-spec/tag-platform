import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MyAccess, usersApi } from '../../lib/api';
import { getAccessToken, useAuth } from './AuthContext';

interface AccessValue {
  /** false until the signed-in member's roles have been fetched. */
  loaded: boolean;
  roles: string[];
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  refresh: () => void;
}

const EMPTY: MyAccess = { roles: [], permissions: [] };
const AccessContext = createContext<AccessValue | null>(null);

/**
 * What the signed-in member may do, from GET /users/me/access. It only decides what the site
 * shows (menus, administration pages); every action is still checked by the server.
 */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [access, setAccess] = useState<{ userId: string | null; value: MyAccess }>({ userId: null, value: EMPTY });

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || !user) return;
    const userId = user.id;
    usersApi
      .myAccess(token)
      .then((value) => setAccess({ userId, value }))
      .catch(() => setAccess({ userId, value: EMPTY }));
  }, [user]);

  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status, load]);

  const value = useMemo<AccessValue>(() => {
    // Access fetched for someone else (logout, switch account) never leaks to the next member.
    const current = status === 'authenticated' && user && access.userId === user.id ? access.value : EMPTY;
    const permissions = new Set(current.permissions);
    return {
      loaded: status !== 'authenticated' || (!!user && access.userId === user.id),
      roles: current.roles,
      can: (permission) => permissions.has(permission),
      canAny: (list) => list.some((p) => permissions.has(p)),
      refresh: load,
    };
  }, [status, user, access, load]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within an AccessProvider');
  return ctx;
}
