import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import {
  ActivePrayerSlot,
  FeedPost,
  PrayerRequest,
  TagEvent,
  eventsApi,
  prayerApi,
  prayerRequestsApi,
  socialApi,
} from '../../lib/api';
import { formatRemaining } from '../../lib/format';
import { splitVerse } from '../../lib/creneau-parser';
import { useUnreadMessages } from '../social/useUnreadMessages';
import { Avatar, formatWhen } from '../social/SocialPostCard';
import { WatchtowerMark } from '../WatchtowerMark';

const UPCOMING = new Set(['SCHEDULED', 'OPEN', 'RUNNING']);

function excerpt(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** A signed-in member's home: the prayer happening now first, then their people and what to carry. */
export function MemberHomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const unread = useUnreadMessages(true);
  const [slot, setSlot] = useState<ActivePrayerSlot | null>(null);
  const [roomChecked, setRoomChecked] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [entrusted, setEntrusted] = useState<PrayerRequest[]>([]);
  const [events, setEvents] = useState<TagEvent[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    prayerApi
      .active('world')
      .then((active) => {
        setSlot(active);
        setRemaining(active.remainingSeconds);
      })
      .catch(() => setSlot(null))
      .finally(() => setRoomChecked(true));
    if (token) {
      socialApi
        .feed(token, 1)
        .then((res) => setPosts(res.data.slice(0, 3)))
        .catch(() => undefined);
      // A member follows their own requests; an intercessor also sees the ones entrusted to them.
      prayerRequestsApi
        .listMine(token)
        .then((res) => setRequests(res.data.slice(0, 3)))
        .catch(() => undefined);
      prayerRequestsApi
        .listAssignedToMe(token)
        .then((res) => setEntrusted(res.data.filter((r) => r.status !== 'ANSWERED' && r.status !== 'ARCHIVED').slice(0, 3)))
        .catch(() => undefined);
    }
    eventsApi
      .list(1)
      .then((res) =>
        setEvents(
          res.data
            .filter((e) => UPCOMING.has(e.status))
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            .slice(0, 2),
        ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!slot) return;
    const timer = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [slot]);

  const verse = slot?.bible_references?.[0] ? splitVerse(slot.bible_references[0]) : null;
  const firstName = (user?.display_name ?? '').split(' ')[0];

  return (
    <div className="member-home">
      <section className="mh-now">
        <div className="mh-now-head">
          <WatchtowerMark size={36} />
          <div>
            <p className="mh-greeting">{t('memberHome.greeting', { name: firstName })}</p>
            <p className="mh-sub">{t('memberHome.sub')}</p>
          </div>
        </div>

        {slot ? (
          <div className="mh-live">
            <span className="live-badge">{t('home.live')}</span>
            <h2>{slot.title}</h2>
            {slot.guided_text && <p className="mh-prayer">{excerpt(slot.guided_text, 220)}</p>}
            {verse && (
              <blockquote className="mh-verse">
                {verse.text && <span>« {excerpt(verse.text, 180)} »</span>} <cite>{verse.reference}</cite>
              </blockquote>
            )}
            <div className="mh-live-foot">
              <Link to="/room" className="home-hero-cta">
                {t('memberHome.join')}
              </Link>
              <span className="mh-remaining">⏱ {formatRemaining(remaining)}</span>
            </div>
          </div>
        ) : (
          roomChecked && (
            <div className="mh-live">
              <h2>{t('memberHome.waitingTitle')}</h2>
              <p className="mh-prayer">{t('memberHome.waitingText')}</p>
              <div className="mh-live-foot">
                <Link to="/room" className="home-hero-cta">
                  {t('memberHome.openRoom')}
                </Link>
              </div>
            </div>
          )
        )}
      </section>

      <div className="mh-shortcuts">
        <Link to="/messages" className="mh-shortcut">
          <span aria-hidden="true">✉️</span>
          <strong>{t('nav.messages')}</strong>
          <span className="hint">{unread > 0 ? t('memberHome.unread', { count: unread }) : t('memberHome.noUnread')}</span>
        </Link>
        <Link to="/communaute" className="mh-shortcut">
          <span aria-hidden="true">📷</span>
          <strong>{t('memberHome.share')}</strong>
          <span className="hint">{t('memberHome.shareHint')}</span>
        </Link>
        <Link to="/prayer-requests" className="mh-shortcut">
          <span aria-hidden="true">🙏</span>
          <strong>{t('memberHome.ask')}</strong>
          <span className="hint">{t('memberHome.askHint')}</span>
        </Link>
      </div>

      <div className="mh-columns">
        <section className="mh-block">
          <div className="mh-block-head">
            <h3>{entrusted.length > 0 ? t('memberHome.entrusted') : t('memberHome.myRequests')}</h3>
            <Link to="/prayer-requests">{t('memberHome.seeAll')}</Link>
          </div>
          {(entrusted.length > 0 ? entrusted : requests).length === 0 ? (
            <p className="hint">
              {t('memberHome.noMyRequests')} <Link to="/prayer-requests">{t('memberHome.ask')}</Link>
            </p>
          ) : (
            <ul className="mh-list">
              {(entrusted.length > 0 ? entrusted : requests).map((r) => (
                <li key={r.id}>
                  <span className="chip">{t(`prayerCategories.${r.category}`, r.category)}</span>{' '}
                  <span className="chip chip-status">{t(`requestStatuses.${r.status}`, r.status)}</span>
                  <p>{excerpt(r.description)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mh-block">
          <div className="mh-block-head">
            <h3>{t('memberHome.family')}</h3>
            <Link to="/communaute">{t('memberHome.seeAll')}</Link>
          </div>
          {posts.length === 0 ? (
            <p className="hint">{t('memberHome.noPosts')}</p>
          ) : (
            <ul className="mh-list">
              {posts.map((p) => (
                <li key={p.id} className="mh-post">
                  <Avatar name={p.author.displayName} url={p.author.avatarUrl} size={32} />
                  <div>
                    <strong>{p.author.displayName}</strong>
                    <span className="hint"> · {formatWhen(p.createdAt, i18n.language)}</span>
                    {p.content && <p>{excerpt(p.content, 120)}</p>}
                  </div>
                  {p.photos[0] && <img src={p.photos[0]} alt="" className="mh-post-photo" loading="lazy" />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {events.length > 0 && (
        <section className="mh-block">
          <div className="mh-block-head">
            <h3>{t('home.upcomingEvents')}</h3>
            <Link to="/events">{t('memberHome.seeAll')}</Link>
          </div>
          <ul className="mh-list">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong>
                <span className="hint">
                  {' '}
                  ·{' '}
                  {new Date(e.scheduled_at).toLocaleString(i18n.language, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
