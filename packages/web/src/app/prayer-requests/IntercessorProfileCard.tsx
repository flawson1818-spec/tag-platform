import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { IntercessorAvailability, IntercessorProfile, PRAYER_REQUEST_CATEGORIES, intercessorsApi } from '../../lib/api';

const AVAILABILITIES: IntercessorAvailability[] = ['AVAILABLE', 'BUSY', 'OFFLINE'];

/** An intercessor says when they can pray, which topics they carry best, and how many requests at once. */
export function IntercessorProfileCard() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<IntercessorProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (token) intercessorsApi.me(token).then(setProfile).catch(() => setProfile({ availability: 'AVAILABLE', prayerSkills: [], maxActive: 5 }));
  }, []);

  const save = (patch: Partial<IntercessorProfile>) => {
    const token = getAccessToken();
    if (!token || !profile) return;
    const optimistic = { ...profile, ...patch };
    setProfile(optimistic);
    setSaved(false);
    intercessorsApi
      .updateMe(token, patch)
      .then((next) => {
        setProfile(next);
        setSaved(true);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  };

  if (!profile) return null;
  const toggleSkill = (c: string) =>
    save({ prayerSkills: profile.prayerSkills.includes(c) ? profile.prayerSkills.filter((s) => s !== c) : [...profile.prayerSkills, c] });

  return (
    <section className="pr-block intercessor-card">
      <h3>{t('intercessor.title')}</h3>
      <p className="hint">{t('intercessor.intro')}</p>

      <p className="intercessor-label">{t('intercessor.availability')}</p>
      <div className="intercessor-availability" role="radiogroup" aria-label={t('intercessor.availability')}>
        {AVAILABILITIES.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={profile.availability === a}
            className={`intercessor-pill av-${a.toLowerCase()}${profile.availability === a ? ' is-on' : ''}`}
            onClick={() => save({ availability: a })}
          >
            {t(`intercessor.status.${a}`)}
          </button>
        ))}
      </div>

      <p className="intercessor-label">{t('intercessor.skills')}</p>
      <div className="intercessor-skills">
        {PRAYER_REQUEST_CATEGORIES.map((c) => (
          <label key={c} className={`intercessor-skill${profile.prayerSkills.includes(c) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={profile.prayerSkills.includes(c)} onChange={() => toggleSkill(c)} />
            {t(`prayerCategories.${c}`, c)}
          </label>
        ))}
      </div>

      <label className="intercessor-capacity">
        {t('intercessor.capacity')}
        <input
          type="number"
          min={1}
          max={50}
          value={profile.maxActive}
          onChange={(e) => setProfile({ ...profile, maxActive: Number(e.target.value) || 1 })}
          onBlur={() => save({ maxActive: Math.min(50, Math.max(1, profile.maxActive)) })}
        />
      </label>
      {saved && <p className="hint">{t('intercessor.saved')}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
