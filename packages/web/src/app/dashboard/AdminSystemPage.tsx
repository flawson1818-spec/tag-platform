import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { AuditLog, Backup, SystemHealth, adminApi } from '../../lib/api';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [runningBackup, setRunningBackup] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  const refreshHealth = () => {
    const token = getAccessToken();
    if (!token) return;
    setCheckingHealth(true);
    setHealthError(null);
    adminApi
      .health(token)
      .then(setHealth)
      .catch((err) => setHealthError((err as Error).message))
      .finally(() => setCheckingHealth(false));
  };

  const refreshBackups = () => {
    const token = getAccessToken();
    if (!token) return;
    adminApi
      .backups(token)
      .then((res) => setBackups(res.data))
      .catch((err) => setBackupsError((err as Error).message));
  };

  const refreshAuditLogs = () => {
    const token = getAccessToken();
    if (!token) return;
    adminApi
      .auditLogs(token, 1, entityTypeFilter || undefined)
      .then((res) => setAuditLogs(res.data))
      .catch((err) => setAuditError((err as Error).message));
  };

  useEffect(() => {
    refreshHealth();
    refreshBackups();
  }, []);

  useEffect(refreshAuditLogs, [entityTypeFilter]);

  const handleRunBackup = () => {
    const token = getAccessToken();
    if (!token) return;
    setRunningBackup(true);
    setBackupsError(null);
    adminApi
      .runBackup(token)
      .then(refreshBackups)
      .catch((err) => setBackupsError((err as Error).message))
      .finally(() => setRunningBackup(false));
  };

  if (!getAccessToken()) return <p className="hint">Connecte-toi avec un compte administrateur.</p>;

  return (
    <div className="communities-page">
      <h2>Administration — Système</h2>
      <p className="hint">
        Réservé aux comptes disposant des permissions <code>system.operate</code> et{' '}
        <code>audit_log.view</code>.
      </p>

      <h3>Santé système</h3>
      <button type="button" onClick={refreshHealth} disabled={checkingHealth}>
        {checkingHealth ? 'Vérification…' : 'Revérifier'}
      </button>
      {healthError && <p className="error">{healthError}</p>}
      {health && (
        <ul className="request-list">
          <li className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{health.status}</span>
              <span className="hint">Vérifié à {formatDateTime(health.checkedAt)}</span>
            </div>
            <p>
              Base de données : {health.database.connected ? 'connectée' : 'déconnectée'} (
              {health.database.latencyMs} ms) — uptime {Math.round(health.uptimeSeconds / 60)} min
            </p>
          </li>
        </ul>
      )}

      <h3>Sauvegardes</h3>
      <p className="hint">
        La base repose sur la Point-in-Time Recovery gérée par Supabase ; "Lancer une sauvegarde" trace
        simplement la demande.
      </p>
      <button type="button" onClick={handleRunBackup} disabled={runningBackup}>
        {runningBackup ? 'Lancement…' : 'Lancer une sauvegarde'}
      </button>
      {backupsError && <p className="error">{backupsError}</p>}
      <ul className="request-list">
        {backups.map((b) => (
          <li key={b.id} className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{b.status}</span>
              <span className="hint">{formatDateTime(b.created_at)}</span>
            </div>
            {b.note && <p className="hint">{b.note}</p>}
          </li>
        ))}
      </ul>
      {backups.length === 0 && !backupsError && <p className="hint">Aucune sauvegarde enregistrée.</p>}

      <h3>Journaux d'audit</h3>
      <div className="inline-form">
        <label htmlFor="audit-entity-filter">Filtrer par type d'entité</label>
        <input
          id="audit-entity-filter"
          type="text"
          placeholder="ex : user, testimony…"
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
        />
      </div>
      {auditError && <p className="error">{auditError}</p>}
      <ul className="request-list">
        {auditLogs.map((log) => (
          <li key={log.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{log.entity_type}</span>
              <span className="hint">{formatDateTime(log.created_at)}</span>
            </div>
            <p>
              <strong>{log.action}</strong>
              {log.entity_id && <span className="hint"> — {log.entity_id}</span>}
            </p>
          </li>
        ))}
      </ul>
      {auditLogs.length === 0 && !auditError && <p className="hint">Aucun journal pour ce filtre.</p>}
    </div>
  );
}

export default AdminSystemPage;
