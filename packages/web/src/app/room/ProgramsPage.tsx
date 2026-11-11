import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { CreneauImport } from './CreneauImport';
import { WorshipLinks } from './WorshipLinks';
import { CreateSlotPayload, PRAYER_PROGRAM_STATUSES, PrayerProgram, PrayerSlot, prayerApi } from '../../lib/api';

function toTimeOfDay(iso: string): string {
  return iso.slice(11, 16);
}

/** Mirrors the backend guard in PrayerProgramsService — the world room (community_id null) is
 * continuous by product decision and can't be paused, archived, completed, or deleted. */
const WORLD_ROOM_STOPPING_STATUSES = new Set(['PAUSED', 'COMPLETED', 'ARCHIVED']);

/** Calendar view: the program's segments in time order, one group per day. */
function byDay(slots: PrayerSlot[]): { day: string; slots: PrayerSlot[] }[] {
  const groups: { day: string; slots: PrayerSlot[] }[] = [];
  for (const slot of [...slots].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))) {
    const day = new Date(slot.start_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.slots.push(slot);
    else groups.push({ day, slots: [slot] });
  }
  return groups;
}

/** Monday 00:00 → next Monday 00:00 (local time), `offset` weeks from this one. */
function weekWindow(offset: number): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7) + offset * 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

