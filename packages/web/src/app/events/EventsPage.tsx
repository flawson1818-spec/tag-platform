import { FormEvent, useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { EVENT_STATUSES, EVENT_TYPES, EVENT_TYPE_LABELS, TagEvent, eventsApi } from '../../lib/api';
import { Pagination } from '../Pagination';

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EventsPage() {
  const [events, setEvents] = useState<TagEvent[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [type, setType] = useState<string>(EVENT_TYPES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    eventsApi
      .list(page, typeFilter || undefined)
      .then((res) => {
        setEvents(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [typeFilter, page]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setFormError('Connecte-toi pour créer un événement.');
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      await eventsApi.create(token, { type, title, description: description || undefined, scheduledAt });
      setTitle('');
      setDescription('');
      setScheduledAt('');
      if (page === 1) refresh();
      else setPage(1);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (eventId: string) => {
    const token = getAccessToken();
    if (!token) {
      setFormError('Connecte-toi pour t\'inscrire.');
      return;
    }
    try {
      await eventsApi.join(token, eventId);
      setJoinedIds((prev) => new Set(prev).add(eventId));
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    const token = getAccessToken();
    if (!token) return;
    eventsApi
      .updateStatus(token, id, status)
      .then(refresh)
      .catch((err) => setFormError((err as Error).message));
  };

  return (
    <div className="communities-page">
      <h2>Événements</h2>
      <p className="hint">
        Veillées, jeûnes, croisades, études bibliques… La création est réservée aux comptes
        disposant de la permission <code>event.manage</code>.
      </p>

      <form onSubmit={handleCreate} className="request-form">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input type="text" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea
          placeholder="Description (facultatif)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
        />
        <button type="submit" disabled={creating}>
          {creating ? 'Création…' : "Créer l'événement"}
        </button>
      </form>
      {formError && <p className="error">{formError}</p>}

      <div className="inline-form">
        <label htmlFor="event-type-filter">Filtrer par type</label>
        <select id="event-type-filter" value={typeFilter} onChange={(e) => handleTypeFilterChange(e.target.value)}>
          <option value="">Tous</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {loading && <p>Chargement…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {events.map((event) => (
          <li key={event.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{EVENT_TYPE_LABELS[event.type] ?? event.type}</span>
              <span className="chip chip-status">{event.status}</span>
              <span className="hint">{formatSchedule(event.scheduled_at)}</span>
            </div>
            <p>
              <strong>{event.title}</strong>
            </p>
            {event.description && <p className="hint">{event.description}</p>}
            <div className="request-form">
              <button onClick={() => handleJoin(event.id)} disabled={joinedIds.has(event.id)}>
                {joinedIds.has(event.id) ? 'Inscrit ✓' : "S'inscrire"}
              </button>
              {EVENT_STATUSES.filter((s) => s !== event.status).map((s) => (
                <button key={s} onClick={() => handleStatusChange(event.id, s)}>
                  {s}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!loading && events.length === 0 && !error && <p className="hint">Aucun événement pour l'instant.</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default EventsPage;
