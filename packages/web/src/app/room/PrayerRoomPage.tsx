import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { ChatMessage, PrayerSlot, RoomPerson, WS_URL, prayerApi, prayerRequestsApi } from '../../lib/api';
import { Link } from 'react-router-dom';
import { RoomReader } from './RoomReader';
import { formatRemaining } from '../../lib/format';
import { splitVerse } from '../../lib/creneau-parser';
import i18n from '../../i18n/config';

const ROOM_ID = 'world';
const CHAT_MAX_LENGTH = 500;
const QUICK_REACTIONS = ['🙏', '❤️', '🙌', '🔥'];
const MUSIC_QUICK_PICK_CODES = ['PRAISE', 'INSTRUMENTAL_ADORATION', 'GOSPEL'] as const;

type MusicPlatform = 'youtube' | 'spotify';

function musicSearchUrl(platform: MusicPlatform, query: string): string {
  const q = encodeURIComponent(query.trim() || i18n.t('room.musicQuickPicks.PRAISE'));
  return platform === 'spotify'
    ? `https://open.spotify.com/search/${q}`
    : `https://www.youtube.com/results?search_query=${q}`;
}

const YOUTUBE_URL_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_PATTERN);
  return match ? match[1] : null;
}

type ConnectionState = 'connecting' | 'live' | 'empty';
type NowPlaying = { videoId?: string; embedUrl?: string; provider?: 'youtube' | 'spotify'; title: string; auto?: boolean };
type Sharer = { kind: 'MODERATOR' | 'AI' | 'PROGRAM'; displayName: string | null };
type NextUp = { title: string; startsNewCreneau: boolean };
type Relay = { nextTitle: string; deadline: string; moderators: string[] };
type FloatingReaction = { id: number; emoji: string };

