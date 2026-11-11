import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { useAccess } from '../auth/AccessContext';
import { LeaderCandidate, PRAYER_REQUEST_CATEGORIES, PrayerProgram, PrayerRequest, prayerApi, prayerRequestsApi } from '../../lib/api';
import { Pagination } from '../Pagination';
import { RecommendedIntercessors } from './RecommendedIntercessors';
import { MobilizeGroup } from './MobilizeGroup';
import { RequestPhoto, RequestStatus } from '../prayer-requests/PrayerRequestsPage';

const STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED', 'ARCHIVED'];
/** The next steps a request can take (docs/10_STATE_MACHINES.md). */
const NEXT: Record<string, string[]> = {
  NEW: ['ARCHIVED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING', 'ANSWERED'],
  WAITING: ['ANSWERED'],
  ANSWERED: ['ARCHIVED'],
  ARCHIVED: ['RESTORED'],
  RESTORED: ['NEW'],
};

/** The administration's inbox: every request arrives here, is entrusted to an intercessor, followed to its answer. */
export function AdminPrayerRequestsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAccess();
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('NEW');
  const [category, setCategory] = useState('');
  const [intercessors, setIntercessors] = useState<LeaderCandidate[]>([]);
  const [programs, setPrograms] = useState<PrayerProgram[]>([]);
  const canPromote = can('prayer_request.promote');

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    prayerRequestsApi
      .list(token, page, { status: status || undefined, category: category || undefined })
      .then((res) => {
        setRequests(res.data);
        setTotalPages(res.meta.totalPages);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [page, status, category]);

  useEffect(load, [load]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    prayerApi.leaderCandidates(token).then(setIntercessors).catch(() => setIntercessors([]));
    prayerApi
      .listPrograms()
      .then((res) => setPrograms(res.data.filter((p) => p.status === 'ACTIVE')))
      .catch(() => setPrograms([]));
  }, []);

  const filter = (setter: (v: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
    setLoading(true);
  };

  const act = (action: (token: string) => Promise<unknown>) => {
    const token = getAccessToken();
    if (!token) return;
    action(token)
      .then(load)
      .catch((err) => setError((err as Error).message));
  };

  return (
    <section className="admin-requests">
      <h2>{t('adminRequests.title')}</h2>
      <p className="hint">{t('adminRequests.intro')}</p>

      <div className="admin-requests-filters">
        <select value={status} onChange={filter(setStatus)} aria-label={t('prayerRequests.statusLabel')}>
          <option value="">{t('prayerRequests.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`requestStatuses.${s}`, s)}
            </option>
          ))}
        </select>
        <select value={category} onChange={filter(setCategory)} aria-label={t('prayerRequests.categoryLabel')}>
          <option value="">{t('prayerRequests.allCategories')}</option>
          {PRAYER_REQUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`prayerCategories.${c}`, c)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">{t('prayerRequests.loading')}</p>}
      {!loading && requests.length === 0 && !error && <p className="hint">{t('adminRequests.empty')}</p>}

      <ul className="admin-member-list">
        {requests.map((r) => (
          <li key={r.id} className="admin-member admin-request">
            <div className="admin-member-head">
              <div>
                <strong>{r.author_display_name ?? t('adminRequests.anonymous')}</strong>
                <span className="hint">
                  {' '}
                  · {new Date(r.created_at).toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <RequestStatus status={r.status} />
            </div>
            <div className="request-meta">
              <span className="chip">{t(`prayerCategories.${r.category}`, r.category)}</span>
              <span className="chip">{t(`confidentiality.${r.confidentiality}`)}</span>
            </div>
            <p className="admin-request-text">{r.description}</p>
            {r.photo_file_id && <RequestPhoto requestId={r.id} />}

            <div className="admin-member-actions">
              <label className="admin-assign">
                <span>{t('adminRequests.entrustTo')}</span>
                <select
                  value={r.assigned_to ?? ''}
                  onChange={(e) => act((token) => prayerRequestsApi.assign(token, r.id, e.target.value || null))}
                >
                  <option value="">{t('adminRequests.nobody')}</option>
                  {intercessors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                  {r.assigned_to && !intercessors.some((p) => p.id === r.assigned_to) && (
                    <option value={r.assigned_to}>{r.assignee_display_name ?? '—'}</option>
                  )}
                </select>
              </label>
              {['NEW', 'ASSIGNED', 'RESTORED'].includes(r.status) && (
                <RecommendedIntercessors requestId={r.id} onPick={(userId) => act((token) => prayerRequestsApi.assign(token, r.id, userId))} />
              )}
              {r.status !== 'ARCHIVED' && <MobilizeGroup requestId={r.id} />}
              <span className="admin-status-actions">
                {(NEXT[r.status] ?? []).map((s) => (
                  <button key={s} type="button" className="admin-status-button admin-status-button-visible" onClick={() => act((token) => prayerRequestsApi.updateStatus(token, r.id, s))}>
                    {t(`adminRequests.to.${s}`, t(`requestStatuses.${s}`, s))}
                  </button>
                ))}
                {canPromote && r.status === 'NEW' && programs[0] && (
                  <button
                    type="button"
                    className="admin-status-button admin-status-button-visible"
                    onClick={() => act((token) => prayerRequestsApi.promote(token, r.id, programs[0].id))}
                    title={t('adminRequests.toRoomHint')}
                  >
                    <span aria-hidden="true">🕯️</span> {t('adminRequests.toRoom')}
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </section>
  );
}
