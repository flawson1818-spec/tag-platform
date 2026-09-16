import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorldMapSnapshot } from '../../lib/api';
import { approxCoordsForTimezone, projectOrthographic } from '../../lib/timezone-coordinates';

const ROTATION_SPEED_DEG_PER_SEC = 6;
const STATIC_ROTATION_DEG = -20;

// Coarse continent anchors (lat/lon + a rough silhouette size) — an impression of the world's
// landmasses on the sphere, not a precise atlas, consistent with the flat map's own convention.
const GLOBE_LANDMASSES = [
  { lat: 48, lon: 15, rx: 42, ry: 24 }, // Europe
  { lat: 5, lon: 20, rx: 46, ry: 50 }, // Africa
  { lat: -22, lon: 133, rx: 38, ry: 24 }, // Australie / Océanie
  { lat: 38, lon: 95, rx: 62, ry: 42 }, // Asie
  { lat: 42, lon: -95, rx: 46, ry: 34 }, // Amérique du Nord
  { lat: -15, lon: -60, rx: 28, ry: 44 }, // Amérique du Sud
];

const GRATICULE_LATITUDES = [-60, -30, 0, 30, 60];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function RotatingGlobe({ snapshot, size = 300 }: { snapshot: WorldMapSnapshot | null; size?: number }) {
  const { t } = useTranslation();
  const glowId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const [rotation, setRotation] = useState(STATIC_ROTATION_DEG);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (reducedMotion) return undefined;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaSec = (now - last) / 1000;
      last = now;
      setRotation((r) => (r + ROTATION_SPEED_DEG_PER_SEC * deltaSec) % 360);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [reducedMotion]);

  const radius = size / 2 - 6;
  const timezones = snapshot?.timezones ?? [];
  const maxCount = Math.max(1, ...timezones.map((tz) => tz.count));

  const points = timezones
    .map((tz) => {
      const { lat, lon } = approxCoordsForTimezone(tz.timezone);
      const projected = projectOrthographic(lat, lon, rotation, radius);
      return { ...tz, ...projected };
    })
    .filter((p) => p.visible);

  const landmasses = GLOBE_LANDMASSES.map((land, index) => {
    const projected = projectOrthographic(land.lat, land.lon, rotation, radius);
    return { ...land, ...projected, key: index };
  }).filter((land) => land.visible);

  return (
    <div className="rotating-globe-wrap" style={{ width: size, height: size }}>
      <svg
        className="rotating-globe"
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        role="img"
        aria-label={t('worldMap.mapAriaLabel')}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(139, 150, 230, 0.85)" />
            <stop offset="45%" stopColor="rgba(139, 150, 230, 0.35)" />
            <stop offset="100%" stopColor="rgba(139, 150, 230, 0)" />
          </radialGradient>
          <radialGradient id={`${glowId}-sphere`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="var(--color-map-sky-2)" />
            <stop offset="100%" stopColor="var(--color-map-sky-1)" />
          </radialGradient>
        </defs>

        <circle r={radius} fill={`url(#${glowId}-sphere)`} stroke="var(--color-map-sky-border)" strokeWidth={1.5} />

        {GRATICULE_LATITUDES.map((lat) => {
          const phi = (lat * Math.PI) / 180;
          const y = -radius * Math.sin(phi);
          const rx = radius * Math.cos(phi);
          return <ellipse key={lat} cx={0} cy={y} rx={rx} ry={Math.max(1, rx * 0.05)} className="globe-graticule" />;
        })}

        {landmasses.map((land) => (
          <ellipse
            key={land.key}
            cx={land.x}
            cy={land.y}
            rx={land.rx * Math.max(0.25, land.depth)}
            ry={land.ry * Math.max(0.25, land.depth)}
            className="globe-land"
            opacity={0.5 + 0.4 * land.depth}
          />
        ))}

        {points.map((p) => {
          const pointRadius = (4 + Math.sqrt(p.count / maxCount) * 10) * Math.max(0.35, p.depth);
          return (
            <g key={p.timezone} className="worldmap-point-group">
              <circle
                cx={p.x}
                cy={p.y}
                r={pointRadius * 2.2}
                fill={`url(#${glowId})`}
                className="worldmap-point-glow"
                opacity={Math.max(0.3, p.depth)}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={Math.max(1.5, pointRadius * 0.35)}
                className="worldmap-point-core"
                opacity={Math.max(0.4, p.depth)}
              />
              <title>{t('worldMap.pointTooltip', { timezone: p.timezone, count: p.count })}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default RotatingGlobe;
