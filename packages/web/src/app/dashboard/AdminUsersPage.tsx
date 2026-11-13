import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { useAccess } from '../auth/AccessContext';
import { AdminUser, ROLE_HIERARCHY, rolesApi, usersApi } from '../../lib/api';
import { Pagination } from '../Pagination';
import { isPhoneAccountEmail } from '../../lib/features';

type Status = 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
/** The role most often given: someone who joins the prayer watch. */
const DEFAULT_ROLE = 'INTERCESSEUR';
const rank = (code: string) => ROLE_HIERARCHY.indexOf(code as (typeof ROLE_HIERARCHY)[number]);

/** Members and roles: find a member, see their roles, give or take away a role, change their status. */
export function AdminUsersPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const { roles: myRoles, can } = useAccess();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});

  // Same rule as the server: up to Pasteur, up to Administrateur for a Super Administrateur.
  const maxRank = myRoles.includes('SUPER_ADMINISTRATEUR') ? rank('ADMINISTRATEUR') : rank('PASTEUR');
  const assignable = ROLE_HIERARCHY.filter((r) => rank(r) <= maxRank);
  const canAssign = can('role.assign');
  const canManage = can('user.manage');

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    usersApi
      .list(token, page, undefined, query || undefined)
      .then((res) => {
        setUsers(res.data);
        setTotalPages(res.meta.totalPages);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [page, query]);

  useEffect(load, [load]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setLoading(true);
    setQuery(search.trim());
  };

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const addRole = (u: AdminUser) => {
    const token = getAccessToken();
    const role = picked[u.id] ?? DEFAULT_ROLE;
    if (!token || !role) return;
    void run(() => rolesApi.assign(token, u.id, role), t('adminUsers.roleGiven', { role: t(`roles.${role}`), name: u.display_name }));
  };

  const removeRole = (u: AdminUser, role: string) => {
    const token = getAccessToken();
    if (!token) return;
    if (!window.confirm(t('adminUsers.confirmRemove', { role: t(`roles.${role}`), name: u.display_name }))) return;
    void run(() => rolesApi.revoke(token, u.id, role), t('adminUsers.roleRemoved', { role: t(`roles.${role}`), name: u.display_name }));
  };

  const setStatus = (u: AdminUser, status: Status) => {
    const token = getAccessToken();
    if (!token) return;
    void run(() => usersApi.updateStatus(token, u.id, status), t('adminUsers.statusChanged', { name: u.display_name }));
  };

  return (
    <section className="admin-users">
      <h2>{t('adminUsers.title')}</h2>
      <p className="hint">{t('adminUsers.intro')}</p>

      <form className="admin-search" onSubmit={onSearch} role="search">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('adminUsers.searchPlaceholder')}
          aria-label={t('adminUsers.searchPlaceholder')}
        />
        <button type="submit">{t('adminUsers.search')}</button>
      </form>

      {notice && <p className="admin-notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">{t('adminUsers.loading')}</p>}

      <ul className="admin-member-list">
        {users.map((u) => {
          const isMe = u.id === me?.id;
          const roles = [...(u.roles ?? [])].sort((a, b) => rank(b) - rank(a));
          return (
            <li key={u.id} className="admin-member">
              <div className="admin-member-head">
                <div>
                  <strong>{u.display_name}</strong>
                  {isMe && <span className="hint"> · {t('adminUsers.you')}</span>}
                  <div className="hint">{isPhoneAccountEmail(u.email) ? `📱 ${u.phone ?? ''}` : u.email}</div>
                </div>
                <span className={`chip admin-status admin-status-${u.status.toLowerCase()}`}>
                  {t(`userStatuses.${u.status}`, u.status)}
                </span>
              </div>

              <div className="admin-roles">
                {roles.length === 0 && <span className="hint">{t('adminUsers.noRole')}</span>}
                {roles.map((role) => {
                  const removable = canAssign && rank(role) <= maxRank && !(isMe && rank(role) >= rank('ADMINISTRATEUR'));
                  return (
                    <span key={role} className={`admin-role-chip${rank(role) >= rank('ADMINISTRATEUR') ? ' is-high' : ''}`}>
                      {t(`roles.${role}`, role)}
                      {removable && (
                        <button
                          type="button"
                          onClick={() => removeRole(u, role)}
                          aria-label={t('adminUsers.removeRole', { role: t(`roles.${role}`) })}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>

              <div className="admin-member-actions">
                {canAssign && (
                  <span className="admin-add-role">
                    <select
                      value={picked[u.id] ?? DEFAULT_ROLE}
                      onChange={(e) => setPicked({ ...picked, [u.id]: e.target.value })}
                      aria-label={t('adminUsers.roleToGive', { name: u.display_name })}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`, r)}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => addRole(u)}>
                      {t('adminUsers.give')}
                    </button>
                  </span>
                )}
                {canManage && !isMe && (
                  <span className="admin-status-actions">
                    {(['ACTIVE', 'LOCKED', 'SUSPENDED'] as Status[]).map((s) => (
                      <button key={s} type="button" className="admin-status-button" disabled={u.status === s} onClick={() => setStatus(u, s)}>
                        {t(`adminUsers.status.${s}`)}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && users.length === 0 && !error && <p className="hint">{t('adminUsers.noUsers')}</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </section>
  );
}

export default AdminUsersPage;
