import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { FAITH_ACT_KINDS, FaithAct, FaithActKind, faithActsApi } from '../../lib/api';
import { FAITH_ICONS, FaithActCard } from './FaithActCard';

const DURATIONS = [1, 3, 7, 21, 40];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Mes actes de foi (§5.8): take a step of faith — a commitment, a fast, some time given, a vigil,
 * an evangelism outing — follow it, and when it is fulfilled, tell what God did.
 */
export function FaithActsPage() {
  const { t } = useTranslation();
  const [acts, setActs] = useState<FaithAct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: FaithActKind; title: string; description: string; days: number | null; isPublic: boolean }>({
    kind: 'FAST',
    title: '',
    description: '',
    days: 3,
    isPublic: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    faithActsApi
      .mine(token)
      .then(setActs)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const create = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !form.title.trim()) return;
    setSaving(true);
    setError(null);
    faithActsApi
      .create(token, {
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        endDate: form.days ? addDays(form.days) : undefined,
        isPublic: form.isPublic,
      })
      .then((act) => {
        setActs((prev) => [act, ...prev]);
        setForm({ ...form, title: '', description: '' });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSaving(false));
  };

  const remove = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    faithActsApi
      .remove(token, id)
      .then(() => setActs((prev) => prev.filter((a) => a.id !== id)))
      .catch((err) => setError((err as Error).message));
  };

  const active = acts.filter((a) => a.status === 'ACTIVE');
  const closed = acts.filter((a) => a.status !== 'ACTIVE');

  return (
    <section className="social-page faith-page">
      <div className="social-head">
        <div>
          <h2>{t('faith.title')}</h2>
          <p className="hint">{t('faith.intro')}</p>
        </div>
      </div>

      <form className="groups-create" onSubmit={create}>
        <h3>{t('faith.newTitle')}</h3>
        <div className="groups-type-picker" role="radiogroup" aria-label={t('faith.kindLabel')}>
          {FAITH_ACT_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={form.kind === k} className={form.kind === k ? 'is-on' : ''} onClick={() => setForm({ ...form, kind: k })}>
              <span aria-hidden="true">{FAITH_ICONS[k]}</span> {t(`faith.kinds.${k}`)}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={form.title}
          maxLength={150}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={t(`faith.placeholders.${form.kind}`)}
          aria-label={t('faith.titleLabel')}
          required
        />
        <textarea
          rows={2}
          maxLength={2000}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t('faith.descriptionPlaceholder')}
          aria-label={t('faith.descriptionPlaceholder')}
        />
        <div className="faith-duration">
          <span>{t('faith.duration')}</span>
          {DURATIONS.map((d) => (
            <button key={d} type="button" className={form.days === d ? 'is-on' : ''} onClick={() => setForm({ ...form, days: d })}>
              {t('faith.days', { count: d })}
            </button>
          ))}
          <button type="button" className={form.days === null ? 'is-on' : ''} onClick={() => setForm({ ...form, days: null })}>
            {t('faith.noEnd')}
          </button>
        </div>
        <label className="live-visio-option">
          <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
          {t('faith.publicLabel')}
        </label>
        <div className="groups-create-actions">
          <button type="submit" disabled={saving || !form.title.trim()}>
            <span aria-hidden="true">🔥</span> {t('faith.create')}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">{t('posts.loading')}</p>}

      <h3 className="social-section-title">{t('faith.activeTitle', { count: active.length })}</h3>
      {!loading && active.length === 0 && <p className="social-empty">{t('faith.noneActive')}</p>}
      <ul className="faith-list">
        {active.map((a) => (
          <FaithActCard key={a.id} act={a} onChange={(n) => setActs((prev) => prev.map((x) => (x.id === n.id ? n : x)))} />
        ))}
      </ul>

      {closed.length > 0 && (
        <>
          <h3 className="social-section-title">{t('faith.closedTitle')}</h3>
          <ul className="faith-list">
            {closed.map((a) => (
              <FaithActCard
                key={a.id}
                act={a}
                onChange={(n) => setActs((prev) => prev.map((x) => (x.id === n.id ? n : x)))}
                onRemove={() => remove(a.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default FaithActsPage;