export function PrayerRoomPage() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [slot, setSlot] = useState<PrayerSlot | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<RoomPerson[]>([]);
  const [pendingSpeakers, setPendingSpeakers] = useState<RoomPerson[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<RoomPerson[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicPlatform, setMusicPlatform] = useState<MusicPlatform>('youtube');
  const [musicLinkInput, setMusicLinkInput] = useState('');
  const [musicLinkError, setMusicLinkError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [sharedBy, setSharedBy] = useState<Sharer | null>(null);
  const [nextUp, setNextUp] = useState<NextUp | null>(null);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [takeoverForm, setTakeoverForm] = useState({ title: '', text: '', minutes: 60 });
  const [now, setNow] = useState(() => Date.now());
  /** The request carried by the current slot, if any (§5.7). */
  const [carried, setCarried] = useState<{ requestId: string; count: number; prayedByMe: boolean } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  // The room:join effect below only runs once on mount, so its socket handlers close over
  // `user` as it was at that instant; reading this ref instead keeps them seeing the latest one.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const handRaisedByMe = Boolean(user && raisedHands.some((p) => p.userId === user.id));
  const speakPendingByMe = Boolean(user && pendingSpeakers.some((p) => p.userId === user.id));
  const speakingByMe = Boolean(user && activeSpeakers.some((p) => p.userId === user.id));

  useEffect(() => {
    // Prime the display immediately in case the room is already running; the WS join
    // below still drives all subsequent updates (this is just to avoid a blank first paint).
    prayerApi
      .active(ROOM_ID)
      .then((active) => {
        setSlot(active);
        setRemainingSeconds(active.remainingSeconds);
        setTotalSeconds(
          Math.round((new Date(active.end_at).getTime() - new Date(active.start_at).getTime()) / 1000),
        );
        setConnectionState('live');
      })
      .catch(() => setConnectionState('empty'));

    const socket = io(`${WS_URL}/realtime`, {
      transports: ['websocket'],
      query: { token: getAccessToken() ?? '' },
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('room:join', { roomId: ROOM_ID }));

    socket.on(
      'slot:started',
      (payload: { slot: PrayerSlot; remainingSeconds: number; sharedBy?: Sharer; next?: NextUp | null }) => {
      setSlot(payload.slot);
      if (payload.sharedBy) setSharedBy(payload.sharedBy);
      setNextUp(payload.next ?? null);
      setRelay(null);
      setSharing(false);
      setRemainingSeconds(payload.remainingSeconds);
      setTotalSeconds(
        Math.round(
          (new Date(payload.slot.end_at).getTime() - new Date(payload.slot.start_at).getTime()) / 1000,
        ),
      );
      setConnectionState('live');
    },
    );

    socket.on('slot:tick', (payload: { remainingSeconds: number }) => {
      setRemainingSeconds(payload.remainingSeconds);
    });

    // A segment ending is immediately followed by the next one (or by a time of praise): keep the
    // room on screen instead of flashing "connecting", which read as if the prayer had stopped.
    socket.on('slot:ended', () => {
      setRemainingSeconds(0);
    });

    socket.on('chat:history', (payload: { messages: ChatMessage[] }) => {
      setMessages(payload.messages);
    });

    socket.on('chat:message', (payload: { message: ChatMessage }) => {
      setMessages((prev) => [...prev, payload.message]);
    });

    socket.on('chat:messageHidden', (payload: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    });

    socket.on('chat:error', (payload: { message: string }) => {
      setChatError(payload.message);
    });

    socket.on('chat:muted', (payload: { userId: string; mutedUntil: string }) => {
      const me = userRef.current;
      if (me && payload.userId === me.id) setMutedUntil(payload.mutedUntil);
    });

    socket.on('chat:unmuted', (payload: { userId: string }) => {
      const me = userRef.current;
      if (me && payload.userId === me.id) setMutedUntil(null);
    });

    socket.on('hand:update', (payload: { raised: RoomPerson[] }) => {
      setRaisedHands(payload.raised);
    });

    socket.on('speak:update', (payload: { pending: RoomPerson[]; active: RoomPerson[] }) => {
      setPendingSpeakers(payload.pending);
      setActiveSpeakers(payload.active);
    });

    socket.on('speak:revoked', (payload: { userIds: string[] }) => {
      const me = userRef.current;
      if (me && payload.userIds.includes(me.id)) {
        setRoomNotice(t('room.returnedToListening'));
      }
    });

    socket.on('reaction:new', (payload: { emoji: string }) => {
      const id = Date.now() + Math.random();
      setReactions((prev) => [...prev, { id, emoji: payload.emoji }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 2200);
    });

    socket.on('room:error', (payload: { message: string }) => {
      setRoomError(payload.message);
    });

    socket.on('music:update', (payload: { playing: boolean } & Partial<NowPlaying>) => {
      const playable = payload.playing && (payload.embedUrl || payload.videoId);
      setNowPlaying(
        playable
          ? { videoId: payload.videoId, embedUrl: payload.embedUrl, provider: payload.provider, title: payload.title ?? '', auto: payload.auto }
          : null,
      );
    });

    // Relay between créneaux: a moderator present shares the next créneau, else the AI does
    // (PrayerEngineService). The closing segment keeps running meanwhile — the prayer never stops.
    socket.on('room:role', (payload: { canShare: boolean }) => setCanShare(payload.canShare));
    socket.on('relay:pending', (payload: Relay) => setRelay(payload));
    socket.on('relay:cleared', () => setRelay(null));
    socket.on('request:prayed', (payload: { requestId: string; count: number }) => {
      setCarried((c) => (c && c.requestId === payload.requestId ? { ...c, count: payload.count } : c));
    });

    return () => {
      socket.emit('room:leave', { roomId: ROOM_ID });
      socket.disconnect();
    };
  }, []);

  const slotId = slot?.id;
  useEffect(() => {
    if (!slotId || !/^[0-9a-f-]{36}$/i.test(slotId)) return;
    let cancelled = false;
    prayerRequestsApi
      .forSlot(slotId, getAccessToken())
      .then((res) => {
        if (!cancelled) setCarried(res.requestId ? { requestId: res.requestId, count: res.count, prayedByMe: res.prayedByMe } : null);
      })
      .catch(() => {
        if (!cancelled) setCarried(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slotId]);

  const prayForIt = () => {
    const token = getAccessToken();
    if (!token || !carried) return;
    setCarried({ ...carried, prayedByMe: true, count: carried.prayedByMe ? carried.count : carried.count + 1 });
    prayerRequestsApi
      .pray(token, carried.requestId)
      .then((res) => setCarried((c) => (c ? { ...c, count: res.count, prayedByMe: true } : c)))
      .catch((err) => setRoomError((err as Error).message));
  };

  useEffect(() => {
    if (!chatError) return;
    const timeout = setTimeout(() => setChatError(null), 4000);
    return () => clearTimeout(timeout);
  }, [chatError]);

  useEffect(() => {
    if (!mutedUntil) return;
    const remainingMs = new Date(mutedUntil).getTime() - Date.now();
    if (remainingMs <= 0) {
      setMutedUntil(null);
      return;
    }
    const timeout = setTimeout(() => setMutedUntil(null), remainingMs);
    return () => clearTimeout(timeout);
  }, [mutedUntil]);

  useEffect(() => {
    if (!roomError) return;
    const timeout = setTimeout(() => setRoomError(null), 4000);
    return () => clearTimeout(timeout);
  }, [roomError]);

  useEffect(() => {
    if (!roomNotice) return;
    const timeout = setTimeout(() => setRoomNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [roomNotice]);

  useEffect(() => {
    const list = chatListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content || !socketRef.current) return;
    socketRef.current.emit('chat:send', { roomId: ROOM_ID, content });
    setChatInput('');
  }

  function hideMessage(messageId: string) {
    socketRef.current?.emit('chat:hide', { roomId: ROOM_ID, messageId });
  }

  function muteAuthor(authorId: string) {
    socketRef.current?.emit('chat:mute', { roomId: ROOM_ID, userId: authorId, minutes: 15, reason: 'Modération manuelle' });
  }

  const isMutedNow = Boolean(mutedUntil && new Date(mutedUntil).getTime() > Date.now());

  function requireAuth(): boolean {
    if (status === 'authenticated') return true;
    setRoomError(t('room.needLogin'));
    return false;
  }

  function toggleHand() {
    if (!requireAuth() || !socketRef.current) return;
    socketRef.current.emit(handRaisedByMe ? 'hand:lower' : 'hand:raise', { roomId: ROOM_ID });
  }

  function sendReaction(emoji: string) {
    if (!requireAuth() || !socketRef.current) return;
    socketRef.current.emit('reaction:send', { roomId: ROOM_ID, emoji });
  }

  function toggleSpeakRequest() {
    if (!requireAuth() || !socketRef.current) return;
    socketRef.current.emit(speakPendingByMe ? 'speak:cancel' : 'speak:request', { roomId: ROOM_ID });
  }

  function grantSpeak(userId: string) {
    socketRef.current?.emit('speak:grant', { roomId: ROOM_ID, userId });
  }

  function revokeSpeak(userId: string) {
    socketRef.current?.emit('speak:revoke', { roomId: ROOM_ID, userId });
  }

  function openMusicSearch(query: string) {
    window.open(musicSearchUrl(musicPlatform, query), '_blank', 'noopener,noreferrer');
  }

  function submitMusicSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openMusicSearch(musicQuery);
  }

  function playMusicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const videoId = extractYouTubeId(musicLinkInput.trim());
    if (!videoId) {
      setMusicLinkError(t('room.invalidYoutubeLink'));
      return;
    }
    setMusicLinkError(null);
    socketRef.current?.emit('music:play', { roomId: ROOM_ID, videoId, title: musicQuery });
    setMusicLinkInput('');
  }

  function stopMusic() {
    socketRef.current?.emit('music:stop', { roomId: ROOM_ID });
  }

  useEffect(() => {
    if (!relay) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [relay]);

  /** "Reprendre la main": a moderator leads live with the subject they write, then gives it back. */
  function takeOver(e: FormEvent) {
    e.preventDefault();
    socketRef.current?.emit('room:takeover', { roomId: ROOM_ID, ...takeoverForm });
    setTakeoverOpen(false);
  }

  function giveBack() {
    socketRef.current?.emit('room:release', { roomId: ROOM_ID });
  }

  function shareCreneau() {
    setSharing(true);
    socketRef.current?.emit('relay:share', { roomId: ROOM_ID });
  }

  const relaySecondsLeft = relay ? Math.max(0, Math.round((new Date(relay.deadline).getTime() - now) / 1000)) : 0;

  const isWorship = slot?.kind === 'WORSHIP';
  const musicPlayer = nowPlaying && (
    <div className="room-music-player">
      <iframe
        width="100%"
        height={nowPlaying.provider === 'spotify' ? 152 : 200}
        src={nowPlaying.embedUrl ?? `https://www.youtube.com/embed/${nowPlaying.videoId}?autoplay=1`}
        title={nowPlaying.title || t('room.defaultMusicTitle')}
        allow="autoplay; encrypted-media; clipboard-write"
        allowFullScreen
      />
      {canShare && (
        <button type="button" className="room-action" onClick={stopMusic}>
          {t('room.stopForEveryone')}
        </button>
      )}
    </div>
  );
  const progressPct = totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100)) : 0;

  return (
    <div className="room-page">
      <h2>{t('room.title')}</h2>

      {connectionState !== 'live' && (
        <p className="room-status">
          {connectionState === 'connecting' ? t('room.connecting') : t('room.empty')}
        </p>
      )}

      {canShare && (
        <section className={`room-takeover${slot?.kind === 'LIVE' ? ' is-live' : ''}`}>
          {slot?.kind === 'LIVE' ? (
            <>
              <p>
                <strong>{t('room.takeover.liveTitle', { name: slot.leader_display_name ?? '' })}</strong>
                <br />
                <span className="hint">{t('room.takeover.liveHint')}</span>
              </p>
              <div className="room-takeover-actions">
                <button
                  type="button"
                  onClick={() => {
                    setTakeoverForm({ title: slot.title, text: slot.guided_text ?? '', minutes: takeoverForm.minutes });
                    setTakeoverOpen(!takeoverOpen);
                  }}
                >
                  {t('room.takeover.edit')}
                </button>
                <button type="button" className="room-takeover-release" onClick={giveBack}>
                  {t('room.takeover.release')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                <strong>
                  {sharedBy?.kind === 'MODERATOR' ? t('room.takeover.byModerator') : t('room.takeover.byAi')}
                </strong>
                <br />
                <span className="hint">{t('room.takeover.hint')}</span>
              </p>
              <button type="button" className="room-takeover-take" onClick={() => setTakeoverOpen(!takeoverOpen)}>
                <span aria-hidden="true">✋</span> {t('room.takeover.take')}
              </button>
            </>
          )}
          {takeoverOpen && (
            <form className="room-takeover-form" onSubmit={takeOver}>
              <input
                type="text"
                maxLength={150}
                value={takeoverForm.title}
                onChange={(e) => setTakeoverForm({ ...takeoverForm, title: e.target.value })}
                placeholder={t('room.takeover.titlePlaceholder')}
                aria-label={t('room.takeover.titlePlaceholder')}
              />
              <textarea
                rows={3}
                maxLength={4000}
                value={takeoverForm.text}
                onChange={(e) => setTakeoverForm({ ...takeoverForm, text: e.target.value })}
                placeholder={t('room.takeover.textPlaceholder')}
                aria-label={t('room.takeover.textPlaceholder')}
              />
              <label>
                {t('room.takeover.duration')}
                <select
                  value={takeoverForm.minutes}
                  onChange={(e) => setTakeoverForm({ ...takeoverForm, minutes: Number(e.target.value) })}
                >
                  {[15, 30, 60, 120, 180].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} h`}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">{slot?.kind === 'LIVE' ? t('room.takeover.update') : t('room.takeover.start')}</button>
            </form>
          )}
        </section>
      )}

      {relay && (
        <section className="room-relay" aria-live="polite">
          <span className="room-relay-eyebrow">{t('room.relay.title')}</span>
          <p className="room-relay-next">{t('room.relay.next', { title: relay.nextTitle })}</p>
          <p className="hint">
            {relay.moderators.length > 0
              ? t('room.relay.waitingModerator', { names: relay.moderators.join(', ') })
              : t('room.relay.waitingAny')}{' '}
            {t('room.relay.aiCountdown', { time: formatRemaining(relaySecondsLeft) })}
          </p>
          {canShare && (
            <button type="button" className="room-relay-share" onClick={shareCreneau} disabled={sharing}>
              {sharing ? t('room.relay.sharing') : t('room.relay.share')}
            </button>
          )}
          <p className="hint room-relay-continues">{t('room.relay.continues')}</p>
        </section>
      )}

      {slot && connectionState === 'live' && (
        <div className="room-stage">
          {slot.importance === 'Urgent' && (
            <div className="room-chips">
              <span className="chip chip-urgent">{t('room.urgent')}</span>
            </div>
          )}

          {relay && !isWorship ? (
            // The closing segment carries on during the relay: no 00:00 that would read as "stopped".
            <p className="room-timer-relay">{t('room.relay.inProgress')}</p>
          ) : (
            <>
              <div className="room-timer">{formatRemaining(remainingSeconds)}</div>
              <div className="room-progress">
                <div className="room-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </>
          )}
          {remainingSeconds > 0 && remainingSeconds <= 5 && (
            <p className="hint room-ending-soon">{t('room.endingSoon', { seconds: remainingSeconds })}</p>
          )}

          {!isWorship && <RoomReader slot={slot} />}

          {slot.kind === 'LIVE' && (
            <div className="room-chips">
              <span className="chip chip-live">
                <span aria-hidden="true">🎙️</span> {t('room.takeover.liveChip', { name: slot.leader_display_name ?? '' })}
              </span>
            </div>
          )}
          <h3>{isWorship && <span aria-hidden="true">🎵 </span>}{isWorship ? t('room.worship.title') : slot.title}</h3>
          {isWorship && (
            <div className="room-worship">
              <p>{t('room.worship.text')}</p>
              {musicPlayer}
              {!nowPlaying && (
                <div className="room-worship-links">
                  <a href={musicSearchUrl('youtube', t('room.worship.query'))} target="_blank" rel="noopener noreferrer">
                    ▶ YouTube
                  </a>
                  <a href={musicSearchUrl('spotify', t('room.worship.query'))} target="_blank" rel="noopener noreferrer">
                    ▶ Spotify
                  </a>
                </div>
              )}
            </div>
          )}
          {slot.guided_text && <p className="room-guided-text">{slot.guided_text}</p>}

          {slot.bible_references.length > 0 && (
            <div className="room-verses">
              {slot.bible_references.map((stored) => {
                const verse = splitVerse(stored);
                return (
                  <blockquote key={stored} className="room-verse">
                    {verse.text && <p className="room-verse-text">{verse.text}</p>}
                    <cite className="room-verse-ref">{verse.reference}</cite>
                  </blockquote>
                );
              })}
            </div>
          )}

          {carried && /^[0-9a-f-]{36}$/i.test(slot.id) && carried && (
            <div className="room-carried">
              {status === 'authenticated' ? (
                <button
                  type="button"
                  className={`room-pray-for${carried.prayedByMe ? ' is-on' : ''}`}
                  onClick={prayForIt}
                  disabled={carried.prayedByMe}
                  aria-pressed={carried.prayedByMe}
                >
                  <span aria-hidden="true">🙏</span> {carried.prayedByMe ? t('prayedFor.done') : t('prayedFor.button')}
                </button>
              ) : (
                <Link to="/login" className="room-pray-for">
                  <span aria-hidden="true">🙏</span> {t('prayedFor.login')}
                </Link>
              )}
              <span className="hint">{t('prayedFor.count', { count: carried.count })}</span>
            </div>
          )}

          {nextUp && !relay && (
            <p className="room-next">
              {nextUp.startsNewCreneau
                ? t('room.nextCreneau', { title: nextUp.title })
                : t('room.nextUp', { title: nextUp.title })}
            </p>
          )}

          <div className="room-credits">
            <span>{t('room.ledByPrayers')}</span>
            <span aria-hidden="true">·</span>
            <span>
              {sharedBy?.kind === 'MODERATOR' && sharedBy.displayName
                ? t('room.sharedByModerator', { name: sharedBy.displayName })
                : sharedBy?.kind === 'PROGRAM'
                  ? t('room.sharedByProgram')
                  : t('room.sharedByAi')}
            </span>
          </div>

          <div className="room-reactions-overlay">
            {reactions.map((reaction) => (
              <span key={reaction.id} className="room-reaction-float">
                {reaction.emoji}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="room-actions">
        <button className={handRaisedByMe ? 'room-action active' : 'room-action'} onClick={toggleHand}>
          {t('room.handLabel')}{raisedHands.length > 0 ? ` (${raisedHands.length})` : ''}
        </button>
        <div className="room-action-group">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} className="room-action room-action-emoji" onClick={() => sendReaction(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        <button
          className={
            speakingByMe ? 'room-action active' : speakPendingByMe ? 'room-action pending' : 'room-action'
          }
          onClick={toggleSpeakRequest}
        >
          🎤 {speakingByMe ? t('room.speaking') : speakPendingByMe ? t('room.speakRequested') : t('room.speak')}
        </button>
      </div>

      {roomError && <p className="error room-action-error">{roomError}</p>}
      {roomNotice && <p className="hint room-action-error">{roomNotice}</p>}

      {(raisedHands.length > 0 || pendingSpeakers.length > 0 || activeSpeakers.length > 0) && (
        <div className="room-live-status">
          {activeSpeakers.length > 0 && (
            <p>{t('room.activeSpeakersLabel')} {activeSpeakers.map((s) => s.displayName).join(', ')}</p>
          )}
          {raisedHands.length > 0 && (
            <p>{t('room.raisedHandsLabel')} {raisedHands.map((p) => p.displayName).join(', ')}</p>
          )}
          {pendingSpeakers.length > 0 && (
            <div className="room-speak-queue">
              <p>{t('room.waitingToSpeak')}</p>
              <ul>
                {pendingSpeakers.map((p) => (
                  <li key={p.userId}>
                    {p.displayName}
                    <button className="link-button" onClick={() => grantSpeak(p.userId)}>
                      {t('room.grantSpeak')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activeSpeakers.length > 0 && (
            <div className="room-speak-queue">
              {activeSpeakers.map((s) => (
                <button key={s.userId} className="link-button" onClick={() => revokeSpeak(s.userId)}>
                  {t('room.revokeSpeakPrefix')} {s.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="room-music">
        <h3>{t('room.musicTitle')}</h3>

        {nowPlaying && !isWorship && musicPlayer}

        <p className="hint">{t('room.musicIntro')}</p>
        <form className="room-music-form" onSubmit={submitMusicSearch}>
          <select value={musicPlatform} onChange={(event) => setMusicPlatform(event.target.value as MusicPlatform)}>
            <option value="youtube">YouTube</option>
            <option value="spotify">Spotify</option>
          </select>
          <input
            type="text"
            value={musicQuery}
            onChange={(event) => setMusicQuery(event.target.value)}
            placeholder={t('room.musicSearchPlaceholder')}
          />
          <button type="submit">{t('room.search')}</button>
        </form>
        <div className="room-music-quick">
          {MUSIC_QUICK_PICK_CODES.map((code) => {
            const label = t(`room.musicQuickPicks.${code}`);
            return (
              <button key={code} type="button" className="room-action" onClick={() => openMusicSearch(label)}>
                {label}
              </button>
            );
          })}
        </div>

        <form className="room-music-form room-music-link-form" onSubmit={playMusicLink}>
          <input
            type="text"
            value={musicLinkInput}
            onChange={(event) => setMusicLinkInput(event.target.value)}
            placeholder={t('room.musicLinkPlaceholder')}
          />
          <button type="submit">{t('room.playInRoom')}</button>
        </form>
        {musicLinkError && <p className="error">{musicLinkError}</p>}
      </div>

      <div className="room-chat">
        <h3>{t('room.chatTitle')}</h3>
        <div className="room-chat-list" ref={chatListRef}>
          {messages.length === 0 && <p className="room-chat-empty">{t('room.chatEmpty')}</p>}
          {messages.map((message) => (
            <div key={message.id} className="room-chat-message">
              <strong>{message.author_display_name ?? t('room.anonymous')}</strong>
              <span>{message.content}</span>
              {status === 'authenticated' && message.author_id !== user?.id && (
                <span className="room-chat-mod-actions">
                  <button type="button" className="link-button" onClick={() => hideMessage(message.id)}>
                    {t('room.hide')}
                  </button>
                  <button type="button" className="link-button" onClick={() => muteAuthor(message.author_id)}>
                    {t('room.mute15')}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        {chatError && <p className="error room-chat-error">{chatError}</p>}

        {status === 'authenticated' ? (
          isMutedNow ? (
            <p className="hint room-chat-error">
              {t('room.mutedUntil', {
                time: new Date(mutedUntil as string).toLocaleTimeString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
          ) : (
            <form className="room-chat-form" onSubmit={sendChat}>
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={t('room.chatPlaceholder')}
                maxLength={CHAT_MAX_LENGTH}
              />
              <button type="submit" disabled={!chatInput.trim()}>
                {t('room.send')}
              </button>
            </form>
          )
        ) : (
          <p className="hint">{t('room.needLoginChat')}</p>
        )}
      </div>
    </div>
  );
}

export default PrayerRoomPage;
