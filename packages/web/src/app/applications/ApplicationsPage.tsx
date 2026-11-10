import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Application, applicationsApi } from '../../lib/api';

const CHURCH_TYPES = ['CHURCH', 'MINISTRY', 'GROUP', 'CELL', 'TEAM'] as const;

export function ApplicationStatus({ status }: { status: Application['status'] }) {
  const { t } = useTranslation();
  return <span className={`chip application-${status.toLowerCase()}`}>{t(`applications.status.${status}`)}</span>;
}

/** Become an intercessor, or register your church or group — decided by the administration. */
export function ApplicationsPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('type') === 'eglise' ? 'COMMUNITY' : 'INTERCESSOR';
  const [mine, setMine] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Intercessor
  const [motivation, setMotivation] = useState('');
  const [availability, setAvailability] = useState('');
  const [skills, setSkills] = useState('');
  // Church / group
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('CHURCH');
  const [country, setCountry] = useState('Togo');
  const [city, setCity] = useState('');
  const [mission, setMission] = useState('');
  const [phone, setPhone] = useState('');

  const load = () => {
    const token = getAccessToken();
    if (token) applicationsApi.mine(token).then(setMine).catch(() => setMine([]));
  };
  useEffect(load, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      if (tab === 'INTERCESSOR') {
        await applicationsApi.apply(token, {
          kind: 'INTERCESSOR',
          intercessor: {
            motivation: motivation.trim(),
            availability: availability.trim() || undefined,
            prayerSkills: skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
          },
        });
        setMotivation('');
      } else {
        await applicationsApi.apply(token, {
          kind: 'COMMUNITY',
          community: { name: name.trim(), type, country: country.trim(), city: city.trim() || undefined, mission: mission.trim() || undefined, contactPhone: phone.trim() || undefined },
        });
        setName('');
        setMission('');
      }
      setSent(true);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="applications-page">
      <h2>{t('applications.title')}</h2>
      <p className="hint">{t('applications.intro')}</p>

      <div className="community-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'INTERCESSOR'} className={`community-tab${tab === 'INTERCESSOR' ? ' active' : ''}`} onClick={() => setParams({})}>
          <span aria-hidden="true">🙏</span> {t('applications.intercessorTab')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'COMMUNITY'} className={`community-tab${tab === 'COMMUNITY' ? ' active' : ''}`} onClick={() => setParams({ type: 'eglise' })}>
          <span aria-hidden="true">⛪</span> {t('applications.communityTab')}
        </button>
      </div>

      <form className="pr-ask pr-form" onSubmit={submit}>
        {tab === 'INTERCESSOR' ? (
          <>
            <p className="hint">{t('applications.intercessorIntro')}</p>
            <label>
              {t('applications.motivation')}
              <textarea rows={4} minLength={10} maxLength={1500} required value={motivation} onChange={(e) => setMotivation(e.target.value)} />
            </label>
            <label>
              {t('applications.availability')}
              <input maxLength={300} value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder={t('applications.availabilityPlaceholder')} />
            </label>
            <label>
              {t('applications.skills')}
              <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder={t('applications.skillsPlaceholder')} />
            </label>
          </>
        ) : (
          <>
            <p className="hint">{t('applications.communityIntro')}</p>
            <label>
              {t('applications.churchName')}
              <input required minLength={2} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              {t('applications.churchType')}
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {CHURCH_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`communityTypes.${c}`, c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="applications-row">
              <label>
                {t('applications.country')}
                <input required maxLength={100} value={country} onChange={(e) => setCountry(e.target.value)} />
              </label>
              <label>
                {t('applications.city')}
                <input maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
            </div>
            <label>
              {t('applications.mission')}
              <textarea rows={3} maxLength={1500} value={mission} onChange={(e) => setMission(e.target.value)} />
            </label>
            <label>
              {t('applications.phone')}
              <input type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <span className="hint">{t('applications.phoneHint')}</span>
            </label>
          </>
        )}
        <button type="submit" disabled={busy}>
          {t('applications.send')}
        </button>
        {sent && <p className="confirmation">{t('applications.sent')}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <h3>{t('applications.mineTitle')}</h3>
      {mine.length === 0 ? (
        <p className="hint">{t('applications.mineEmpty')}</p>
      ) : (
        <ul className="request-list">
          {mine.map((a) => (
            <li key={a.id} className="request-row">
              <div className="request-meta">
                <span className="chip">{t(`applications.kind.${a.kind}`)}</span>
                <ApplicationStatus status={a.status} />
                <span className="hint">{new Date(a.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' })}</span>
              </div>
              {a.kind === 'COMMUNITY' && <p>{String(a.payload.name ?? '')}</p>}
              {a.reviewNote && <p className="hint">« {a.reviewNote} »</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
