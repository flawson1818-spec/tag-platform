import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { FlaggedPrayerRequest, Testimony, prayerRequestsApi, testimoniesApi } from '../../lib/api';
import i18n from '../../i18n/config';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ModerationQueuePage() {
  const { t } = useTranslation();
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [requests, setRequests] = useState<FlaggedPrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([testimoniesApi.listFlagged(token), prayerRequestsApi.listFlagged(token)])
      .then(([t, r]) => {
        setTestimonies(t);
        setRequests(r);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (!getAccessToken()) return <p className="hint">{t('moderation.needModerator')}</p>;

  return (
    <div className="communities-page">
      <h2>{t('moderation.title')}</h2>
      <p className="hint">{t('moderation.intro')}</p>
      {loading && <p>{t('moderation.loading')}</p>}
      {error && <p className="error">{error}</p>}

      <h3>{t('moderation.testimoniesTitle', { count: testimonies.length })}</h3>
      {testimonies.length === 0 && !loading && <p className="hint">{t('moderation.noFlaggedTestimonies')}</p>}
      <ul className="request-list">
        {testimonies.map((item) => (
          <li key={item.id} className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{t(`testimonyStatuses.${item.status}`, item.status)}</span>
              <span className="hint">{formatDateTime(item.created_at)}</span>
            </div>
            <p>{item.content}</p>
            <p className="error">
              ⚠ {item.ai_flag_reason ?? t('moderation.flaggedNoReason')}
              {item.ai_flag_confidence !== null
                ? ` ${t('moderation.confidenceSuffix', { percent: Math.round(item.ai_flag_confidence * 100) })}`
                : ''}
            </p>
          </li>
        ))}
      </ul>

      <h3>{t('moderation.requestsTitle', { count: requests.length })}</h3>
      {requests.length === 0 && !loading && <p className="hint">{t('moderation.noFlaggedRequests')}</p>}
      <ul className="request-list">
        {requests.map((r) => (
          <li key={r.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`prayerCategories.${r.category}`, r.category)}</span>
              <span className="chip chip-status">{t(`requestStatuses.${r.status}`, r.status)}</span>
              <span className="hint">{formatDateTime(r.created_at)}</span>
            </div>
            <p>{r.description}</p>
            <p className="error">
              ⚠ {r.ai_flag_reason ?? t('moderation.flaggedNoReason')}
              {r.ai_flag_confidence !== null
                ? ` ${t('moderation.confidenceSuffix', { percent: Math.round(r.ai_flag_confidence * 100) })}`
                : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ModerationQueuePage;
