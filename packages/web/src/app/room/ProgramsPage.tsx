import { FormEvent, useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import {
  CreateSlotPayload,
  PRAYER_CATEGORIES,
  PRAYER_IMPORTANCE_LEVELS,
  PRAYER_PROGRAM_STATUSES,
  PrayerProgram,
  PrayerSlot,
  prayerApi,
} from '../../lib/api';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
  category: PRAYER_CATEGORIES[0] as string,
  importance: PRAYER_IMPORTANCE_LEVELS[0] as string,
  startAt: '',
  endAt: '',
  guidedText: '',
  bibleReferences: '',
  recommendedSongs: '',
  orderIndex: '',
};

export function ProgramsPage() {
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
      setError('Connecte-toi avec un compte modérateur pour créer un programme.');
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
    category: slotForm.category,
    importance: slotForm.importance,
    startAt: slotForm.startAt,
    endAt: slotForm.endAt,
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
      category: slot.category,
      importance: slot.importance,
      startAt: '',
      endAt: '',
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
      const { startAt: _startAt, endAt: _endAt, ...rest } = buildSlotPayload();
      await prayerApi.updateSlot(token, editingSlotId, rest);
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
      <h2>Programmes de prière</h2>
      <p className="hint">
        Créer et planifier les créneaux de la salle mondiale (ou d'une communauté). Réservé aux comptes
        disposant de la permission <code>prayer_program.create</code>.
      </p>

      <form onSubmit={handleCreateProgram} className="request-form">
        <input type="text" placeholder="Titre du programme" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input
          type="text"
          placeholder="Règle de récurrence (facultatif, ex : FREQ=DAILY)"
          value={recurrenceRule}
          onChange={(e) => setRecurrenceRule(e.target.value)}
        />
        <button type="submit" disabled={creating}>
          {creating ? 'Création…' : 'Créer le programme'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {loading && <p>Chargement…</p>}

      <ul className="request-list">
        {programs.map((program) => (
          <li key={program.id} className={`request-row ${selectedId === program.id ? 'slot-row-live' : ''}`}>
            <div className="request-meta">
              <span className="chip chip-status">{program.status}</span>
              {program.recurrence_rule && <span className="hint">{program.recurrence_rule}</span>}
            </div>
            <p>
              <strong>{program.title}</strong>
            </p>
            <div className="request-form">
              <button type="button" onClick={() => selectProgram(program.id)}>
                {selectedId === program.id ? 'Créneaux sélectionnés ▾' : 'Voir les créneaux'}
              </button>
              {PRAYER_PROGRAM_STATUSES.filter((s) => s !== program.status).map((s) => (
                <button key={s} type="button" onClick={() => handleStatusChange(program.id, s)}>
                  {s}
                </button>
              ))}
              <button type="button" onClick={() => handleDeleteProgram(program.id)}>
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && programs.length === 0 && <p className="hint">Aucun programme pour l'instant.</p>}

      {selectedProgram && (
        <>
          <h3>Créneaux — {selectedProgram.title}</h3>
          {slotsLoading && <p>Chargement…</p>}

          <table className="slot-table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Titre</th>
                <th>Catégorie</th>
                <th>Importance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id} className={slot.status === 'RUNNING' ? 'slot-row-live' : ''}>
                  <td>
                    {formatDateTime(slot.start_at)}–{formatDateTime(slot.end_at)}
                    {slot.status === 'RUNNING' && <span className="live-badge"> En direct</span>}
                  </td>
                  <td>{slot.title}</td>
                  <td>{slot.category}</td>
                  <td>{slot.importance}</td>
                  <td>
                    <button type="button" onClick={() => startEditSlot(slot)}>
                      Modifier
                    </button>
                    <button type="button" onClick={() => handleDeleteSlot(slot.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!slotsLoading && slots.length === 0 && <p className="hint">Aucun créneau pour ce programme.</p>}

          <h4>{editingSlotId ? 'Modifier le créneau' : 'Ajouter un créneau'}</h4>
          <form onSubmit={editingSlotId ? handleUpdateSlot : handleCreateSlot} className="request-form">
            <input
              type="text"
              placeholder="Titre du créneau"
              value={slotForm.title}
              onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })}
              required
            />
            <select value={slotForm.category} onChange={(e) => setSlotForm({ ...slotForm, category: e.target.value })}>
              {PRAYER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={slotForm.importance} onChange={(e) => setSlotForm({ ...slotForm, importance: e.target.value })}>
              {PRAYER_IMPORTANCE_LEVELS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            {!editingSlotId && (
              <>
                <input
                  type="datetime-local"
                  value={slotForm.startAt}
                  onChange={(e) => setSlotForm({ ...slotForm, startAt: e.target.value })}
                  required
                />
                <input
                  type="datetime-local"
                  value={slotForm.endAt}
                  onChange={(e) => setSlotForm({ ...slotForm, endAt: e.target.value })}
                  required
                />
              </>
            )}
            <textarea
              placeholder="Texte guidé (facultatif)"
              value={slotForm.guidedText}
              onChange={(e) => setSlotForm({ ...slotForm, guidedText: e.target.value })}
              rows={3}
            />
            <input
              type="text"
              placeholder="Références bibliques, séparées par des virgules"
              value={slotForm.bibleReferences}
              onChange={(e) => setSlotForm({ ...slotForm, bibleReferences: e.target.value })}
            />
            <input
              type="text"
              placeholder="Chants recommandés, séparés par des virgules"
              value={slotForm.recommendedSongs}
              onChange={(e) => setSlotForm({ ...slotForm, recommendedSongs: e.target.value })}
            />
            <input
              type="number"
              placeholder="Ordre (facultatif)"
              value={slotForm.orderIndex}
              onChange={(e) => setSlotForm({ ...slotForm, orderIndex: e.target.value })}
              min={0}
            />
            <div className="request-form">
              <button type="submit" disabled={slotSaving}>
                {slotSaving ? 'Enregistrement…' : editingSlotId ? 'Enregistrer' : 'Ajouter le créneau'}
              </button>
              {editingSlotId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSlotId(null);
                    setSlotForm(EMPTY_SLOT_FORM);
                  }}
                >
                  Annuler
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
