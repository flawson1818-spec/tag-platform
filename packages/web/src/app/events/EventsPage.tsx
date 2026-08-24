import { FormEvent, useEffect, useState } from 'react';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { EVENT_STATUSES, EVENT_TYPES, EVENT_TYPE_LABELS, EventParticipant, TagEvent, eventsApi } from '../../lib/api';
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
  const { user } = useAuth();
  const [events, setEvents] = useState<TagEvent[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [liveEventId, setLiveEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

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

  const refreshParticipants = (eventId: string) => {
    setParticipantsLoading(true);
    eventsApi
      .listParticipants(eventId)
      .then(setParticipants)
      .catch((err) => setFormError((err as Error).message))
      .finally(() => setParticipantsLoading(false));
  };

  const toggleLive = (eventId: string) => {
    if (liveEventId === eventId) {
      setLiveEventId(null);
      return;
    }
    setLiveEventId(eventId);
    refreshParticipants(eventId);
  };

  const me = participants.find((p) => p.user_id === user?.id) ?? null;

  const handleRaiseHand = () => {
    const token = getAccessToken();
    if (!token || !liveEventId) {
      setFormError('Connecte-toi pour lever la main.');
      return;
    }
    eventsApi
      .raiseHand(token, liveEventId)
      .then(() => refreshParticipants(liveEventId))
      .catch((err) => setFormError((err as Error).message));
  };

  const handleLowerHand = () => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .lowerHand(token, liveEventId)
      .then(() => refreshParticipants(liveEventId))
      .catch((err) => setFormError((err as Error).message));
  };

  const handleSetRole = (participantUserId: string, role: string) => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .setParticipantRole(token, liveEventId, participantUserId, role)
      .then(() => refreshParticipants(liveEventId))
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
              {event.status === 'RUNNING' && (
                <button type="button" onClick={() => toggleLive(event.id)}>
                  {liveEventId === event.id ? 'Fermer la salle en direct' : '🖐 Salle en direct'}
                </button>
              )}
              {EVENT_STATUSES.filter((s) => s !== event.status).map((s) => (
                <button key={s} onClick={() => handleStatusChange(event.id, s)}>
                  {s}
                </button>
              ))}
            </div>

            {liveEventId === event.id && (
              <div className="request-row" style={{ marginTop: '0.6rem' }}>
                {participantsLoading && <p>Chargement…</p>}
                <div className="request-form">
                  <button type="button" onClick={me?.hand_raised_at ? handleLowerHand : handleRaiseHand}>
                    {me?.hand_raised_at ? 'Baisser la main' : 'Lever la main 🖐'}
                  </button>
                </div>
                {!participantsLoading && participants.filter((p) => p.hand_raised_at).length === 0 && (
                  <p className="hint">Aucune main levée pour l'instant.</p>
                )}
                <ul className="request-list">
                  {participants
                    .filter((p) => p.hand_raised_at)
                    .map((p) => (
                      <li key={p.id} className="request-row">
                        <div className="request-meta">
                          <span>{p.display_name ?? 'Anonyme'}</span>
                          <span className="chip chip-status">{p.role_in_event}</span>
                        </div>
                        <div className="request-form">
                          {p.role_in_event === 'SPEAKER' ? (
                            <button type="button" onClick={() => handleSetRole(p.user_id, 'ATTENDEE')}>
                              Retirer la parole
                            </button>
                          ) : (
                            <button type="button" onClick={() => handleSetRole(p.user_id, 'SPEAKER')}>
                              Donner la parole
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!loading && events.length === 0 && !error && <p className="hint">Aucun événement pour l'instant.</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default EventsPage;
