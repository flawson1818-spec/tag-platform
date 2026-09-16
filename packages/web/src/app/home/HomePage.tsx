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

const MEDIA_TYPE_ICONS: Record<string, string> = { TEXT: '📝', PHOTO: '📷', AUDIO: '🎧', VIDEO: '🎬' };

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
            .slice(0, 3),
        ),
      )
      .catch(() => undefined);

    testimoniesApi.listRecentPublic(4).then(setTestimonies).catch(() => undefined);
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
        <>
          <RotatingGlobe snapshot={snapshot} size={180} />
          <section className="worldmap-kpis home-kpis">
            <div className="worldmap-kpi">
              <div className="worldmap-kpi-value">{snapshot.presence}</div>
              <div className="worldmap-kpi-label">{t('home.presenceLabel')}</div>
            </div>
            <div className="worldmap-kpi">
              <div className="worldmap-kpi-value">{snapshot.activeRooms}</div>
              <div className="worldmap-kpi-label">{t('home.activeRooms', { count: snapshot.activeRooms })}</div>
            </div>
            <div className="worldmap-kpi">
              <div className="worldmap-kpi-value">{snapshot.timezones.length}</div>
              <div className="worldmap-kpi-label">{t('home.timezones', { count: snapshot.timezones.length })}</div>
            </div>
            <div className="worldmap-kpi">
              <div className="worldmap-kpi-value">{snapshot.activeEvents}</div>
              <div className="worldmap-kpi-label">
                {t('home.eventsInProgress', { count: snapshot.activeEvents })}
              </div>
            </div>
            <Link to="/world-map" className="home-kpis-link">
              {t('home.viewMap')}
            </Link>
          </section>
        </>
      )}

      <div className="home-columns">
        <section>
          <h3>{t('home.upcomingEvents')}</h3>
          {events.length === 0 && <p className="hint">{t('home.noUpcomingEvents')}</p>}
          <ul className="request-list">
            {events.map((event) => (
              <li key={event.id} className="request-row">
                <div className="request-meta">
                  <span className="chip">{t(`eventTypes.${event.type}`, event.type)}</span>
                  <span className="hint">{formatSchedule(event.scheduled_at)}</span>
                </div>
                <p>
                  <strong>{event.title}</strong>
                </p>
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
          <ul className="request-list">
            {testimonies.map((testimony) => (
              <li key={testimony.id} className="request-row">
                <p>
                  {MEDIA_TYPE_ICONS[testimony.media_type] ?? '📝'} {testimonyExcerpt(testimony, t)}
                </p>
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
