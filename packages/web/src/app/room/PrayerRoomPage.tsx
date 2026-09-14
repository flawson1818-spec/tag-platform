import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { ChatMessage, PrayerSlot, RoomPerson, WS_URL, prayerApi } from '../../lib/api';
import { formatRemaining } from '../../lib/format';
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
  const [nowPlaying, setNowPlaying] = useState<{ videoId: string; title: string } | null>(null);
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

    socket.on('slot:started', (payload: { slot: PrayerSlot; remainingSeconds: number }) => {
      setSlot(payload.slot);
      setRemainingSeconds(payload.remainingSeconds);
      setTotalSeconds(
        Math.round(
          (new Date(payload.slot.end_at).getTime() - new Date(payload.slot.start_at).getTime()) / 1000,
        ),
      );
      setConnectionState('live');
    });

    socket.on('slot:tick', (payload: { remainingSeconds: number }) => {
      setRemainingSeconds(payload.remainingSeconds);
    });

    socket.on('slot:ended', () => {
      setConnectionState('connecting');
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

    socket.on('music:update', (payload: { playing: boolean; videoId?: string; title?: string }) => {
      setNowPlaying(payload.playing && payload.videoId ? { videoId: payload.videoId, title: payload.title ?? '' } : null);
    });

    return () => {
      socket.emit('room:leave', { roomId: ROOM_ID });
      socket.disconnect();
    };
  }, []);

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

  const progressPct = totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100)) : 0;

  return (
    <div className="room-page">
      <h2>{t('room.title')}</h2>

      {connectionState !== 'live' && (
        <p className="room-status">
          {connectionState === 'connecting' ? t('room.connecting') : t('room.empty')}
        </p>
      )}

      {slot && connectionState === 'live' && (
        <div className="room-stage">
          <div className="room-chips">
            <span className="chip">{slot.category}</span>
            {slot.importance === 'Urgent' && <span className="chip chip-urgent">{t('room.urgent')}</span>}
          </div>

          <div className="room-timer">{formatRemaining(remainingSeconds)}</div>
          <div className="room-progress">
            <div className="room-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          {remainingSeconds > 0 && remainingSeconds <= 5 && (
            <p className="hint room-ending-soon">{t('room.endingSoon', { seconds: remainingSeconds })}</p>
          )}

          <h3>{slot.title}</h3>
          {slot.guided_text && <p className="room-guided-text">{slot.guided_text}</p>}

          {slot.bible_references.length > 0 && (
            <blockquote className="room-verse">
              {slot.bible_references.map((reference) => (
                <div key={reference}>{reference}</div>
              ))}
            </blockquote>
          )}

          <p className="room-leader">
            {slot.leader_display_name ? t('room.leaderNamed', { name: slot.leader_display_name }) : t('room.leaderAi')}
          </p>

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

        {nowPlaying && (
          <div className="room-music-player">
            <iframe
              width="100%"
              height="200"
              src={`https://www.youtube.com/embed/${nowPlaying.videoId}?autoplay=1`}
              title={nowPlaying.title || t('room.defaultMusicTitle')}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
            <button type="button" className="room-action" onClick={stopMusic}>
              {t('room.stopForEveryone')}
            </button>
          </div>
        )}

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
