import { FormEvent, useEffect, useState } from 'react';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EventBreakoutRoom,
  EventParticipant,
  EventPoll,
  TagEvent,
  eventsApi,
} from '../../lib/api';
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
  const [breakoutRooms, setBreakoutRooms] = useState<EventBreakoutRoom[]>([]);
  const [myRoomId, setMyRoomId] = useState<string | null>(null);
  const [breakoutRoomCount, setBreakoutRoomCount] = useState(2);
  const [breakoutNotice, setBreakoutNotice] = useState<string | null>(null);
  const [polls, setPolls] = useState<EventPoll[]>([]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('');

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

  const refreshBreakoutRooms = (eventId: string) => {
    eventsApi.listBreakoutRooms(eventId).then(setBreakoutRooms).catch(() => setBreakoutRooms([]));
    const token = getAccessToken();
    if (token) eventsApi.myBreakoutRoom(token, eventId).then(setMyRoomId).catch(() => setMyRoomId(null));
  };

  const toggleLive = (eventId: string) => {
    if (liveEventId === eventId) {
      setLiveEventId(null);
      return;
    }
    setLiveEventId(eventId);
    refreshParticipants(eventId);
    refreshBreakoutRooms(eventId);
    refreshPolls(eventId);
  };

  const refreshPolls = (eventId: string) => {
    eventsApi.listPolls(eventId).then(setPolls).catch(() => setPolls([]));
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

  const handleCreateBreakoutRooms = () => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .createBreakoutRooms(token, liveEventId, breakoutRoomCount)
      .then(() => refreshBreakoutRooms(liveEventId))
      .catch((err) => setFormError((err as Error).message));
  };

  const handleJoinBreakoutRoom = (roomId: string) => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .joinBreakoutRoom(token, liveEventId, roomId)
      .then((res) => {
        setMyRoomId(res.roomId);
        setBreakoutNotice(res.redirected ? 'Cette salle était pleine — tu as été redirigé vers la salle la moins chargée.' : null);
        refreshBreakoutRooms(liveEventId);
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleCreatePoll = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    const options = pollOptions.split(',').map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || options.length < 2) {
      setFormError('Un sondage a besoin d\'une question et d\'au moins deux options séparées par des virgules.');
      return;
    }
    eventsApi
      .createPoll(token, liveEventId, pollQuestion.trim(), options)
      .then(() => {
        setPollQuestion('');
        setPollOptions('');
        refreshPolls(liveEventId);
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleVotePoll = (pollId: string, optionIndex: number) => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .votePoll(token, liveEventId, pollId, optionIndex)
      .then(() => refreshPolls(liveEventId))
      .catch((err) => setFormError((err as Error).message));
  };

  const handleClosePoll = (pollId: string) => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .closePoll(token, liveEventId, pollId)
      .then(() => refreshPolls(liveEventId))
      .catch((err) => setFormError((err as Error).message));
  };

  const handleLeaveBreakoutRoom = () => {
    const token = getAccessToken();
    if (!token || !liveEventId) return;
    eventsApi
      .leaveBreakoutRoom(token, liveEventId)
      .then(() => {
        setMyRoomId(null);
        setBreakoutNotice(null);
        refreshBreakoutRooms(liveEventId);
      })
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

                <div className="request-row" style={{ marginTop: '0.6rem' }}>
                  <p><strong>Salles ▾</strong></p>
                  <p className="hint">
                    Répartition en petites salles de prière — capacité atteinte : redirection automatique
                    vers la salle la moins chargée, jamais de blocage.
                  </p>
                  <div className="request-form">
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={breakoutRoomCount}
                      onChange={(e) => setBreakoutRoomCount(Number(e.target.value) || 2)}
                      style={{ width: '4rem' }}
                    />
                    <button type="button" onClick={handleCreateBreakoutRooms}>
                      Créer / répartir
                    </button>
                    {myRoomId && (
                      <button type="button" onClick={handleLeaveBreakoutRoom}>
                        Retour salle principale
                      </button>
                    )}
                  </div>
                  {breakoutNotice && <p className="hint">{breakoutNotice}</p>}
                  {breakoutRooms.length > 0 && (
                    <ul className="request-list">
                      {breakoutRooms.map((room) => (
                        <li key={room.id} className="request-row">
                          <div className="request-meta">
                            <span>{room.label}</span>
                            <span className="chip chip-status">
                              {room.occupant_count}{room.capacity ? `/${room.capacity}` : ''}
                            </span>
                          </div>
                          <div className="request-form">
                            <button
                              type="button"
                              onClick={() => handleJoinBreakoutRoom(room.id)}
                              disabled={myRoomId === room.id}
                            >
                              {myRoomId === room.id ? 'Dans cette salle ✓' : 'Rejoindre'}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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

                <div className="request-row" style={{ marginTop: '0.6rem' }}>
                  <p><strong>Sondages</strong></p>
                  <form className="request-form" onSubmit={handleCreatePoll}>
                    <input
                      type="text"
                      placeholder="Question"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Options séparées par des virgules"
                      value={pollOptions}
                      onChange={(e) => setPollOptions(e.target.value)}
                    />
                    <button type="submit">Créer le sondage</button>
                  </form>
                  {polls.length === 0 && <p className="hint">Aucun sondage pour l'instant.</p>}
                  <ul className="request-list">
                    {polls.map((poll) => (
                      <li key={poll.id} className="request-row">
                        <p>
                          <strong>{poll.question}</strong>
                          {poll.closed_at && <span className="chip chip-status"> Clos</span>}
                        </p>
                        <ul className="request-list">
                          {poll.options.map((option, index) => (
                            <li key={option} className="request-row">
                              <div className="request-meta">
                                <span>{option}</span>
                                <span className="chip chip-status">{poll.vote_counts[index] ?? 0} voix</span>
                              </div>
                              {!poll.closed_at && (
                                <button
                                  type="button"
                                  onClick={() => handleVotePoll(poll.id, index)}
                                  disabled={poll.my_vote === index}
                                >
                                  {poll.my_vote === index ? 'Ton choix ✓' : 'Voter'}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="hint">{poll.total_votes} vote(s) au total.</p>
                        {!poll.closed_at && (
                          <button type="button" className="link-button" onClick={() => handleClosePoll(poll.id)}>
                            Clore le sondage
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
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
