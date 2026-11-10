import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Application, applicationsApi } from '../../lib/api';
import { ApplicationStatus } from '../applications/ApplicationsPage';

/** Applications to review: intercessors and churches/groups. Approving changes roles or creates the community. */
export function AdminApplicationsPage() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState('PENDING');
  const [items, setItems] = useState<Application[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    applicationsApi
      .list(token, status)
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [status]);
  useEffect(load, [load]);

  const decide = (a: Application, decision: 'APPROVED' | 'REJECTED') => {
    const token = getAccessToken();
    if (!token) return;
    applicationsApi
      .review(token, a.id, decision, notes[a.id]?.trim() || undefined)
      .then(load)
      .catch((err) => setError((err as Error).message));
  };

  const field = (a: Application, key: string) => (a.payload[key] ? String(a.payload[key]) : null);

  return (
    <section className="admin-requests">
      <h2>{t('applications.adminTitle')}</h2>
      <p className="hint">{t('applications.adminIntro')}</p>
      <div className="admin-requests-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('prayerRequests.statusLabel')}>
          {['PENDING', 'APPROVED', 'REJECTED', ''].map((s) => (
            <option key={s} value={s}>
              {s ? t(`applications.status.${s}`) : t('prayerRequests.allStatuses')}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {items === null && !error && <p className="hint">{t('posts.loading')}</p>}
      {items?.length === 0 && <p className="hint">{t('applications.adminEmpty')}</p>}
      <ul className="admin-member-list">
        {items?.map((a) => (
          <li key={a.id} className="admin-member">
            <div className="admin-member-head">
              <div>
                <strong>{a.kind === 'COMMUNITY' ? field(a, 'name') : a.applicant.displayName}</strong>
                <span className="hint">
                  {' '}
                  · {t(`applications.kind.${a.kind}`)} · {new Date(a.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <ApplicationStatus status={a.status} />
            </div>
            {a.kind === 'INTERCESSOR' ? (
              <>
                <p className="admin-request-text">{field(a, 'motivation')}</p>
                {field(a, 'availability') && <p className="hint"><span aria-hidden="true">⏰</span> {field(a, 'availability')}</p>}
                {Array.isArray(a.payload.prayerSkills) && a.payload.prayerSkills.length > 0 && (
                  <div className="request-meta">
                    {(a.payload.prayerSkills as string[]).map((s) => (
                      <span key={s} className="chip">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="hint">
                  {t(`communityTypes.${field(a, 'type')}`, field(a, 'type') ?? '')} · {[field(a, 'city'), field(a, 'country')].filter(Boolean).join(', ')} ·{' '}
                  {t('applications.by', { name: a.applicant.displayName })}
                </p>
                {field(a, 'mission') && <p className="admin-request-text">{field(a, 'mission')}</p>}
                {field(a, 'contactPhone') && <p className="hint"><span aria-hidden="true">📞</span> {field(a, 'contactPhone')}</p>}
              </>
            )}
            {a.status === 'PENDING' && (
              <div className="admin-member-actions">
                <input
                  className="admin-note"
                  placeholder={t('applications.notePlaceholder')}
                  value={notes[a.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                  maxLength={1000}
                  aria-label={t('applications.notePlaceholder')}
                />
                <span className="admin-status-actions">
                  <button type="button" onClick={() => decide(a, 'APPROVED')}>
                    {t('applications.approve')}
                  </button>
                  <button type="button" className="admin-status-button admin-status-button-visible" onClick={() => decide(a, 'REJECTED')}>
                    {t('applications.reject')}
                  </button>
                </span>
              </div>
            )}
            {a.reviewNote && a.status !== 'PENDING' && <p className="hint">« {a.reviewNote} »</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
