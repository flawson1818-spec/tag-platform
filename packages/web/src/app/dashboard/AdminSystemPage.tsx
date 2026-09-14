import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { AuditLog, Backup, SystemHealth, adminApi } from '../../lib/api';
import i18n from '../../i18n/config';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function AdminSystemPage() {
  const { t } = useTranslation();
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

  if (!getAccessToken()) return <p className="hint">{t('adminSystem.needLogin')}</p>;

  return (
    <div className="communities-page">
      <h2>{t('adminSystem.title')}</h2>
      <p className="hint">
        {t('adminSystem.introPrefix')} <code>system.operate</code> {t('adminSystem.introMiddle')}{' '}
        <code>audit_log.view</code> {t('adminSystem.introSuffix')}
      </p>

      <h3>{t('adminSystem.healthTitle')}</h3>
      <button type="button" onClick={refreshHealth} disabled={checkingHealth}>
        {checkingHealth ? t('adminSystem.checking') : t('adminSystem.recheck')}
      </button>
      {healthError && <p className="error">{healthError}</p>}
      {health && (
        <ul className="request-list">
          <li className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{t(`systemHealthStatuses.${health.status}`, health.status)}</span>
              <span className="hint">{t('adminSystem.checkedAt', { time: formatDateTime(health.checkedAt) })}</span>
            </div>
            <p>
              {t('adminSystem.dbStatusLine', {
                status: health.database.connected ? t('adminSystem.dbConnected') : t('adminSystem.dbDisconnected'),
                latency: health.database.latencyMs,
                uptime: Math.round(health.uptimeSeconds / 60),
              })}
            </p>
          </li>
        </ul>
      )}

      <h3>{t('adminSystem.backupsTitle')}</h3>
      <p className="hint">{t('adminSystem.backupsIntro')}</p>
      <button type="button" onClick={handleRunBackup} disabled={runningBackup}>
        {runningBackup ? t('adminSystem.launching') : t('adminSystem.runBackup')}
      </button>
      {backupsError && <p className="error">{backupsError}</p>}
      <ul className="request-list">
        {backups.map((b) => (
          <li key={b.id} className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{t(`backupStatuses.${b.status}`, b.status)}</span>
              <span className="hint">{formatDateTime(b.created_at)}</span>
            </div>
            {b.note && <p className="hint">{b.note}</p>}
          </li>
        ))}
      </ul>
      {backups.length === 0 && !backupsError && <p className="hint">{t('adminSystem.noBackups')}</p>}

      <h3>{t('adminSystem.auditTitle')}</h3>
      <div className="inline-form">
        <label htmlFor="audit-entity-filter">{t('adminSystem.filterByEntity')}</label>
        <input
          id="audit-entity-filter"
          type="text"
          placeholder={t('adminSystem.entityPlaceholder')}
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
      {auditLogs.length === 0 && !auditError && <p className="hint">{t('adminSystem.noLogs')}</p>}
    </div>
  );
}

export default AdminSystemPage;
