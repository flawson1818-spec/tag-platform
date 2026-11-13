import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { FaithAct, faithActsApi } from '../../lib/api';

export const FAITH_ICONS: Record<string, string> = {
  COMMITMENT: '🤝',
  FAST: '🍞',
  TIME_GIFT: '⏳',
  PRAYER_VIGIL: '🕯️',
  EVANGELISM: '📣',
};

/** Days left (positive), today (0), or past (negative) — for "plus que 2 jours". */
function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = Date.parse(`${endDate}T23:59:59`);
  return Math.ceil((end - Date.now()) / 86_400_000) - 1;
}

/**
 * One act of faith. Its author closes it (fulfilled — with a testimony if they wish — or
 * abandoned); the others encourage it with "Je te soutiens".
 */
export function FaithActCard({ act, onChange, onRemove }: { act: FaithAct; onChange: (a: FaithAct) => void; onRemove?: () => void }) {
  const { t, i18n } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [testimony, setTestimony] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState({ count: act.supportCount, mine: act.supportedByMe });
  const left = act.status === 'ACTIVE' ? daysLeft(act.endDate) : null;
  const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  const run = (p: Promise<FaithAct>) =>
    p.then((next) => {
      onChange(next);
      setClosing(false);
    }).catch((err) => setError((err as Error).message));

  const fulfil = () => {
    const token = getAccessToken();
    if (token) void run(faithActsApi.update(token, act.id, { status: 'FULFILLED', testimony: testimony.trim() || undefined }));
  };
  const abandon = () => {
    const token = getAccessToken();
    if (token && window.confirm(t('faith.abandonConfirm'))) void run(faithActsApi.update(token, act.id, { status: 'ABANDONED' }));
  };
  const toggleSupport = () => {
    const token = getAccessToken();
    if (!token) return;
    const on = !support.mine;
    setSupport({ count: support.count + (on ? 1 : -1), mine: on });
    faithActsApi
      .support(token, act.id, on)
      .then((r) => setSupport({ count: r.supportCount, mine: r.supportedByMe }))
      .catch((err) => setError((err as Error).message));
  };

  return (
    <li className={`faith-card st-${act.status.toLowerCase()}`}>
      <div className="faith-card-head">
        <span className="faith-icon" aria-hidden="true">
          {FAITH_ICONS[act.kind] ?? '✝️'}
        </span>
        <div className="faith-card-body">
          <span className="faith-kind">{t(`faith.kinds.${act.kind}`)}</span>
          <strong>{act.title}</strong>
          <span className="hint">
            {date(act.startDate)}
            {act.endDate && <> → {date(act.endDate)}</>}
            {left !== null && left >= 0 && <> · {t('faith.daysLeft', { count: left })}</>}
            {act.mine && !act.isPublic && <> · <span aria-hidden="true">🔒</span> {t('faith.private')}</>}
          </span>
        </div>
        <span className={`faith-status st-${act.status.toLowerCase()}`}>{t(`faith.status.${act.status}`)}</span>
      </div>
      {act.description && <p className="faith-desc">{act.description}</p>}
      {act.testimonyId && <p className="hint"><span aria-hidden="true">✨</span> {t('faith.becameTestimony')}</p>}

      <div className="faith-actions">
        {!act.mine && (
          <button type="button" className={`social-amen${support.mine ? ' is-on' : ''}`} onClick={toggleSupport} aria-pressed={support.mine}>
            <span aria-hidden="true">🙌</span> {t('faith.support')}
            {support.count > 0 && <span className="social-count">{support.count}</span>}
          </button>
        )}
        {act.mine && support.count > 0 && <span className="hint"><span aria-hidden="true">🙌</span> {t('faith.supportedBy', { count: support.count })}</span>}
        {act.mine && act.status === 'ACTIVE' && !closing && (
          <>
            <button type="button" onClick={() => setClosing(true)}>
              <span aria-hidden="true">✅</span> {t('faith.fulfil')}
            </button>
            <button type="button" className="link-button" onClick={abandon}>
              {t('faith.abandon')}
            </button>
          </>
        )}
        {act.mine && act.status !== 'ACTIVE' && onRemove && (
          <button type="button" className="link-button" onClick={onRemove}>
            {t('faith.remove')}
          </button>
        )}
      </div>

      {closing && (
        <div className="faith-close">
          <label>
            {t('faith.testimonyLabel')}
            <textarea rows={4} maxLength={4500} value={testimony} onChange={(e) => setTestimony(e.target.value)} placeholder={t('faith.testimonyPlaceholder')} />
          </label>
          <p className="hint">{t('faith.testimonyHint')}</p>
          <div className="faith-actions">
            <button type="button" onClick={fulfil}>
              <span aria-hidden="true">🎉</span> {t('faith.confirmFulfil')}
            </button>
            <button type="button" className="link-button" onClick={() => setClosing(false)}>
              {t('composer.cancel')}
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  );
}
