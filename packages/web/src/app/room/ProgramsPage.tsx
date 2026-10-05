import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { CreateSlotPayload, PRAYER_PROGRAM_STATUSES, PrayerProgram, PrayerSlot, prayerApi } from '../../lib/api';

function toTimeOfDay(iso: string): string {
  return iso.slice(11, 16);
}

/** Mirrors the backend guard in PrayerProgramsService — the world room (community_id null) is
 * continuous by product decision and can't be paused, archived, completed, or deleted. */
const WORLD_ROOM_STOPPING_STATUSES = new Set(['PAUSED', 'COMPLETED', 'ARCHIVED']);

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
  const { t } = useTranslation();
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

  const refreshPrograms = () => {
    setLoading(true);
    prayerApi
      .listPrograms()
      .then((res) => setPrograms(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refreshPrograms, []);

  const refreshSlots = (programId: string) => {
    setSlotsLoading(true);
    prayerApi
      .listProgramSlots(programId)
      .then(setSlots)
      .catch((err) => setError((err as Error).message))
      .finally(() => setSlotsLoading(false));
  };

  const selectProgram = (id: string) => {
    setSelectedId(id);
    setEditingSlotId(null);
    setSlotForm(EMPTY_SLOT_FORM);
    refreshSlots(id);
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
              {slots.map((slot) => (
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
              ))}
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
