import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { FlambeauDay, LeaderCandidate, WorldIntention, prayerApi, watchApi } from '../../lib/api';

const DAYS = 14;

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextDays(n: number): string[] {
  const start = new Date();
  return Array.from({ length: n }, (_, i) => isoDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

function DayEditor({
  day,
  intention,
  flambeau,
  leaders,
  onSaved,
}: {
  day: string;
  intention?: WorldIntention;
  flambeau?: FlambeauDay;
  leaders: LeaderCandidate[];
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState(intention?.title ?? '');
  const [description, setDescription] = useState(intention?.description ?? '');
  const [verse, setVerse] = useState(intention?.bibleReference ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const run = (action: (token: string) => Promise<unknown>) => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setSaved(false);
    action(token)
      .then(() => {
        setSaved(true);
        onSaved();
      })
      .catch((err) => setError((err as Error).message));
  };

  const saveIntention = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    run((token) => watchApi.setIntention(token, day, { title: title.trim(), description: description.trim() || undefined, bibleReference: verse.trim() || undefined }));
  };

  const label = new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <li className="watch-day">
      <h3>{label}</h3>
      <div className="watch-day-grid">
        <form className="watch-intention" onSubmit={saveIntention}>
          <p className="tw-label"><span aria-hidden="true">🌍</span> {t('watch.intentionLabel')}</p>
          <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={t('watch.titlePlaceholder')} aria-label={t('watch.titlePlaceholder')} />
          <textarea rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('watch.textPlaceholder')} aria-label={t('watch.textPlaceholder')} />
          <input value={verse} maxLength={300} onChange={(e) => setVerse(e.target.value)} placeholder={t('watch.versePlaceholder')} aria-label={t('watch.versePlaceholder')} />
          <div className="tw-actions">
            <button type="submit" disabled={!title.trim()}>
              {t('posts.save')}
            </button>
            {intention && (
              <button type="button" className="link-button" onClick={() => run((token) => watchApi.removeIntention(token, day))}>
                {t('posts.delete')}
              </button>
            )}
          </div>
        </form>
        <div className="watch-flambeau">
          <p className="tw-label"><span aria-hidden="true">🔥</span> {t('watch.flambeauLabel')}</p>
          <select
            value={flambeau?.guardian.id ?? ''}
            onChange={(e) =>
              run((token) =>
                e.target.value ? watchApi.setFlambeau(token, day, { guardianId: e.target.value }) : watchApi.removeFlambeau(token, day),
              )
            }
            aria-label={t('watch.guardianFor', { day: label })}
          >
            <option value="">{t('watch.noGuardian')}</option>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.display_name}
              </option>
            ))}
            {flambeau && !leaders.some((l) => l.id === flambeau.guardian.id) && (
              <option value={flambeau.guardian.id}>{flambeau.guardian.displayName}</option>
            )}
          </select>
          {flambeau && (
            <p className="hint">
              {t('watch.progress', { done: flambeau.checklist.filter((c) => c.done).length, total: flambeau.checklist.length })}
            </p>
          )}
        </div>
      </div>
      {saved && <p className="admin-notice">{t('watch.saved')}</p>}
      {error && <p className="error">{error}</p>}
    </li>
  );
}

/** Preparing the watch: an intention and a guardian of the Flambeau for each of the next two weeks. */
export function AdminWatchPage() {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<{ intentions: WorldIntention[]; flambeaux: FlambeauDay[] } | null>(null);
  const [leaders, setLeaders] = useState<LeaderCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const days = nextDays(DAYS);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    watchApi
      .plan(token, days[0], DAYS)
      .then(setPlan)
      .catch((err) => setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- days is recomputed each render; the first day is what matters
  }, [days[0]]);

  useEffect(load, [load]);
  useEffect(() => {
    const token = getAccessToken();
    if (token) prayerApi.leaderCandidates(token).then(setLeaders).catch(() => setLeaders([]));
  }, []);

  return (
    <section className="admin-watch">
      <h2>{t('watch.adminTitle')}</h2>
      <p className="hint">{t('watch.adminIntro')}</p>
      {error && <p className="error">{error}</p>}
      {!plan && !error && <p className="hint">{t('posts.loading')}</p>}
      {plan && (
        <ul className="watch-days">
          {days.map((day) => (
            <DayEditor
              key={`${day}-${plan.intentions.find((i) => i.day === day)?.title ?? ''}-${plan.flambeaux.find((f) => f.day === day)?.guardian.id ?? ''}`}
              day={day}
              intention={plan.intentions.find((i) => i.day === day)}
              flambeau={plan.flambeaux.find((f) => f.day === day)}
              leaders={leaders}
              onSaved={load}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
