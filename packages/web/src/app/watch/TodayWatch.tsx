import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { FlambeauDay, WorldIntention, watchApi } from '../../lib/api';

/**
 * Under the globe: the world prayer intention of the day and the Flambeau — the leader keeping
 * watch over the day. The guardian ticks their watch list and writes the encouragement here.
 * Nothing shows for a day the administration hasn't prepared.
 */
export function TodayWatch() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [intention, setIntention] = useState<WorldIntention | null>(null);
  const [flambeau, setFlambeau] = useState<FlambeauDay | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    watchApi
      .today()
      .then((res) => {
        setIntention(res.intention);
        setFlambeau(res.flambeau);
      })
      .catch(() => undefined);
  }, []);

  if (!intention && !flambeau) return null;
  const isGuardian = !!user && flambeau?.guardian.id === user.id;

  const update = (data: { item?: number; done?: boolean; encouragement?: string }) => {
    const token = getAccessToken();
    if (!token || !flambeau) return;
    watchApi
      .updateFlambeau(token, flambeau.day, data)
      .then((next) => {
        setFlambeau(next);
        setDraft(null);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  };

  return (
    <div className="today-watch">
      {intention && (
        <section className="tw-card tw-intention">
          <p className="tw-label"><span aria-hidden="true">🌍</span> {t('watch.intentionLabel')}</p>
          <h3>{intention.title}</h3>
          {intention.description && <p className="tw-text">{intention.description}</p>}
          {intention.bibleReference && <p className="tw-verse">{intention.bibleReference}</p>}
        </section>
      )}
      {flambeau && (
        <section className="tw-card tw-flambeau">
          <p className="tw-label"><span aria-hidden="true">🔥</span> {t('watch.flambeauLabel')}</p>
          <h3>{flambeau.guardian.displayName}</h3>
          <p className="hint">{t('watch.flambeauRole')}</p>
          {flambeau.encouragement && draft === null && <blockquote className="tw-encouragement">« {flambeau.encouragement} »</blockquote>}

          {isGuardian && (
            <div className="tw-guardian">
              <p className="tw-guardian-title">{t('watch.yourWatch')}</p>
              <ul className="tw-checklist">
                {flambeau.checklist.map((entry, i) => (
                  <li key={entry.label}>
                    <label>
                      <input type="checkbox" checked={entry.done} onChange={(e) => update({ item: i, done: e.target.checked })} />
                      <span className={entry.done ? 'is-done' : ''}>{entry.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {draft === null ? (
                <button type="button" className="link-button" onClick={() => setDraft(flambeau.encouragement ?? '')}>
                  {flambeau.encouragement ? t('watch.editEncouragement') : t('watch.writeEncouragement')}
                </button>
              ) : (
                <div className="tw-encouragement-form">
                  <textarea rows={3} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('watch.encouragementPlaceholder')} />
                  <div className="tw-actions">
                    <button type="button" onClick={() => update({ encouragement: draft.trim() })}>
                      {t('posts.save')}
                    </button>
                    <button type="button" className="link-button" onClick={() => setDraft(null)}>
                      {t('posts.cancel')}
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
