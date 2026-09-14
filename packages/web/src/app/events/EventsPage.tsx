import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  EventBreakoutRoom,
  EventParticipant,
  EventPoll,
  TagEvent,
  WS_URL,
  eventsApi,
} from '../../lib/api';
import { Pagination } from '../Pagination';
import i18n from '../../i18n/config';

const EVENT_CHAT_MAX_LENGTH = 500;
const EVENT_QUICK_REACTIONS = ['🙏', '❤️', '🙌', '🔥'];

interface EventChatEntry {
  authorId: string;
  displayName: string;
  content: string;
  sentAt: string;
}

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EventsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
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
  const [eventChatMessages, setEventChatMessages] = useState<EventChatEntry[]>([]);
  const [eventChatInput, setEventChatInput] = useState('');
  const [eventChatError, setEventChatError] = useState<string | null>(null);
  const [eventReactions, setEventReactions] = useState<{ id: number; emoji: string }[]>([]);
  const eventSocketRef = useRef<Socket | null>(null);

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

  useEffect(() => {
    if (!liveEventId) return undefined;

    const socket = io(`${WS_URL}/realtime`, {
      transports: ['websocket'],
      query: { token: getAccessToken() ?? '' },
    });
    eventSocketRef.current = socket;

    socket.on('connect', () => socket.emit('event:join', { eventId: liveEventId }));
    socket.on('event:chat:history', (payload: { messages: EventChatEntry[] }) => setEventChatMessages(payload.messages));
    socket.on('event:chat:message', (payload: { message: EventChatEntry }) =>
      setEventChatMessages((prev) => [...prev, payload.message]),
    );
    socket.on('event:chat:error', (payload: { message: string }) => setEventChatError(payload.message));
    socket.on('event:reaction:new', (payload: { emoji: string }) => {
      const id = Date.now() + Math.random();
      setEventReactions((prev) => [...prev, { id, emoji: payload.emoji }]);
      setTimeout(() => setEventReactions((prev) => prev.filter((r) => r.id !== id)), 2200);
    });

    return () => {
      socket.emit('event:leave', { eventId: liveEventId });
      socket.disconnect();
      eventSocketRef.current = null;
    };
  }, [liveEventId]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setFormError(t('events.needLoginCreate'));
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
      setFormError(t('events.needLoginJoin'));
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
      setFormError(t('events.needLoginHand'));
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
        setBreakoutNotice(res.redirected ? t('events.breakoutRedirectedNotice') : null);
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
      setFormError(t('events.pollValidation'));
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

  const sendEventChat = (e: FormEvent) => {
    e.preventDefault();
    const content = eventChatInput.trim();
    if (!content || !eventSocketRef.current || !liveEventId) return;
    eventSocketRef.current.emit('event:chat:send', { eventId: liveEventId, content });
    setEventChatInput('');
  };

  const sendEventReaction = (emoji: string) => {
    if (!liveEventId) return;
    eventSocketRef.current?.emit('event:reaction:send', { eventId: liveEventId, emoji });
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
      <h2>{t('events.title')}</h2>
      <p className="hint">
        {t('events.intro')} <code>event.manage</code>.
      </p>

      <form onSubmit={handleCreate} className="request-form">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {t(`eventTypes.${eventType}`)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t('events.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder={t('events.descriptionPlaceholder')}
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
          {creating ? t('events.creating') : t('events.createSubmit')}
        </button>
      </form>
      {formError && <p className="error">{formError}</p>}

      <div className="inline-form">
        <label htmlFor="event-type-filter">{t('events.filterByType')}</label>
        <select id="event-type-filter" value={typeFilter} onChange={(e) => handleTypeFilterChange(e.target.value)}>
          <option value="">{t('events.allTypes')}</option>
          {EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {t(`eventTypes.${eventType}`)}
            </option>
          ))}
        </select>
      </div>

      {loading && <p>{t('events.loading')}</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {events.map((event) => (
          <li key={event.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`eventTypes.${event.type}`, event.type)}</span>
              <span className="chip chip-status">{t(`eventStatuses.${event.status}`, event.status)}</span>
              <span className="hint">{formatSchedule(event.scheduled_at)}</span>
            </div>
            <p>
              <strong>{event.title}</strong>
            </p>
            {event.description && <p className="hint">{event.description}</p>}
            <div className="request-form">
              <button onClick={() => handleJoin(event.id)} disabled={joinedIds.has(event.id)}>
                {joinedIds.has(event.id) ? t('events.joined') : t('events.join')}
              </button>
              {event.status === 'RUNNING' && (
                <button type="button" onClick={() => toggleLive(event.id)}>
                  {liveEventId === event.id ? t('events.liveRoomClose') : t('events.liveRoomOpen')}
                </button>
              )}
              {EVENT_STATUSES.filter((s) => s !== event.status).map((s) => (
                <button key={s} onClick={() => handleStatusChange(event.id, s)}>
                  {t(`eventStatuses.${s}`, s)}
                </button>
              ))}
            </div>

            {liveEventId === event.id && (
              <div className="request-row" style={{ marginTop: '0.6rem' }}>
                {participantsLoading && <p>{t('events.loading')}</p>}
                <div className="request-form">
                  <button type="button" onClick={me?.hand_raised_at ? handleLowerHand : handleRaiseHand}>
                    {me?.hand_raised_at ? t('events.lowerHand') : t('events.raiseHand')}
                  </button>
                  {EVENT_QUICK_REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => sendEventReaction(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="room-reactions-overlay">
                  {eventReactions.map((reaction) => (
                    <span key={reaction.id} className="room-reaction-float">
                      {reaction.emoji}
                    </span>
                  ))}
                </div>
                {!participantsLoading && participants.filter((p) => p.hand_raised_at).length === 0 && (
                  <p className="hint">{t('events.noHandsRaised')}</p>
                )}

                <div className="request-row" style={{ marginTop: '0.6rem' }}>
                  <p><strong>{t('events.breakoutTitle')}</strong></p>
                  <p className="hint">{t('events.breakoutIntro')}</p>
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
                      {t('events.breakoutCreate')}
                    </button>
                    {myRoomId && (
                      <button type="button" onClick={handleLeaveBreakoutRoom}>
                        {t('events.backToMainRoom')}
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
                              {myRoomId === room.id ? t('events.inThisRoom') : t('events.joinRoom')}
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
                          <span>{p.display_name ?? t('events.anonymous')}</span>
                          <span className="chip chip-status">{p.role_in_event}</span>
                        </div>
                        <div className="request-form">
                          {p.role_in_event === 'SPEAKER' ? (
                            <button type="button" onClick={() => handleSetRole(p.user_id, 'ATTENDEE')}>
                              {t('events.removeSpeaker')}
                            </button>
                          ) : (
                            <button type="button" onClick={() => handleSetRole(p.user_id, 'SPEAKER')}>
                              {t('events.giveSpeaker')}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>

                <div className="request-row" style={{ marginTop: '0.6rem' }}>
                  <p><strong>{t('events.chatTitle')}</strong></p>
                  <div className="room-chat-list">
                    {eventChatMessages.length === 0 && <p className="room-chat-empty">{t('events.chatEmpty')}</p>}
                    {eventChatMessages.map((m, index) => (
                      <div key={index} className="room-chat-message">
                        <strong>{m.displayName}</strong>
                        <span>{m.content}</span>
                      </div>
                    ))}
                  </div>
                  {eventChatError && <p className="error room-chat-error">{eventChatError}</p>}
                  <form className="room-chat-form" onSubmit={sendEventChat}>
                    <input
                      type="text"
                      value={eventChatInput}
                      onChange={(e) => setEventChatInput(e.target.value)}
                      placeholder={t('events.chatPlaceholder')}
                      maxLength={EVENT_CHAT_MAX_LENGTH}
                    />
                    <button type="submit" disabled={!eventChatInput.trim()}>
                      {t('events.send')}
                    </button>
                  </form>
                </div>

                <div className="request-row" style={{ marginTop: '0.6rem' }}>
                  <p><strong>{t('events.pollsTitle')}</strong></p>
                  <form className="request-form" onSubmit={handleCreatePoll}>
                    <input
                      type="text"
                      placeholder={t('events.pollQuestionPlaceholder')}
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder={t('events.pollOptionsPlaceholder')}
                      value={pollOptions}
                      onChange={(e) => setPollOptions(e.target.value)}
                    />
                    <button type="submit">{t('events.pollCreate')}</button>
                  </form>
                  {polls.length === 0 && <p className="hint">{t('events.noPolls')}</p>}
                  <ul className="request-list">
                    {polls.map((poll) => (
                      <li key={poll.id} className="request-row">
                        <p>
                          <strong>{poll.question}</strong>
                          {poll.closed_at && <span className="chip chip-status"> {t('events.pollClosed')}</span>}
                        </p>
                        <ul className="request-list">
                          {poll.options.map((option, index) => (
                            <li key={option} className="request-row">
                              <div className="request-meta">
                                <span>{option}</span>
                                <span className="chip chip-status">
                                  {t('events.votes', { count: poll.vote_counts[index] ?? 0 })}
                                </span>
                              </div>
                              {!poll.closed_at && (
                                <button
                                  type="button"
                                  onClick={() => handleVotePoll(poll.id, index)}
                                  disabled={poll.my_vote === index}
                                >
                                  {poll.my_vote === index ? t('events.yourChoice') : t('events.vote')}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="hint">{t('events.totalVotes', { count: poll.total_votes })}</p>
                        {!poll.closed_at && (
                          <button type="button" className="link-button" onClick={() => handleClosePoll(poll.id)}>
                            {t('events.closePoll')}
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
      {!loading && events.length === 0 && !error && <p className="hint">{t('events.noEvents')}</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default EventsPage;
