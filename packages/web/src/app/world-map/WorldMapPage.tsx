import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorldMapSnapshot, analyticsApi } from '../../lib/api';
import { RotatingGlobe } from './RotatingGlobe';

const REFRESH_MS = 5000;

export function WorldMapPage() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<WorldMapSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshot = () => {
      analyticsApi
        .worldMap()
        .then((res) => {
          setSnapshot(res);
          setError(null);
        })
        .catch((err) => setError((err as Error).message))
        .finally(() => setLoading(false));
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>{t('events.loading')}</p>;
  if (error) return <p className="error">{error}</p>;
  if (!snapshot) return null;

  const maxCount = Math.max(1, ...snapshot.timezones.map((tz) => tz.count));

  return (
    <div className="worldmap-page">
      <h2>{t('worldMap.title')}</h2>
      <p className="hint">{t('worldMap.description')}</p>

      <div className="worldmap-halo-wrap">
        <div className="worldmap-halo" />
        <div className="worldmap-presence">
          <div className="worldmap-presence-value">{snapshot.presence}</div>
          <div className="worldmap-presence-label">
            {snapshot.presence > 0 ? t('worldMap.presenceActive') : t('worldMap.presenceEmpty')}
          </div>
        </div>
      </div>

      <div className="worldmap-kpis">
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
          <div className="worldmap-kpi-label">{t('home.eventsInProgress', { count: snapshot.activeEvents })}</div>
        </div>
      </div>

      <RotatingGlobe snapshot={snapshot} size={340} />
      {snapshot.timezones.length === 0 && <p className="hint">{t('worldMap.roomOpening')}</p>}

      {snapshot.timezones.length > 0 && (
        <div className="worldmap-timezones">
          {snapshot.timezones.map((tz) => (
            <div key={tz.timezone} className="worldmap-tz-row">
              <span className="worldmap-tz-name">{tz.timezone}</span>
              <span className="worldmap-tz-track">
                <span
                  className="worldmap-tz-fill"
                  style={{ width: `${(tz.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="worldmap-tz-count">{tz.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorldMapPage;
