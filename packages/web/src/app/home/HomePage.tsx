import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActivePrayerSlot,
  EVENT_TYPE_LABELS,
  PublicTestimony,
  TagEvent,
  WorldMapSnapshot,
  analyticsApi,
  eventsApi,
  prayerApi,
  testimoniesApi,
} from '../../lib/api';
import { formatRemaining } from '../../lib/format';

const UPCOMING_EVENT_STATUSES = new Set(['SCHEDULED', 'OPEN', 'RUNNING']);

const MEDIA_TYPE_ICONS: Record<string, string> = { TEXT: '📝', PHOTO: '📷', AUDIO: '🎧', VIDEO: '🎬' };

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function testimonyExcerpt(testimony: PublicTestimony): string {
  if (testimony.content) return testimony.content;
  return `Témoignage ${(testimony.media_type ?? 'TEXT').toLowerCase()} partagé sur TAG.`;
}

export function HomePage() {
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
          {roomLive ? '● EN DIRECT' : "La salle s'apprête à s'ouvrir"}
        </span>
        <h2>Tour de prière mondiale 24h/24</h2>
        {roomLive && slot ? (
          <p className="home-hero-subject">
            Sujet actuel : <strong>{slot.title}</strong> · ⏱ {formatRemaining(remainingSeconds)}
          </p>
        ) : (
          <p className="hint">
            Aucun créneau n'est en cours pour l'instant — rejoins la salle pour être prêt·e dès
            qu'elle démarre.
          </p>
        )}
        <Link to="/room" className="home-hero-cta">
          Rejoindre la prière →
        </Link>
        <p className="hint">Aucune inscription requise pour écouter.</p>
      </section>

      {snapshot && (
        <section className="worldmap-kpis home-kpis">
          <div className="worldmap-kpi">
            <div className="worldmap-kpi-value">{snapshot.presence}</div>
            <div className="worldmap-kpi-label">en prière en ce moment</div>
          </div>
          <div className="worldmap-kpi">
            <div className="worldmap-kpi-value">{snapshot.activeRooms}</div>
            <div className="worldmap-kpi-label">
              salle{snapshot.activeRooms > 1 ? 's' : ''} active{snapshot.activeRooms > 1 ? 's' : ''}
            </div>
          </div>
          <div className="worldmap-kpi">
            <div className="worldmap-kpi-value">{snapshot.timezones.length}</div>
            <div className="worldmap-kpi-label">
              fuseau{snapshot.timezones.length > 1 ? 'x' : ''} horaire{snapshot.timezones.length > 1 ? 's' : ''}
            </div>
          </div>
          <Link to="/world-map" className="home-kpis-link">
            Voir la carte mondiale →
          </Link>
        </section>
      )}

      <div className="home-columns">
        <section>
          <h3>Prochains événements</h3>
          {events.length === 0 && <p className="hint">Aucun événement à venir pour l'instant.</p>}
          <ul className="request-list">
            {events.map((event) => (
              <li key={event.id} className="request-row">
                <div className="request-meta">
                  <span className="chip">{EVENT_TYPE_LABELS[event.type] ?? event.type}</span>
                  <span className="hint">{formatSchedule(event.scheduled_at)}</span>
                </div>
                <p>
                  <strong>{event.title}</strong>
                </p>
              </li>
            ))}
          </ul>
          <Link to="/events" className="link-button">
            Voir tous les événements →
          </Link>
        </section>

        <section>
          <h3>Témoignages récents</h3>
          {testimonies.length === 0 && <p className="hint">Aucun témoignage publié pour l'instant.</p>}
          <ul className="request-list">
            {testimonies.map((testimony) => (
              <li key={testimony.id} className="request-row">
                <p>
                  {MEDIA_TYPE_ICONS[testimony.media_type] ?? '📝'} {testimonyExcerpt(testimony)}
                </p>
              </li>
            ))}
          </ul>
          <Link to="/testimonies" className="link-button">
            Voir tous les témoignages →
          </Link>
        </section>
      </div>
    </div>
  );
}

export default HomePage;
