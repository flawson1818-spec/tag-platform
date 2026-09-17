import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorldMapSnapshot } from '../../lib/api';
import { approxCoordsForTimezone, projectOrthographic } from '../../lib/timezone-coordinates';

const ROTATION_SPEED_DEG_PER_SEC = 6;
const STATIC_ROTATION_DEG = -20;

/** Small, deterministic PRNG (mulberry32) — the country-point scatter must stay identical across
 * every re-render (rotation changes state every frame), so it's generated once at module load
 * from a fixed seed rather than with Math.random(). */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LandRegion {
  lat: number;
  lon: number;
  latSpread: number;
  lonSpread: number;
  count: number;
}

// Coarse continent anchors — an impression of where nations are, not an atlas. Each region seeds
// a scatter of small "country" light points rather than a filled silhouette.
const GLOBE_REGIONS: LandRegion[] = [
  { lat: 50, lon: 15, latSpread: 12, lonSpread: 22, count: 10 }, // Europe
  { lat: 2, lon: 20, latSpread: 32, lonSpread: 22, count: 22 }, // Afrique
  { lat: 42, lon: 90, latSpread: 26, lonSpread: 55, count: 26 }, // Asie
  { lat: 45, lon: -100, latSpread: 20, lonSpread: 30, count: 18 }, // Amérique du Nord
  { lat: -15, lon: -60, latSpread: 26, lonSpread: 18, count: 16 }, // Amérique du Sud
  { lat: -25, lon: 135, latSpread: 12, lonSpread: 18, count: 8 }, // Océanie
];

const random = mulberry32(1786429256);

const COUNTRY_POINTS = GLOBE_REGIONS.flatMap((region, regionIndex) =>
  Array.from({ length: region.count }, (_, i) => {
    // Sum of two uniforms gives a softer, center-weighted falloff than a flat random spread.
    const jitterLat = (random() + random() - 1) * region.latSpread;
    const jitterLon = (random() + random() - 1) * region.lonSpread;
    return {
      key: `${regionIndex}-${i}`,
      lat: Math.max(-85, Math.min(85, region.lat + jitterLat)),
      lon: region.lon + jitterLon,
      size: 0.55 + random() * 0.5,
    };
  }),
);

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

  const activePoints = timezones
    .map((tz) => {
      const { lat, lon } = approxCoordsForTimezone(tz.timezone);
      const projected = projectOrthographic(lat, lon, rotation, radius);
      return { ...tz, ...projected };
    })
    .filter((p) => p.visible);

  const countryPoints = COUNTRY_POINTS.map((p) => ({
    ...p,
    ...projectOrthographic(p.lat, p.lon, rotation, radius),
  })).filter((p) => p.visible);

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
            <stop offset="0%" stopColor="var(--color-globe-space-1)" />
            <stop offset="100%" stopColor="var(--color-globe-space-2)" />
          </radialGradient>
          <radialGradient id={vignetteId} cx="34%" cy="30%" r="72%">
            <stop offset="55%" stopColor="var(--color-globe-space-2)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-globe-space-2)" stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 176, 84, 0.85)" />
            <stop offset="45%" stopColor="rgba(255, 176, 84, 0.35)" />
            <stop offset="100%" stopColor="rgba(255, 176, 84, 0)" />
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

          {countryPoints.map((p) => (
            <circle
              key={p.key}
              cx={p.x}
              cy={p.y}
              r={Math.max(0.6, p.size * (radius / 130)) * Math.max(0.3, p.depth)}
              className="globe-country-point"
              opacity={0.35 + 0.55 * p.depth}
            />
          ))}

          {activePoints.map((p) => {
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
