import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { IntercessorRecommendation, intercessorsApi } from '../../lib/api';

/**
 * Shows who would best carry this request (topic, availability, load). The platform
 * recommends; the administrator decides by clicking — nothing is assigned on its own.
 */
export function RecommendedIntercessors({ requestId, onPick }: { requestId: string; onPick: (userId: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<IntercessorRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || list) return;
    const token = getAccessToken();
    if (!token) return;
    intercessorsApi
      .recommendations(token, requestId)
      .then(setList)
      .catch((err) => setError((err as Error).message));
  };

  return (
    <div className="recommend">
      <button type="button" className="admin-status-button admin-status-button-visible" aria-expanded={open} onClick={toggle}>
        <span aria-hidden="true">✨</span> {t('intercessor.recommended')}
      </button>
      {open && (
        <div className="recommend-panel">
          {error && <p className="error">{error}</p>}
          {!error && !list && <p className="hint">{t('prayerRequests.loading')}</p>}
          {list && list.length === 0 && <p className="hint">{t('intercessor.noneRecommended')}</p>}
          {list && list.length > 0 && (
            <ul>
              {list.map((c) => (
                <li key={c.userId}>
                  <button type="button" className="recommend-pick" onClick={() => onPick(c.userId)} disabled={c.full}>
                    <span className="recommend-score">{c.score}</span>
                    <span className="recommend-who">
                      <strong>{c.displayName}</strong>
                      <span className="hint">
                        {t(`intercessor.status.${c.availability}`)} · {t('intercessor.load', { active: c.activeRequests, max: c.maxActive })}
                        {c.matchesTopic && <> · {t('intercessor.matchesTopic')}</>}
                        {c.full && <> · {t('intercessor.full')}</>}
                      </span>
                    </span>
                    {!c.full && <span className="recommend-cta">{t('intercessor.entrust')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
