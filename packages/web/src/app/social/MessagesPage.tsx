import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { ConversationSummary, DirectMessage, messagesApi, WS_URL } from '../../lib/api';
import { Avatar, formatWhen } from './SocialPostCard';

/** Tells the header badge to refresh its unread count. */
export function notifyMessagesChanged(): void {
  window.dispatchEvent(new Event('tag:messages-changed'));
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Private messages: the list of my conversations, and the open one, updated live. */
export function MessagesPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [current, setCurrent] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentIdRef = useRef<string | undefined>(id);
  useEffect(() => {
    currentIdRef.current = id;
  }, [id]);

  const loadConversations = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    messagesApi
      .conversations(token)
      .then(setConversations)
      .catch((err) => {
        setConversations([]);
        setError((err as Error).message);
      });
  }, []);

  useEffect(loadConversations, [loadConversations]);

  // Open conversation: header, last 50 messages, mark as read.
  useEffect(() => {
    const token = getAccessToken();
    if (!token || !id) return;
    Promise.all([messagesApi.conversation(token, id), messagesApi.messages(token, id)])
      .then(([conv, msgs]) => {
        setError(null);
        setCurrent(conv);
        setMessages(msgs);
        setHasOlder(msgs.length >= 50);
        if (conv.unread > 0) {
          messagesApi.markRead(token, id).then(() => {
            setConversations((prev) => prev?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) ?? prev);
            notifyMessagesChanged();
          });
        }
      })
      .catch((err) => setError((err as Error).message));
  }, [id]);

  // Live delivery.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = io(`${WS_URL}/messages`, { transports: ['websocket'], query: { token } });
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('dm:message', ({ message }: { message: DirectMessage }) => {
      if (message.conversationId === currentIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        if (message.senderId !== user?.id) {
          const tk = getAccessToken();
          if (tk) void messagesApi.markRead(tk, message.conversationId).catch(() => undefined);
        }
      }
      loadConversations();
      notifyMessagesChanged();
    });
    socket.on('dm:read', () => {
      loadConversations();
      notifyMessagesChanged();
    });
    return () => {
      socket.disconnect();
    };
  }, [loadConversations, user?.id]);

  // Without the live connection (blocked network, proxy…), check for new messages every 15 s.
  useEffect(() => {
    if (live || !id) return;
    const timer = window.setInterval(() => {
      const token = getAccessToken();
      if (!token) return;
      messagesApi
        .messages(token, id)
        .then((latest) => {
          setMessages((prev) => {
            const fresh = latest.filter((m) => !prev.some((p) => p.id === m.id));
            if (fresh.length === 0) return prev;
            if (fresh.some((m) => m.senderId !== user?.id)) {
              void messagesApi.markRead(token, id).then(notifyMessagesChanged).catch(() => undefined);
            }
            return [...prev, ...fresh];
          });
        })
        .catch(() => undefined);
      loadConversations();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [live, id, loadConversations, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, id]);

  const loadOlder = async () => {
    const token = getAccessToken();
    if (!token || !id || messages.length === 0) return;
    const older = await messagesApi.messages(token, id, messages[0].createdAt);
    setHasOlder(older.length >= 50);
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const token = getAccessToken();
    const text = draft.trim();
    if (!token || !id || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await messagesApi.send(token, id, text);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setDraft('');
      loadConversations();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const toggleBlock = async () => {
    const token = getAccessToken();
    if (!token || !current) return;
    const next = !current.blockedByMe;
    if (next && !window.confirm(t('messages.blockConfirm', { name: current.peer.displayName }))) return;
    try {
      await messagesApi.block(token, current.peer.id, next);
      const refreshed = await messagesApi.conversation(token, current.id);
      setCurrent(refreshed);
      loadConversations();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Until the newly opened conversation has loaded, don't show the previous one.
  const shown = current && current.id === id ? current : null;
  const shownMessages = shown ? messages.filter((m) => m.conversationId === shown.id) : [];

  return (
    <section className={`dm-page${id ? ' has-thread' : ''}`}>
      <aside className="dm-list">
        <div className="dm-list-head">
          <h2>{t('messages.title')}</h2>
          <span className={`dm-live${live ? ' is-on' : ''}`} title={live ? t('messages.live') : t('messages.offline')} />
        </div>
        {conversations === null && <p className="hint">{t('posts.loading')}</p>}
        {conversations?.length === 0 && <p className="hint dm-empty">{t('messages.emptyInbox')}</p>}
        <ul>
          {conversations?.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`} className={`dm-item${c.id === id ? ' is-active' : ''}${c.unread ? ' is-unread' : ''}`}>
                <Avatar name={c.peer.displayName} url={c.peer.avatarUrl} size={42} />
                <span className="dm-item-text">
                  <span className="dm-item-top">
                    <strong>{c.peer.displayName}</strong>
                    {c.lastMessage && <span className="hint">{formatWhen(c.lastMessage.createdAt, i18n.language)}</span>}
                  </span>
                  <span className="dm-preview">
                    {c.lastMessage ? `${c.lastMessage.mine ? `${t('messages.you')} : ` : ''}${c.lastMessage.content}` : ''}
                  </span>
                </span>
                {c.unread > 0 && <span className="dm-badge">{c.unread}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <div className="dm-thread">
        {!id && <p className="dm-placeholder">{t('messages.pick')}</p>}
        {id && !shown && !error && <p className="hint dm-placeholder">{t('posts.loading')}</p>}
        {id && shown && (
          <>
            <div className="dm-thread-head">
              <button type="button" className="link-button dm-back" onClick={() => navigate('/messages')} aria-label={t('messages.back')}>
                ←
              </button>
              <Link to={`/membres/${shown.peer.id}`} className="social-author">
                <Avatar name={shown.peer.displayName} url={shown.peer.avatarUrl} size={36} />
                <strong>{shown.peer.displayName}</strong>
              </Link>
              <button type="button" className="link-button dm-block" onClick={toggleBlock}>
                {shown.blockedByMe ? t('messages.unblock') : t('messages.block')}
              </button>
            </div>

            <div className="dm-messages" aria-live="polite">
              {hasOlder && (
                <button type="button" className="link-button dm-older" onClick={loadOlder}>
                  {t('messages.older')}
                </button>
              )}
              {shownMessages.length === 0 && <p className="hint dm-placeholder">{t('messages.firstMessage', { name: shown.peer.displayName })}</p>}
              {shownMessages.map((m, i) => {
                const mine = m.senderId === user?.id;
                const newDay = i === 0 || !sameDay(shownMessages[i - 1].createdAt, m.createdAt);
                return (
                  <div key={m.id}>
                    {newDay && (
                      <p className="dm-day">
                        {new Date(m.createdAt).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    )}
                    <div className={`dm-bubble${mine ? ' is-mine' : ''}`}>
                      <span>{m.content}</span>
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {shown.blocked ? (
              <p className="dm-blocked">{shown.blockedByMe ? t('messages.youBlocked') : t('messages.cannotWrite')}</p>
            ) : (
              <form className="dm-composer" onSubmit={send}>
                <textarea
                  value={draft}
                  rows={1}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('messages.placeholder')}
                  aria-label={t('messages.placeholder')}
                />
                <button type="submit" disabled={sending || !draft.trim()}>
                  {t('posts.send')}
                </button>
              </form>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}

/** "Envoyer un message" on a member's profile. */
export function MessageMemberButton({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const conv = await messagesApi.open(token, memberId);
      navigate(`/messages/${conv.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <button type="button" onClick={open}>
        <span aria-hidden="true">✉️</span> {t('messages.write')}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
