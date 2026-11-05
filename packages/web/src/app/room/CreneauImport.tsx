import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { PrayerSlot, prayerApi } from '../../lib/api';
import { formatVerse, parseCreneau } from '../../lib/creneau-parser';

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/**
 * Moderators write a créneau the way they already share it (date line, segments with times,
 * "Prière1: …", verses) and paste it here. Nothing is saved until they confirm the preview.
 */
export function CreneauImport({ programId, onReplaced }: { programId: string; onReplaced: (slots: PrayerSlot[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const parsed = useMemo(() => parseCreneau(text), [text]);
  const total = parsed.segments.reduce((sum, s) => sum + s.durationSeconds, 0);

  const save = () => {
    const token = getAccessToken();
    if (!token || parsed.segments.length === 0) return;
    setSaving(true);
    setError(null);
    prayerApi
      .replaceSchedule(
        token,
        programId,
        parsed.segments.map((s) => ({
          title: s.title,
          durationSeconds: s.durationSeconds,
          guidedText: s.prayer || undefined,
          bibleReferences: s.verses.map(formatVerse),
        })),
      )
      .then((slots) => {
        onReplaced(slots);
        setDone(parsed.segments.length);
        setText('');
        setOpen(false);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSaving(false));
  };

  if (!open) {
    return (
      <div className="creneau-import">
        <button type="button" onClick={() => { setOpen(true); setDone(null); }}>
          {t('creneauImport.open')}
        </button>
        {done !== null && <p className="hint">{t('creneauImport.saved', { count: done })}</p>}
      </div>
    );
  }

  return (
    <section className="creneau-import creneau-import-open">
      <h4>{t('creneauImport.title')}</h4>
      <p className="hint">{t('creneauImport.intro')}</p>
      <textarea
        id="creneau-import-text"
        rows={12}
        value={text}
        placeholder={t('creneauImport.placeholder')}
        onChange={(e) => setText(e.target.value)}
      />

      {parsed.segments.length > 0 && (
        <div className="creneau-preview">
          <p className="creneau-preview-summary">
            {parsed.heading && <strong>{parsed.heading} · </strong>}
            {t('creneauImport.summary', { count: parsed.segments.length, duration: minutes(total) })}
          </p>
          <ol className="creneau-preview-list">
            {parsed.segments.map((s, i) => (
              <li key={`${s.start}-${i}`}>
                <div className="creneau-preview-head">
                  <span className="creneau-preview-time">
                    {s.start}–{s.end}
                  </span>
                  <strong>{s.title}</strong>
                  <span className="hint">{minutes(s.durationSeconds)}</span>
                </div>
                {s.prayer && <p>{s.prayer}</p>}
                {s.verses.map((v) => (
                  <p key={v.reference} className="creneau-preview-verse">
                    <span>{v.reference}</span> {v.text}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {parsed.warnings.length > 0 && (
            <p className="hint">{t('creneauImport.ignored', { lines: parsed.warnings.join(' / ') })}</p>
          )}
          <p className="hint">{t('creneauImport.replaceWarning')}</p>
        </div>
      )}
      {text.trim() && parsed.segments.length === 0 && <p className="error">{t('creneauImport.noSegments')}</p>}
      {error && <p className="error">{error}</p>}

      <div className="creneau-import-actions">
        <button type="button" onClick={save} disabled={saving || parsed.segments.length === 0}>
          {saving ? t('creneauImport.saving') : t('creneauImport.save', { count: parsed.segments.length })}
        </button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          {t('creneauImport.cancel')}
        </button>
      </div>
    </section>
  );
}
