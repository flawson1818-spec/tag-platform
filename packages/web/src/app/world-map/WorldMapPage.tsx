import { useEffect, useState } from 'react';
import { WorldMapSnapshot, analyticsApi } from '../../lib/api';
import { approxCoordsForTimezone, projectCoords } from '../../lib/timezone-coordinates';

const REFRESH_MS = 5000;
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

// Continents esquissés en formes douces — une impression du monde, pas un
// atlas précis. Chaque masse est composée d'ellipses superposées.
const CONTINENTS = [
  { cx: 195, cy: 110, rx: 140, ry: 75 },
  { cx: 230, cy: 195, rx: 45, ry: 25 },
  { cx: 330, cy: 250, rx: 70, ry: 45 },
  { cx: 310, cy: 350, rx: 40, ry: 55 },
  { cx: 535, cy: 100, rx: 65, ry: 45 },
  { cx: 530, cy: 190, rx: 75, ry: 50 },
  { cx: 520, cy: 300, rx: 50, ry: 70 },
  { cx: 800, cy: 140, rx: 190, ry: 100 },
  { cx: 850, cy: 230, rx: 70, ry: 40 },
  { cx: 870, cy: 325, rx: 60, ry: 35 },
];

export function WorldMapPage() {
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

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!snapshot) return null;

  const maxCount = Math.max(1, ...snapshot.timezones.map((t) => t.count));
  const points = snapshot.timezones.map((tz) => {
    const { lat, lon } = approxCoordsForTimezone(tz.timezone);
    const { x, y } = projectCoords(lat, lon, MAP_WIDTH, MAP_HEIGHT);
    const radius = 9 + Math.sqrt(tz.count / maxCount) * 22;
    return { ...tz, x, y, radius };
  });

  return (
    <div className="worldmap-page">
      <h2>Carte mondiale</h2>
      <p className="hint">
        Une première esquisse du monde où la prière s'élève — chaque lueur représente un fuseau
        horaire, jamais une position individuelle (les données par pays demanderont un champ
        supplémentaire, pas encore présent dans les profils).
      </p>

      <div className="worldmap-halo-wrap">
        <div className="worldmap-halo" />
        <div className="worldmap-presence">
          <div className="worldmap-presence-value">{snapshot.presence}</div>
          <div className="worldmap-presence-label">
            {snapshot.presence > 0 ? 'personnes en prière en ce moment' : "la salle s'apprête à s'ouvrir"}
          </div>
        </div>
      </div>

      <div className="worldmap-kpis">
        <div className="worldmap-kpi">
          <div className="worldmap-kpi-value">{snapshot.activeRooms}</div>
          <div className="worldmap-kpi-label">Salle{snapshot.activeRooms > 1 ? 's' : ''} active{snapshot.activeRooms > 1 ? 's' : ''}</div>
        </div>
        <div className="worldmap-kpi">
          <div className="worldmap-kpi-value">{snapshot.timezones.length}</div>
          <div className="worldmap-kpi-label">Fuseau{snapshot.timezones.length > 1 ? 'x' : ''} horaire{snapshot.timezones.length > 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="worldmap-globe-wrap">
        <svg
          className="worldmap-globe"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label="Carte du monde présentant, par lueurs douces, les fuseaux horaires où des personnes prient"
        >
          <defs>
            <radialGradient id="worldmap-point-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(139, 150, 230, 0.85)" />
              <stop offset="45%" stopColor="rgba(139, 150, 230, 0.35)" />
              <stop offset="100%" stopColor="rgba(139, 150, 230, 0)" />
            </radialGradient>
          </defs>

          {CONTINENTS.map((c, i) => (
            <ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} className="worldmap-land" />
          ))}

          {points.length === 0 && (
            <text x={MAP_WIDTH / 2} y={MAP_HEIGHT / 2} textAnchor="middle" className="worldmap-empty-text">
              La salle s'apprête à s'ouvrir…
            </text>
          )}

          {points.map((p, i) => (
            <g
              key={p.timezone}
              className="worldmap-point-group"
              style={{ animationDelay: `${(i % 6) * 0.7}s` }}
            >
              <circle cx={p.x} cy={p.y} r={p.radius} fill="url(#worldmap-point-glow)" className="worldmap-point-glow" />
              <circle cx={p.x} cy={p.y} r={3} className="worldmap-point-core" />
              <title>{`${p.timezone} — ${p.count} personne${p.count > 1 ? 's' : ''}`}</title>
            </g>
          ))}
        </svg>
      </div>

      {points.length > 0 && (
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
