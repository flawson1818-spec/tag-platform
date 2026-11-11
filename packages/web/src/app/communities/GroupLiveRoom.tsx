import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { WS_URL } from '../../lib/api';

export const LIVE_KINDS = ['TRAINING', 'INFORMATION', 'PREACHING', 'WORSHIP', 'PRAYER'] as const;
export const LIVE_ICONS: Record<string, string> = { TRAINING: '🎓', INFORMATION: '📢', PREACHING: '🎙️', WORSHIP: '🎵', PRAYER: '🙏' };
const REACTIONS = ['🙏', '❤️', '🙌', '🔥', '👏', '✝️'];

interface LiveSession {
  title: string;
  kind: string;
  host: { id: string; name: string };
  startedAt: string;
  video: { embedUrl?: string; joinUrl?: string; link: string } | null;
  music: { embedUrl: string; provider: 'youtube' | 'spotify'; title: string } | null;
}
interface ChatEntry {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: string;
}
type Person = { userId: string; name: string };

function elapsed(since: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/**
 * The group's own live room: a leader gathers the members online for a training, some news, a
 * preaching or a time of worship — with a live video (or a video-call link), worship music for
 * everyone, and the members taking part: chat, reactions, raised hands.
 */
export function GroupLiveRoom({ communityId, isMember, onLiveChange }: { communityId: string; isMember: boolean; onLiveChange?: (live: boolean) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [canHost, setCanHost] = useState(false);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [hands, setHands] = useState<Person[]>([]);
  const [presence, setPresence] = useState<{ count: number; names: string[] }>({ count: 0, names: [] });
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [form, setForm] = useState({ title: '', kind: 'TRAINING', videoUrl: '', newVisio: false });
  const [editing, setEditing] = useState(false);
  const [musicLink, setMusicLink] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const onLive = useRef(onLiveChange);
  useEffect(() => {
    onLive.current = onLiveChange;
  }, [onLiveChange]);

  useEffect(() => {
    if (!isMember) return;
    const socket = io(`${WS_URL}/live`, { transports: ['websocket'], query: { token: getAccessToken() ?? '' } });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('live:join', { communityId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('live:state', (p: { session: LiveSession | null; chat: ChatEntry[]; hands: Person[]; canHost: boolean }) => {
      setSession(p.session);
      setChat(p.chat);
      setHands(p.hands);
      setCanHost(p.canHost);
      onLive.current?.(Boolean(p.session));
    });
    socket.on('live:session', (p: { session: LiveSession | null }) => {
      setSession(p.session);
      onLive.current?.(Boolean(p.session));
    });
    socket.on('live:chat', (p: { message: ChatEntry }) => setChat((prev) => [...prev, p.message].slice(-100)));
    socket.on('live:hands', (p: { hands: Person[] }) => setHands(p.hands));
    socket.on('live:presence', (p: { count: number; names: string[] }) => setPresence(p));
    socket.on('live:error', (p: { message: string }) => setError(p.message));
    socket.on('live:reaction', (p: { emoji: string }) => {
      const id = Date.now() + Math.random();
      setReactions((prev) => [...prev, { id, emoji: p.emoji }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 2200);
    });
    return () => {
      socket.emit('live:leave', { communityId });
      socket.disconnect();
    };
  }, [communityId, isMember]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [chat]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const emit = (event: string, data: Record<string, unknown> = {}) => socketRef.current?.emit(event, { communityId, ...data });

  const start = (e: FormEvent) => {
    e.preventDefault();
    emit('live:start', {
      title: form.title,
      kind: form.kind,
      videoUrl: form.newVisio ? undefined : form.videoUrl.trim() || undefined,
      newVisio: form.newVisio,
      keepVideo: editing && !form.videoUrl.trim() && !form.newVisio,
    });
    setEditing(false);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    emit('live:chat', { text: draft });
    setDraft('');
  };

  if (!isMember) {
    return (
      <div className="social-empty group-locked">
        <p>
          <span aria-hidden="true">🔒</span> {t('live.joinToEnter')}
        </p>
      </div>
    );
  }

  const myHand = Boolean(user && hands.some((h) => h.userId === user.id));
  const showForm = canHost && (!session || editing);

  return (
    <div className="live-room">
      {error && <p className="error">{error}</p>}
      {!connected && <p className="hint">{t('live.connecting')}</p>}

      {showForm && (
        <form className="live-form" onSubmit={start}>
          <h3>{session ? t('live.editTitle') : t('live.startTitle')}</h3>
          <p className="hint">{t('live.startHint')}</p>
          <div className="groups-type-picker" role="radiogroup" aria-label={t('live.kindLabel')}>
            {LIVE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                className={form.kind === k ? 'is-on' : ''}
                onClick={() => setForm({ ...form, kind: k })}
              >
                <span aria-hidden="true">{LIVE_ICONS[k]}</span> {t(`live.kinds.${k}`)}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={form.title}
            maxLength={150}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('live.titlePlaceholder')}
            aria-label={t('live.titlePlaceholder')}
            required
          />
          <input
            type="url"
            value={form.videoUrl}
            onChange={(e) => setForm({ ...form, videoUrl: e.target.value, newVisio: false })}
            placeholder={t('live.videoPlaceholder')}
            aria-label={t('live.videoPlaceholder')}
            disabled={form.newVisio}
          />
          <label className="live-visio-option">
            <input type="checkbox" checked={form.newVisio} onChange={(e) => setForm({ ...form, newVisio: e.target.checked, videoUrl: '' })} />
            {t('live.newVisio')}
          </label>
          <div className="groups-create-actions">
            <button type="submit" disabled={!form.title.trim()}>
              {session ? t('live.update') : <><span aria-hidden="true">🔴</span> {t('live.start')}</>}
            </button>
            {editing && (
              <button type="button" className="link-button" onClick={() => setEditing(false)}>
                {t('composer.cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {!session && !canHost && (
        <div className="social-empty live-waiting">
          <p className="live-waiting-icon" aria-hidden="true">📡</p>
          <p>
            <strong>{t('live.noneTitle')}</strong>
          </p>
          <p className="hint">{t('live.noneHint')}</p>
        </div>
      )}

      {session && (
        <div className="live-stage">
          <div className="live-main">
            <div className="live-head">
              <span className="live-dot">{t('live.onAir')}</span>
              <span className="chip">
                <span aria-hidden="true">{LIVE_ICONS[session.kind] ?? '📢'}</span> {t(`live.kinds.${session.kind}`, session.kind)}
              </span>
              <span className="hint">
                {t('live.hostedBy', { name: session.host.name })} · {elapsed(session.startedAt, now)} ·{' '}
                {t('live.present', { count: presence.count })}
              </span>
            </div>
            <h3 className="live-title">{session.title}</h3>

            {session.video?.embedUrl && (
              <div className="live-video">
                <iframe
                  src={session.video.embedUrl}
                  title={session.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            )}
            {session.video?.joinUrl && (
              <a className="live-join-visio" href={session.video.joinUrl} target="_blank" rel="noopener noreferrer">
                <span aria-hidden="true">🎥</span> {t('live.joinVisio')}
              </a>
            )}
            {!session.video && <p className="hint live-audio-only">{t('live.noVideo')}</p>}

            {session.music && (
              <div className="live-music">
                <p className="hint">
                  <span aria-hidden="true">🎵</span> {session.music.title}
                </p>
                <iframe
                  src={session.music.embedUrl}
                  title={session.music.title}
                  height={session.music.provider === 'spotify' ? 152 : 200}
                  allow="autoplay; encrypted-media; clipboard-write"
                />
              </div>
            )}

            <div className="live-reactions" aria-live="polite">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => emit('live:react', { emoji })} aria-label={t('live.react', { emoji })}>
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
              <button type="button" className={`live-hand${myHand ? ' is-on' : ''}`} onClick={() => emit('live:hand')} aria-pressed={myHand}>
                <span aria-hidden="true">✋</span> {myHand ? t('live.lowerHand') : t('live.raiseHand')}
              </button>
              <div className="live-floating">
                {reactions.map((r) => (
                  <span key={r.id} aria-hidden="true">
                    {r.emoji}
                  </span>
                ))}
              </div>
            </div>

            {canHost && (
              <div className="live-host-tools">
                <form
                  className="live-music-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    emit('live:music', { link: musicLink.trim(), title: t('live.worship') });
                    setMusicLink('');
                  }}
                >
                  <input
                    type="url"
                    value={musicLink}
                    onChange={(e) => setMusicLink(e.target.value)}
                    placeholder={t('live.musicPlaceholder')}
                    aria-label={t('live.musicPlaceholder')}
                  />
                  <button type="submit" disabled={!musicLink.trim()}>
                    <span aria-hidden="true">🎵</span> {t('live.playMusic')}
                  </button>
                  {session.music && (
                    <button type="button" className="link-button" onClick={() => emit('live:music', { link: '' })}>
                      {t('live.stopMusic')}
                    </button>
                  )}
                </form>
                <div className="live-host-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setForm({ title: session.title, kind: session.kind, videoUrl: '', newVisio: false });
                      setEditing(true);
                    }}
                  >
                    {t('live.edit')}
                  </button>
                  <button
                    type="button"
                    className="live-end"
                    onClick={() => {
                      if (window.confirm(t('live.endConfirm'))) emit('live:end');
                    }}
                  >
                    {t('live.end')}
                  </button>
                </div>
                {hands.length > 0 && (
                  <div className="live-hands">
                    <strong>
                      <span aria-hidden="true">✋</span> {t('live.handsTitle', { count: hands.length })}
                    </strong>
                    <ul>
                      {hands.map((h) => (
                        <li key={h.userId}>
                          {h.name}
                          <button type="button" className="link-button" onClick={() => emit('live:hand', { userId: h.userId })}>
                            {t('live.answered')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="live-chat">
            <h4>{t('live.chatTitle')}</h4>
            <div className="live-chat-list" ref={chatRef}>
              {chat.length === 0 && <p className="hint">{t('live.chatEmpty')}</p>}
              {chat.map((m) => (
                <p key={m.id} className={m.userId === user?.id ? 'is-mine' : ''}>
                  <Link to={`/membres/${m.userId}`}>{m.name}</Link> {m.text}
                </p>
              ))}
            </div>
            <form className="live-chat-form" onSubmit={send}>
              <input
                type="text"
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('live.chatPlaceholder')}
                aria-label={t('live.chatPlaceholder')}
              />
              <button type="submit" disabled={!draft.trim()}>
                {t('posts.send')}
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
