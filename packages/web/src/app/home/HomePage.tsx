import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';
import {
  ActivePrayerSlot,
  PublicTestimony,
  TagEvent,
  WorldMapSnapshot,
  analyticsApi,
  eventsApi,
  prayerApi,
  testimoniesApi,
} from '../../lib/api';
import { formatRemaining } from '../../lib/format';
import { RotatingGlobe } from '../world-map/RotatingGlobe';

const UPCOMING_EVENT_STATUSES = new Set(['SCHEDULED', 'OPEN', 'RUNNING']);

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function testimonyExcerpt(testimony: PublicTestimony, t: (key: string, opts?: object) => string): string {
  if (testimony.content) return testimony.content;
  const type = t(`home.mediaType.${testimony.media_type ?? 'TEXT'}`);
  return t('home.testimonyExcerpt', { type });
}

export function HomePage() {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<ActivePrayerSlot | null>(null);
  const [roomLive, setRoomLive] = useState(false);
  const [snapshot, setSnapshot] = useState<WorldMapSnapshot | null>(null);
  const [events, setEvents] = useState<TagEvent[]>([]);
  const [testimonies, setTestimonies] = useState<PublicTestimony[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    prayerApi
      .active('world')
      .then((active) => {
        setSlot(active);
        setRemainingSeconds(active.remainingSeconds);
        setRoomLive(true);
      })
      .catch(() => setRoomLive(false));

    analyticsApi.worldMap().then(setSnapshot).catch(() => undefined);

    eventsApi
      .list(1)
      .then((res) =>
        setEvents(
          res.data
            .filter((e) => UPCOMING_EVENT_STATUSES.has(e.status))
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            .slice(0, 2),
        ),
      )
      .catch(() => undefined);

    testimoniesApi.listRecentPublic(2).then(setTestimonies).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!roomLive) return;
    const interval = setInterval(() => setRemainingSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [roomLive]);

  return (
    <div className="home-page">
      <section className="home-hero">
        <span className={roomLive ? 'live-badge' : 'home-hero-paused'}>
          {roomLive ? t('home.live') : t('home.paused')}
        </span>
        <h2>{t('home.title')}</h2>
        {roomLive && slot ? (
          <p className="home-hero-subject">
            {t('home.currentSubject')} <strong>{slot.title}</strong> · ⏱ {formatRemaining(remainingSeconds)}
          </p>
        ) : (
          <p className="hint">{t('home.noSlot')}</p>
        )}
        <Link to="/room" className="home-hero-cta">
          {t('home.joinCta')}
        </Link>
        <p className="hint">{t('home.noSignup')}</p>
      </section>

      {snapshot && (
        <section className="home-globe-section">
          <RotatingGlobe snapshot={snapshot} size={180} />
          <p className="home-presence-line">
            <strong>{snapshot.presence}</strong> {t('home.presenceLabel')}
          </p>
          <Link to="/world-map" className="home-kpis-link">
            {t('home.viewMap')}
          </Link>
        </section>
      )}

      <div className="home-columns">
        <section>
          <h3>{t('home.upcomingEvents')}</h3>
          {events.length === 0 && <p className="hint">{t('home.noUpcomingEvents')}</p>}
          <ul className="home-teaser-list">
            {events.map((event) => (
              <li key={event.id} className="home-teaser-item">
                <strong>{event.title}</strong>
                <span className="hint"> · {formatSchedule(event.scheduled_at)}</span>
              </li>
            ))}
          </ul>
          <Link to="/events" className="link-button">
            {t('home.viewAllEvents')}
          </Link>
        </section>

        <section>
          <h3>{t('home.recentTestimonies')}</h3>
          {testimonies.length === 0 && <p className="hint">{t('home.noTestimonies')}</p>}
          <ul className="home-teaser-list">
            {testimonies.map((testimony) => (
              <li key={testimony.id} className="home-teaser-item">
                {testimonyExcerpt(testimony, t)}
              </li>
            ))}
          </ul>
          <Link to="/testimonies" className="link-button">
            {t('home.viewAllTestimonies')}
          </Link>
        </section>
      </div>
    </div>
  );
}

export default HomePage;
