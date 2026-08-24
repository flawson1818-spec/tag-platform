import { FormEvent, useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { AuthUser, ROLE_HIERARCHY, rolesApi, usersApi } from '../../lib/api';
import { Pagination } from '../Pagination';

export function AdminUsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(() =>
    getAccessToken() ? null : 'Connecte-toi pour gérer les utilisateurs.',
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
      <h2>Gestion des utilisateurs</h2>
      <p className="hint">
        Réservé aux comptes disposant de la permission <code>user.manage</code> (liste, statut) et{' '}
        <code>role.assign</code> (rôles, jusqu'à Pasteur inclus).
      </p>

      <form onSubmit={handleAssignRole} className="request-form">
        <input
          type="text"
          placeholder="ID de l'utilisateur (uuid)"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          required
        />
        <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
          {ROLE_HIERARCHY.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit">Attribuer</button>
        <button type="button" onClick={handleRevokeRole}>
          Révoquer
        </button>
      </form>
      {actionError && <p className="error">{actionError}</p>}

      {loading && <p>Chargement…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {users.map((u) => (
          <li key={u.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{u.status}</span>
              <span className="hint">{u.id}</span>
            </div>
            <p>
              <strong>{u.display_name}</strong> — {u.email}
            </p>
            <div className="request-form">
              <button onClick={() => handleStatusChange(u.id, 'ACTIVE')} disabled={u.status === 'ACTIVE'}>
                Activer
              </button>
              <button onClick={() => handleStatusChange(u.id, 'LOCKED')} disabled={u.status === 'LOCKED'}>
                Verrouiller
              </button>
              <button onClick={() => handleStatusChange(u.id, 'SUSPENDED')} disabled={u.status === 'SUSPENDED'}>
                Suspendre
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && users.length === 0 && !error && <p className="hint">Aucun utilisateur.</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default AdminUsersPage;
