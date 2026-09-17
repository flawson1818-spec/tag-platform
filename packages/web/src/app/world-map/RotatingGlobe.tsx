import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorldMapSnapshot } from '../../lib/api';
import { approxCoordsForTimezone, projectOrthographic } from '../../lib/timezone-coordinates';

const ROTATION_SPEED_DEG_PER_SEC = 6;
const STATIC_ROTATION_DEG = -20;

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

/**
 * docs request (voice note, 2026-09-17): "un globe qui flotte dans l'espace sans contour" —
 * a real-feeling sphere with no drawn border, and *only* the places where prayer is actively
 * rising shown as points — no decorative country/city texture. The sphere itself carries all
 * the "planet" impression (lighting gradient + soft atmosphere glow from the CSS wrapper); the
 * orange points are reserved entirely for live prayer activity, so every point on the globe
 * means something.
 */
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
          <radialGradient id={sphereId} cx="32%" cy="28%" r="85%">
            <stop offset="0%" stopColor="var(--color-globe-space-1)" />
            <stop offset="55%" stopColor="var(--color-globe-space-2)" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <radialGradient id={vignetteId} cx="32%" cy="28%" r="75%">
            <stop offset="50%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.7" />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 186, 100, 0.95)" />
            <stop offset="40%" stopColor="rgba(255, 176, 84, 0.45)" />
            <stop offset="100%" stopColor="rgba(255, 176, 84, 0)" />
          </radialGradient>
          <clipPath id={clipId}>
            <circle r={radius} />
          </clipPath>
        </defs>

        <circle r={radius} fill={`url(#${sphereId})`} />

        <g clipPath={`url(#${clipId})`}>
          {activePoints.map((p) => {
            const pointRadius = (4 + Math.sqrt(p.count / maxCount) * 9) * Math.max(0.5, p.depth);
            return (
              <g key={p.timezone} className="worldmap-point-group">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={pointRadius * 2.6}
                  fill={`url(#${glowId})`}
                  className="worldmap-point-glow"
                  opacity={Math.max(0.5, p.depth)}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(2, pointRadius * 0.4)}
                  className="worldmap-point-core"
                  opacity={Math.max(0.6, p.depth)}
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
