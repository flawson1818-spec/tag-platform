import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { ChatMessage, PrayerSlot, RoomPerson, WS_URL, prayerApi } from '../../lib/api';
import { formatRemaining } from '../../lib/format';

const ROOM_ID = 'world';
const CHAT_MAX_LENGTH = 500;
const QUICK_REACTIONS = ['🙏', '❤️', '🙌', '🔥'];
const MUSIC_QUICK_PICKS = ['Louange', 'Adoration instrumentale', 'Gospel'];

type MusicPlatform = 'youtube' | 'spotify';

function musicSearchUrl(platform: MusicPlatform, query: string): string {
  const q = encodeURIComponent(query.trim() || 'louange et adoration');
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
  const { status, user } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [slot, setSlot] = useState<PrayerSlot | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<RoomPerson[]>([]);
  const [pendingSpeakers, setPendingSpeakers] = useState<RoomPerson[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<RoomPerson[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicPlatform, setMusicPlatform] = useState<MusicPlatform>('youtube');
  const [musicLinkInput, setMusicLinkInput] = useState('');
  const [musicLinkError, setMusicLinkError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ videoId: string; title: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);

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

    socket.on('hand:update', (payload: { raised: RoomPerson[] }) => {
      setRaisedHands(payload.raised);
    });

    socket.on('speak:update', (payload: { pending: RoomPerson[]; active: RoomPerson[] }) => {
      setPendingSpeakers(payload.pending);
      setActiveSpeakers(payload.active);
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
    if (!roomError) return;
    const timeout = setTimeout(() => setRoomError(null), 4000);
    return () => clearTimeout(timeout);
  }, [roomError]);

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

  function requireAuth(): boolean {
    if (status === 'authenticated') return true;
    setRoomError('Connecte-toi pour participer à la salle.');
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
      setMusicLinkError("Ce lien ne ressemble pas à une URL YouTube valide.");
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
      <h2>Salle de prière mondiale</h2>

      {connectionState !== 'live' && (
        <p className="room-status">
          {connectionState === 'connecting'
            ? 'Connexion à la salle en cours…'
            : "Aucune salle n'est active pour le moment."}
        </p>
      )}

      {slot && connectionState === 'live' && (
        <div className="room-stage">
          <div className="room-chips">
            <span className="chip">{slot.category}</span>
            {slot.importance === 'Urgent' && <span className="chip chip-urgent">Urgent</span>}
          </div>

          <div className="room-timer">{formatRemaining(remainingSeconds)}</div>
          <div className="room-progress">
            <div className="room-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

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
            {slot.leader_display_name ? `Animé par ${slot.leader_display_name}` : "Animé par l'IA Intercession"}
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
          🖐 Main{raisedHands.length > 0 ? ` (${raisedHands.length})` : ''}
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
          🎤 {speakingByMe ? 'Vous parlez' : speakPendingByMe ? 'Demande envoyée' : 'Parler'}
        </button>
      </div>

      {roomError && <p className="error room-action-error">{roomError}</p>}

      {(raisedHands.length > 0 || pendingSpeakers.length > 0 || activeSpeakers.length > 0) && (
        <div className="room-live-status">
          {activeSpeakers.length > 0 && (
            <p>🎤 A la parole : {activeSpeakers.map((s) => s.displayName).join(', ')}</p>
          )}
          {raisedHands.length > 0 && (
            <p>🖐 Mains levées : {raisedHands.map((p) => p.displayName).join(', ')}</p>
          )}
          {pendingSpeakers.length > 0 && (
            <div className="room-speak-queue">
              <p>En attente de parole :</p>
              <ul>
                {pendingSpeakers.map((p) => (
                  <li key={p.userId}>
                    {p.displayName}
                    <button className="link-button" onClick={() => grantSpeak(p.userId)}>
                      Accorder la parole
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
                  Retirer la parole à {s.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="room-music">
        <h3>🎵 Musique d'adoration</h3>

        {nowPlaying && (
          <div className="room-music-player">
            <iframe
              width="100%"
              height="200"
              src={`https://www.youtube.com/embed/${nowPlaying.videoId}?autoplay=1`}
              title={nowPlaying.title || 'Musique d\'adoration'}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
            <button type="button" className="room-action" onClick={stopMusic}>
              ⏹ Arrêter pour tout le monde
            </button>
          </div>
        )}

        <p className="hint">
          Cherche un chant sur YouTube ou Spotify, puis colle son lien ci-dessous pour le jouer
          dans un petit lecteur ici même, diffusé à toute la salle.
        </p>
        <form className="room-music-form" onSubmit={submitMusicSearch}>
          <select value={musicPlatform} onChange={(event) => setMusicPlatform(event.target.value as MusicPlatform)}>
            <option value="youtube">YouTube</option>
            <option value="spotify">Spotify</option>
          </select>
          <input
            type="text"
            value={musicQuery}
            onChange={(event) => setMusicQuery(event.target.value)}
            placeholder="Ex. Hillsong, gospel congolais..."
          />
          <button type="submit">Rechercher →</button>
        </form>
        <div className="room-music-quick">
          {MUSIC_QUICK_PICKS.map((label) => (
            <button key={label} type="button" className="room-action" onClick={() => openMusicSearch(label)}>
              {label}
            </button>
          ))}
        </div>

        <form className="room-music-form room-music-link-form" onSubmit={playMusicLink}>
          <input
            type="text"
            value={musicLinkInput}
            onChange={(event) => setMusicLinkInput(event.target.value)}
            placeholder="Colle un lien YouTube trouvé ci-dessus..."
          />
          <button type="submit">▶ Jouer dans la salle</button>
        </form>
        {musicLinkError && <p className="error">{musicLinkError}</p>}
      </div>

      <div className="room-chat">
        <h3>Chat</h3>
        <div className="room-chat-list" ref={chatListRef}>
          {messages.length === 0 && <p className="room-chat-empty">Aucun message pour le moment.</p>}
          {messages.map((message) => (
            <div key={message.id} className="room-chat-message">
              <strong>{message.author_display_name ?? 'Anonyme'}</strong>
              <span>{message.content}</span>
            </div>
          ))}
        </div>

        {chatError && <p className="error room-chat-error">{chatError}</p>}

        {status === 'authenticated' ? (
          <form className="room-chat-form" onSubmit={sendChat}>
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Écrire un message..."
              maxLength={CHAT_MAX_LENGTH}
            />
            <button type="submit" disabled={!chatInput.trim()}>
              Envoyer
            </button>
          </form>
        ) : (
          <p className="hint">Connecte-toi pour écrire dans le chat.</p>
        )}
      </div>
    </div>
  );
}

export default PrayerRoomPage;
