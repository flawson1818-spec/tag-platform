import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { AuthUser, ROLE_HIERARCHY, rolesApi, usersApi } from '../../lib/api';
import { Pagination } from '../Pagination';
import i18n from '../../i18n/config';

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(() =>
    getAccessToken() ? null : i18n.t('adminUsers.needLogin'),
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState<string>(ROLE_HIERARCHY[0]);
  const [targetUserId, setTargetUserId] = useState('');

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    usersApi
      .list(token, page)
      .then((res) => {
        setUsers(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page]);

  const handleStatusChange = (id: string, status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED') => {
    const token = getAccessToken();
    if (!token) return;
    setActionError(null);
    usersApi
      .updateStatus(token, id, status)
      .then(refresh)
      .catch((err) => setActionError((err as Error).message));
  };

  const handleAssignRole = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !targetUserId) return;
    setActionError(null);
    rolesApi
      .assign(token, targetUserId, roleCode)
      .then(refresh)
      .catch((err) => setActionError((err as Error).message));
  };

  const handleRevokeRole = () => {
    const token = getAccessToken();
    if (!token || !targetUserId) return;
    setActionError(null);
    rolesApi
      .revoke(token, targetUserId, roleCode)
      .then(refresh)
      .catch((err) => setActionError((err as Error).message));
  };

  return (
    <div className="communities-page">
      <h2>{t('adminUsers.title')}</h2>
      <p className="hint">
        {t('adminUsers.introPrefix')} <code>user.manage</code> {t('adminUsers.introMiddle')}{' '}
        <code>role.assign</code> {t('adminUsers.introSuffix')}
      </p>

      <form onSubmit={handleAssignRole} className="request-form">
        <input
          type="text"
          placeholder={t('adminUsers.userIdPlaceholder')}
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          required
        />
        <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
          {ROLE_HIERARCHY.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`, r)}
            </option>
          ))}
        </select>
        <button type="submit">{t('adminUsers.assign')}</button>
        <button type="button" onClick={handleRevokeRole}>
          {t('adminUsers.revoke')}
        </button>
      </form>
      {actionError && <p className="error">{actionError}</p>}

      {loading && <p>{t('adminUsers.loading')}</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {users.map((u) => (
          <li key={u.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`userStatuses.${u.status}`, u.status)}</span>
              <span className="hint">{u.id}</span>
            </div>
            <p>
              <strong>{u.display_name}</strong> — {u.email}
            </p>
            <div className="request-form">
              <button onClick={() => handleStatusChange(u.id, 'ACTIVE')} disabled={u.status === 'ACTIVE'}>
                {t('adminUsers.activate')}
              </button>
              <button onClick={() => handleStatusChange(u.id, 'LOCKED')} disabled={u.status === 'LOCKED'}>
                {t('adminUsers.lock')}
              </button>
              <button onClick={() => handleStatusChange(u.id, 'SUSPENDED')} disabled={u.status === 'SUSPENDED'}>
                {t('adminUsers.suspend')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && users.length === 0 && !error && <p className="hint">{t('adminUsers.noUsers')}</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default AdminUsersPage;
