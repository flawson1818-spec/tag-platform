import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorldMapSnapshot } from '../../lib/api';
import { approxCoordsForTimezone, projectOrthographic } from '../../lib/timezone-coordinates';

const ROTATION_SPEED_DEG_PER_SEC = 6;
const STATIC_ROTATION_DEG = -20;

/**
 * Coarse continent anchors (lat/lon + a silhouette size as a *fraction of the globe's radius*,
 * not an absolute pixel size, so the same data reads correctly at any rendered size) — several
 * small blobs per landmass rather than one big ellipse each, so continents read as a soft
 * textured shape instead of a single dominant circle. An impression of the world, not an atlas.
 */
const GLOBE_LANDMASSES = [
  { lat: 54, lon: 15, rx: 0.09, ry: 0.06 }, // Europe
  { lat: 44, lon: 32, rx: 0.06, ry: 0.05 },
  { lat: 15, lon: 20, rx: 0.13, ry: 0.14 }, // Afrique
  { lat: -10, lon: 25, rx: 0.09, ry: 0.11 },
  { lat: -30, lon: 24, rx: 0.06, ry: 0.05 },
  { lat: 55, lon: 70, rx: 0.15, ry: 0.1 }, // Asie
  { lat: 45, lon: 100, rx: 0.13, ry: 0.09 },
  { lat: 25, lon: 112, rx: 0.1, ry: 0.08 },
  { lat: 12, lon: 100, rx: 0.06, ry: 0.05 },
  { lat: 55, lon: -105, rx: 0.14, ry: 0.1 }, // Amérique du Nord
  { lat: 38, lon: -95, rx: 0.1, ry: 0.08 },
  { lat: 20, lon: -100, rx: 0.06, ry: 0.05 },
  { lat: -5, lon: -60, rx: 0.09, ry: 0.11 }, // Amérique du Sud
  { lat: -25, lon: -65, rx: 0.07, ry: 0.09 },
  { lat: -25, lon: 135, rx: 0.1, ry: 0.06 }, // Océanie
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
  const uid = useId();
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

  const sphereId = `${uid}-sphere`;
  const glowId = `${uid}-glow`;
  const vignetteId = `${uid}-vignette`;
  const clipId = `${uid}-clip`;

  return (
    <div className="rotating-globe-wrap" style={{ width: size, height: size }}>
      <svg
        className="rotating-globe"
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        role="img"
        aria-label={t('worldMap.mapAriaLabel')}
      >
        <defs>
          <radialGradient id={sphereId} cx="34%" cy="30%" r="80%">
            <stop offset="0%" stopColor="var(--color-globe-ocean-highlight)" />
            <stop offset="100%" stopColor="var(--color-globe-ocean-shadow)" />
          </radialGradient>
          <radialGradient id={vignetteId} cx="34%" cy="30%" r="72%">
            <stop offset="55%" stopColor="var(--color-globe-ocean-shadow)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-globe-ocean-shadow)" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(139, 150, 230, 0.85)" />
            <stop offset="45%" stopColor="rgba(139, 150, 230, 0.35)" />
            <stop offset="100%" stopColor="rgba(139, 150, 230, 0)" />
          </radialGradient>
          <clipPath id={clipId}>
            <circle r={radius} />
          </clipPath>
        </defs>

        <circle r={radius} fill={`url(#${sphereId})`} className="globe-ocean" />

        <g clipPath={`url(#${clipId})`}>
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
              rx={land.rx * radius * Math.max(0.3, land.depth)}
              ry={land.ry * radius * Math.max(0.3, land.depth)}
              className="globe-land"
              opacity={0.55 + 0.4 * land.depth}
            />
          ))}

          {points.map((p) => {
            const pointRadius = (3 + Math.sqrt(p.count / maxCount) * 8) * Math.max(0.4, p.depth);
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
        </g>

        <circle r={radius} fill={`url(#${vignetteId})`} />
      </svg>
    </div>
  );
}

export default RotatingGlobe;
