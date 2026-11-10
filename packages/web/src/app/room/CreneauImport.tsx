import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { PrayerSlot, prayerApi } from '../../lib/api';
import { formatVerse, parseCreneauxByDate } from '../../lib/creneau-parser';

function minutes(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function longDate(date: string, lang: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Moderators paste créneaux the way they already write them — one or many days, each starting
 * with its date ("JEUDI 05 NOVEMBRE 2026"), then segments with their hours and verses. Each one
 * is placed at its real hour in the program's calendar; the prayer runs 24 h/24 from one to the
 * next. Nothing is saved before the preview is confirmed.
 */
export function CreneauImport({ programId, onReplaced }: { programId: string; onReplaced: (slots: PrayerSlot[]) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fallbackDate, setFallbackDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const creneaux = useMemo(() => parseCreneauxByDate(text), [text]);
  const segmentCount = creneaux.reduce((n, c) => n + c.segments.length, 0);
  const undated = creneaux.some((c) => !c.date);

  const save = () => {
    const token = getAccessToken();
    if (!token || creneaux.length === 0) return;
    setSaving(true);
    setError(null);
    prayerApi
      .addCreneaux(
        token,
        programId,
        creneaux.map((c) => ({
          date: c.date ?? fallbackDate,
          segments: c.segments.map((s) => ({
            start: s.start,
            end: s.end,
            title: s.title,
            guidedText: s.prayer || undefined,
            bibleReferences: s.verses.map(formatVerse),
          })),
        })),
      )
      .then((res) => {
        onReplaced(res.slots);
        setDone(creneaux.length);
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

      {undated && (
        <label className="creneau-date">
          {t('creneauImport.dateLabel')}
          <input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} required />
        </label>
      )}

      {creneaux.length > 0 && (
        <div className="creneau-preview">
          <p className="creneau-preview-summary">
            {t('creneauImport.summaryDays', { count: creneaux.length, segments: segmentCount })}
          </p>
          {creneaux.map((c, ci) => {
            const total = c.segments.reduce((sum, s) => sum + s.durationSeconds, 0);
            return (
              <div key={ci} className="creneau-preview-day">
                <h5>
                  {longDate(c.date ?? fallbackDate, i18n.language)} · {c.segments[0].start}–{c.segments[c.segments.length - 1].end}
                  <span className="hint"> · {minutes(total)}</span>
                </h5>
                <ol className="creneau-preview-list">
                  {c.segments.map((s, i) => (
                    <li key={`${s.start}-${i}`}>
                      <div className="creneau-preview-head">
                        <span className="creneau-preview-time">
                          {s.start}–{s.end}
                        </span>
                        <strong>{s.title}</strong>
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
              </div>
            );
          })}
          <p className="hint">{t('creneauImport.calendarNote')}</p>
        </div>
      )}
      {text.trim() && creneaux.length === 0 && <p className="error">{t('creneauImport.noSegments')}</p>}
      {error && <p className="error">{error}</p>}

      <div className="creneau-import-actions">
        <button type="button" onClick={save} disabled={saving || creneaux.length === 0}>
          {saving ? t('creneauImport.saving') : t('creneauImport.saveDays', { count: creneaux.length })}
        </button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          {t('creneauImport.cancel')}
        </button>
      </div>
    </section>
  );
}