function weekLabel(offset: number, lang: string): string {
  const { from, to } = weekWindow(offset);
  const last = new Date(to.getTime() - 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  return `${fmt(from)} – ${fmt(last)}`;
}

function formatDay(iso: string, lang: string, loopLabel: string): string {
  // Segments of a looping créneau (the older mode) carry a reference date, not a real day.
  if (new Date(iso).getFullYear() < 2001) return loopLabel;
  return new Date(iso).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function toCsv(list: string[]): string {
  return list.join(', ');
}

function fromCsv(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

const EMPTY_SLOT_FORM = {
  title: '',
  startTime: '',
  endTime: '',
  guidedText: '',
  bibleReferences: '',
  recommendedSongs: '',
  orderIndex: '',
};

export function ProgramsPage() {
  const { t, i18n } = useTranslation();
  const [programs, setPrograms] = useState<PrayerProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slots, setSlots] = useState<PrayerSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT_FORM);
  const [slotSaving, setSlotSaving] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  /** The calendar is shown one week at a time (0 = this week). */
  const [week, setWeek] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshPrograms = () => {
    setLoading(true);
    prayerApi
      .listPrograms()
      .then((res) => setPrograms(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refreshPrograms, []);

  const refreshSlots = (programId: string, weekOffset = week) => {
    setSlotsLoading(true);
    const { from, to } = weekWindow(weekOffset);
    prayerApi
      .listProgramSlots(programId, from, to)
      .then(setSlots)
      .catch((err) => setError((err as Error).message))
      .finally(() => setSlotsLoading(false));
  };

  const selectProgram = (id: string) => {
    setSelectedId(id);
    setWeek(0);
    setEditingSlotId(null);
    setSlotForm(EMPTY_SLOT_FORM);
    refreshSlots(id, 0);
  };

  const goToWeek = (offset: number) => {
    setWeek(offset);
    if (selectedId) refreshSlots(selectedId, offset);
  };

  const cancelDay = (iso: string) => {
    const token = getAccessToken();
    if (!token || !selectedId) return;
    const start = new Date(iso);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const label = start.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
    if (!window.confirm(t('programs.cancelDayConfirm', { day: label }))) return;
    prayerApi
      .cancelPeriod(token, selectedId, start, end)
      .then((res) => {
        setNotice(t('programs.cancelDayDone', { count: res.cancelled, day: label }));
        refreshSlots(selectedId);
      })
      .catch((err) => setError((err as Error).message));
  };

  const handleCreateProgram = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setError(t('programs.needLoginCreate'));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await prayerApi.createProgram(token, { title, recurrenceRule: recurrenceRule || undefined });
      setTitle('');
      setRecurrenceRule('');
      refreshPrograms();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    const token = getAccessToken();
    if (!token) return;
    prayerApi
      .updateProgram(token, id, { status })
      .then(refreshPrograms)
      .catch((err) => setError((err as Error).message));
  };

  const handleDeleteProgram = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    prayerApi
      .removeProgram(token, id)
      .then(() => {
        if (selectedId === id) setSelectedId(null);
        refreshPrograms();
      })
      .catch((err) => setError((err as Error).message));
  };

  const buildSlotPayload = (): CreateSlotPayload => ({
    title: slotForm.title,
    startTime: slotForm.startTime,
    endTime: slotForm.endTime,
    guidedText: slotForm.guidedText || undefined,
    bibleReferences: fromCsv(slotForm.bibleReferences),
    recommendedSongs: fromCsv(slotForm.recommendedSongs),
    orderIndex: slotForm.orderIndex ? Number(slotForm.orderIndex) : undefined,
  });

  const handleCreateSlot = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !selectedId) return;
    setSlotSaving(true);
    setError(null);
    try {
      await prayerApi.createSlot(token, selectedId, buildSlotPayload());
      setSlotForm(EMPTY_SLOT_FORM);
      refreshSlots(selectedId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSlotSaving(false);
    }
  };

  const startEditSlot = (slot: PrayerSlot) => {
    setEditingSlotId(slot.id);
    setSlotForm({
      title: slot.title,
      startTime: toTimeOfDay(slot.start_at),
      endTime: toTimeOfDay(slot.end_at),
      guidedText: slot.guided_text ?? '',
      bibleReferences: toCsv(slot.bible_references ?? []),
      recommendedSongs: toCsv(slot.recommended_songs ?? []),
      orderIndex: String(slot.order_index ?? ''),
    });
  };

  const handleUpdateSlot = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !editingSlotId || !selectedId) return;
    setSlotSaving(true);
    setError(null);
    try {
      await prayerApi.updateSlot(token, editingSlotId, buildSlotPayload());
      setEditingSlotId(null);
      setSlotForm(EMPTY_SLOT_FORM);
      refreshSlots(selectedId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSlotSaving(false);
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    const token = getAccessToken();
    if (!token || !selectedId) return;
    prayerApi
      .removeSlot(token, slotId)
      .then(() => refreshSlots(selectedId))
      .catch((err) => setError((err as Error).message));
  };

  const selectedProgram = programs.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="communities-page">
      <h2>{t('programs.title')}</h2>
      <p className="hint">
        {t('programs.intro')} <code>prayer_program.create</code>.
      </p>

      <form onSubmit={handleCreateProgram} className="request-form">
        <input
          type="text"
          placeholder={t('programs.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder={t('programs.recurrencePlaceholder')}
          value={recurrenceRule}
          onChange={(e) => setRecurrenceRule(e.target.value)}
        />
        <button type="submit" disabled={creating}>
          {creating ? t('programs.creating') : t('programs.create')}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {loading && <p>{t('programs.loading')}</p>}

      <ul className="request-list">
        {programs.map((program) => (
          <li key={program.id} className={`request-row ${selectedId === program.id ? 'slot-row-live' : ''}`}>
            <div className="request-meta">
              <span className="chip chip-status">{t(`campaignStatuses.${program.status}`, program.status)}</span>
              {program.recurrence_rule && <span className="hint">{program.recurrence_rule}</span>}
            </div>
            <p>
              <strong>{program.title}</strong>
            </p>
            <div className="request-form">
              <button type="button" onClick={() => selectProgram(program.id)}>
                {selectedId === program.id ? t('programs.viewSlotsSelected') : t('programs.viewSlots')}
              </button>
              {PRAYER_PROGRAM_STATUSES.filter(
                (s) => s !== program.status && !(program.community_id === null && WORLD_ROOM_STOPPING_STATUSES.has(s)),
              ).map((s) => (
                <button key={s} type="button" onClick={() => handleStatusChange(program.id, s)}>
                  {t(`campaignStatuses.${s}`, s)}
                </button>
              ))}
              {program.community_id === null ? (
                <span className="hint">{t('programs.worldRoomProtected')}</span>
              ) : (
                <button type="button" onClick={() => handleDeleteProgram(program.id)}>
                  {t('programs.delete')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!loading && programs.length === 0 && <p className="hint">{t('programs.noPrograms')}</p>}

      {selectedProgram && (
        <>
          <h3>{t('programs.slotsTitle', { title: selectedProgram.title })}</h3>
          <p className="hint">{t('programs.dailyScheduleHint')}</p>
          <CreneauImport programId={selectedProgram.id} onReplaced={() => refreshSlots(selectedProgram.id)} />
          <WorshipLinks programId={selectedProgram.id} />

          <div className="week-nav">
            <button type="button" onClick={() => goToWeek(week - 1)} aria-label={t('programs.prevWeek')}>
              ◀
            </button>
            <strong>{weekLabel(week, i18n.language)}</strong>
            <button type="button" onClick={() => goToWeek(week + 1)} aria-label={t('programs.nextWeek')} disabled={week >= 14}>
              ▶
            </button>
            {week !== 0 && (
              <button type="button" className="link-button" onClick={() => goToWeek(0)}>
                {t('programs.thisWeek')}
              </button>
            )}
          </div>
          {notice && <p className="admin-notice">{notice}</p>}
          {slotsLoading && <p>{t('programs.loading')}</p>}

          <table className="slot-table">
            <thead>
              <tr>
                <th>{t('programs.tableTime')}</th>
                <th>{t('programs.tableTitle')}</th>
                <th>{t('programs.tableLeader')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {byDay(slots).map(({ day, slots: daySlots }) => [
                <tr key={`day-${day}`} className="slot-day-row">
                  <td colSpan={4}>
                    {formatDay(daySlots[0].start_at, i18n.language, t('programs.loopDay'))}
                    {new Date(daySlots[0].start_at).getFullYear() > 2000 && daySlots.some((x) => x.status === 'SCHEDULED') && (
                      <button type="button" className="link-button slot-day-cancel" onClick={() => cancelDay(daySlots[0].start_at)}>
                        {t('programs.cancelDay')}
                      </button>
                    )}
                  </td>
                </tr>,
                ...daySlots.map((slot) => (
                <tr key={slot.id} className={slot.status === 'RUNNING' ? 'slot-row-live' : ''}>
                  <td>
                    {toTimeOfDay(slot.start_at)}–{toTimeOfDay(slot.end_at)}
                    {slot.status === 'RUNNING' && <span className="live-badge"> {t('programs.liveBadge')}</span>}
                  </td>
                  <td>{slot.title}</td>
                  <td>{slot.leader_display_name ?? t('programs.leaderAi')}</td>
                  <td>
                    <button type="button" onClick={() => startEditSlot(slot)}>
                      {t('programs.edit')}
                    </button>
                    <button type="button" onClick={() => handleDeleteSlot(slot.id)}>
                      {t('programs.delete')}
                    </button>
                  </td>
                </tr>
                )),
              ])}
            </tbody>
          </table>
          {!slotsLoading && slots.length === 0 && <p className="hint">{t('programs.noSlots')}</p>}

          <h4>{editingSlotId ? t('programs.editSlotTitle') : t('programs.addSlotTitle')}</h4>
          <form onSubmit={editingSlotId ? handleUpdateSlot : handleCreateSlot} className="request-form">
            <input
              type="text"
              placeholder={t('programs.slotTitlePlaceholder')}
              value={slotForm.title}
              onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })}
              required
            />
            <input
              type="time"
              aria-label={t('programs.startTimeLabel')}
              value={slotForm.startTime}
              onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
              required
            />
            <input
              type="time"
              aria-label={t('programs.endTimeLabel')}
              value={slotForm.endTime}
              onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
              required
            />
            <textarea
              placeholder={t('programs.guidedTextPlaceholder')}
              value={slotForm.guidedText}
              onChange={(e) => setSlotForm({ ...slotForm, guidedText: e.target.value })}
              rows={3}
            />
            <input
              type="text"
              placeholder={t('programs.bibleRefsPlaceholder')}
              value={slotForm.bibleReferences}
              onChange={(e) => setSlotForm({ ...slotForm, bibleReferences: e.target.value })}
            />
            <input
              type="text"
              placeholder={t('programs.songsPlaceholder')}
              value={slotForm.recommendedSongs}
              onChange={(e) => setSlotForm({ ...slotForm, recommendedSongs: e.target.value })}
            />
            <input
              type="number"
              placeholder={t('programs.orderPlaceholder')}
              value={slotForm.orderIndex}
              onChange={(e) => setSlotForm({ ...slotForm, orderIndex: e.target.value })}
              min={0}
            />
            <div className="request-form">
              <button type="submit" disabled={slotSaving}>
                {slotSaving ? t('programs.saving') : editingSlotId ? t('programs.save') : t('programs.addSlot')}
              </button>
              {editingSlotId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSlotId(null);
                    setSlotForm(EMPTY_SLOT_FORM);
                  }}
                >
                  {t('programs.cancel')}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default ProgramsPage;
