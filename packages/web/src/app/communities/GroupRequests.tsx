import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Mobilization, MobilizationStatus, mobilizationsApi } from '../../lib/api';

/**
 * The prayer requests the administration entrusted to this group: its leaders accept or decline
 * them, then mark them carried; its members see the ones accepted, to pray for them together.
 */
export function GroupRequests({ communityId, onCount }: { communityId: string; onCount?: (n: number) => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Mobilization[]>([]);
  const [canAnswer, setCanAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    mobilizationsApi
      .forCommunity(token, communityId)
      .then((res) => {
        setItems(res.items);
        setCanAnswer(res.canAnswer);
        onCount?.(res.items.filter((m) => m.status === 'INVITED').length);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [communityId, onCount]);

  const answer = (m: Mobilization, status: MobilizationStatus) => {
    const token = getAccessToken();
    if (!token) return;
    mobilizationsApi
      .answer(token, m.id, status)
      .then((next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x))))
      .catch((err) => setError((err as Error).message));
  };

  if (loading) return <p className="hint">{t('prayerRequests.loading')}</p>;

  return (
    <section className="group-requests">
      <p className="hint">{canAnswer ? t('mobilization.leaderIntro') : t('mobilization.memberIntro')}</p>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p className="social-empty">{t('mobilization.none')}</p>}
      <ul className="group-announcements">
        {items.map((m) => (
          <li key={m.id} className={`mobilize-item st-${m.status.toLowerCase()}`}>
            <div className="request-meta">
              <span className="chip">{t(`prayerCategories.${m.request.category}`, m.request.category)}</span>
              <span className={`mobilize-chip st-${m.status.toLowerCase()}`}>{t(`mobilization.status.${m.status}`)}</span>
            </div>
            <p>{m.request.description}</p>
            {m.note && <p className="hint">« {m.note} »</p>}
            {canAnswer && m.status === 'INVITED' && (
              <div className="group-tool-actions">
                <button type="button" onClick={() => answer(m, 'ACCEPTED')}>
                  <span aria-hidden="true">🙏</span> {t('mobilization.accept')}
                </button>
                <button type="button" className="link-button" onClick={() => answer(m, 'DECLINED')}>
                  {t('mobilization.decline')}
                </button>
              </div>
            )}
            {canAnswer && m.status === 'ACCEPTED' && (
              <div className="group-tool-actions">
                <button type="button" onClick={() => answer(m, 'DONE')}>
                  <span aria-hidden="true">✅</span> {t('mobilization.done')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
