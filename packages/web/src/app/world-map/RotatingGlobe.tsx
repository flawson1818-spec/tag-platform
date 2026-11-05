import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WorldMapSnapshot } from '../../lib/api';
import { landCellCentres } from '../../lib/land-mask';
import { approxCoordsForTimezone } from '../../lib/timezone-coordinates';

/**
 * The globe of continuous prayer — Tour d'avant-garde, « Une prière s'élève à chaque instant ».
 *
 * Canvas-drawn, every frame:
 *  - a night-blue sphere lit from the upper left, with a golden atmosphere around its edge;
 *  - the real continents as a fine grid of silver points (Natural Earth land mask, 1.5°);
 *  - a warm light wherever people are praying right now, sized by how many, with a ring that
 *    breathes and sparks that rise from the surface — the prayer going up;
 *  - golden arcs linking the places where prayer is rising, one network of intercession, with
 *    a pulse of light travelling along each.
 * Only live data makes light: no prayer anywhere means no golden points, never decoration.
 * Drag to turn it; it keeps turning on its own. Honours prefers-reduced-motion (one still frame).
 */

const ROTATION_DEG_PER_SEC = 5;
const TILT_RAD = (-18 * Math.PI) / 180;
const DEG = Math.PI / 180;
/** Light from the upper left, slightly in front. */
const LIGHT = normalize([-0.55, 0.55, 0.62]);
const MAX_SPARKS = 160;
const MAX_ARCS = 14;

type Vec3 = [number, number, number];

interface PrayerLight {
  key: string;
  v: Vec3;
  weight: number; // 0..1, relative to the busiest place
  phase: number;
}

interface Spark {
  light: number; // index into lights
  t: number; // 0..1 life
  speed: number;
  drift: number;
}

function normalize(v: number[]): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function toVec(lat: number, lon: number): Vec3 {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
}

/** Rotate about the vertical axis by `rot`, then tilt toward the viewer. */
function view(v: Vec3, cosR: number, sinR: number): Vec3 {
  const x = v[0] * cosR + v[2] * sinR;
  const z0 = -v[0] * sinR + v[2] * cosR;
  const cosT = Math.cos(TILT_RAD);
  const sinT = Math.sin(TILT_RAD);
  const y = v[1] * cosT - z0 * sinT;
  const z = v[1] * sinT + z0 * cosT;
  return [x, y, z];
}

/** A point on the great circle between a and b, lifted above the surface in the middle. */
function arcPoint(a: Vec3, b: Vec3, t: number, lift: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const s = Math.sin(omega) || 1;
  const k1 = Math.sin((1 - t) * omega) / s;
  const k2 = Math.sin(t * omega) / s;
  const h = 1 + lift * Math.sin(Math.PI * t);
  return [(a[0] * k1 + b[0] * k2) * h, (a[1] * k1 + b[1] * k2) * h, (a[2] * k1 + b[2] * k2) * h];
}

let landVectors: Vec3[] | null = null;
function land(): Vec3[] {
  if (!landVectors) {
    // The grid's cells shrink toward the poles; keeping one in k along each parallel gives an
    // even spacing on the sphere (no moiré rings over Antarctica or the Arctic).
    landVectors = landCellCentres()
      .filter((c) => {
        const k = Math.max(1, Math.round(1 / Math.max(0.12, Math.cos(c.lat * DEG))));
        const column = Math.round((c.lon + 180) / 1.5 - 0.5);
        return column % k === 0;
      })
      .map((c) => toVec(c.lat, c.lon));
  }
  return landVectors;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function RotatingGlobe({ snapshot, size = 300 }: { snapshot: WorldMapSnapshot | null; size?: number }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightsRef = useRef<PrayerLight[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const rotationRef = useRef(-25 * DEG);
  const velocityRef = useRef(0);
  const dragRef = useRef<{ x: number; rotation: number; lastX: number; lastT: number } | null>(null);
  const drawRef = useRef<() => void>(() => undefined);

  // Live prayer → lights. Busiest places glow brightest; the order links them by arcs.
  useEffect(() => {
    const zones = snapshot?.timezones ?? [];
    const max = Math.max(1, ...zones.map((z) => z.count));
    lightsRef.current = zones
      .filter((z) => z.count > 0)
      .map((z, i) => {
        const { lat, lon } = approxCoordsForTimezone(z.timezone);
        return { key: z.timezone, v: toVec(lat, lon), weight: Math.sqrt(z.count / max), phase: (i * 0.37) % 1 };
      });
    sparksRef.current = sparksRef.current.filter((s) => s.light < lightsRef.current.length);
    drawRef.current();
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const W = canvas.width;
    const cx = W / 2;
    const cy = W / 2;
    const R = W * 0.4;
    const dot = Math.max(1, 1.15 * dpr * (size / 320));
    const points = land();
    const reduced = prefersReducedMotion();

    // Static layers, rendered once per size: atmosphere, sphere body, rim.
    const atmosphere = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.24);
    atmosphere.addColorStop(0, 'rgba(255, 222, 160, 0.85)');
    atmosphere.addColorStop(0.12, 'rgba(255, 196, 112, 0.5)');
    atmosphere.addColorStop(0.42, 'rgba(160, 175, 255, 0.2)');
    atmosphere.addColorStop(1, 'rgba(140, 160, 255, 0)');

    const body = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R);
    body.addColorStop(0, '#26305e');
    body.addColorStop(0.45, '#121839');
    body.addColorStop(1, '#04050f');

    const limb = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
    limb.addColorStop(0, 'rgba(0, 0, 0, 0)');
    limb.addColorStop(1, 'rgba(2, 3, 12, 0.65)');

    const sheen = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 0.9);
    sheen.addColorStop(0, 'rgba(200, 215, 255, 0.16)');
    sheen.addColorStop(1, 'rgba(200, 215, 255, 0)');

    let last = performance.now();
    let frame = 0;
    let running = true;
    let visible = true;

    const draw = (time = performance.now()) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      if (!reduced && !dragRef.current) {
        // Auto-rotation, plus whatever spin a drag left behind, easing back to the cruise speed.
        velocityRef.current *= 0.95;
        rotationRef.current += (ROTATION_DEG_PER_SEC * DEG + velocityRef.current) * dt;
      }
      const rot = rotationRef.current;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const clock = time / 1000;

      ctx.clearRect(0, 0, W, W);

      ctx.fillStyle = atmosphere;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Continents: silver points, brighter where the light falls, fading toward the edge.
      for (let i = 0; i < points.length; i++) {
        const p = view(points[i], cosR, sinR);
        if (p[2] <= 0.02) continue;
        const lit = Math.max(0, p[0] * LIGHT[0] + p[1] * LIGHT[1] + p[2] * LIGHT[2]);
        const alpha = (0.18 + 0.62 * lit) * Math.min(1, p[2] * 2.2);
        ctx.fillStyle = `rgba(${170 + 60 * lit | 0}, ${188 + 50 * lit | 0}, 255, ${alpha.toFixed(3)})`;
        const s = dot * (0.65 + 0.35 * p[2]);
        ctx.fillRect(cx + p[0] * R - s / 2, cy - p[1] * R - s / 2, s, s);
      }

      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      const lights = lightsRef.current;
      const projected = lights.map((l) => view(l.v, cosR, sinR));

      // Arcs between places of prayer: the network of intercession.
      ctx.lineCap = 'round';
      const arcCount = Math.min(MAX_ARCS, Math.max(0, lights.length - 1));
      for (let a = 0; a < arcCount; a++) {
        const from = lights[a];
        const to = lights[a + 1];
        const steps = 40;
        let prev: [number, number] | null = null;
        for (let s = 0; s <= steps; s++) {
          const q = view(arcPoint(from.v, to.v, s / steps, 0.22), cosR, sinR);
          const hidden = q[2] < 0 && Math.hypot(q[0], q[1]) < 1; // behind the sphere
          const point: [number, number] = [cx + q[0] * R, cy - q[1] * R];
          if (prev && !hidden) {
            ctx.strokeStyle = `rgba(255, 196, 120, ${(0.22 + 0.3 * Math.max(0, q[2])).toFixed(3)})`;
            ctx.lineWidth = 1.1 * dpr;
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(point[0], point[1]);
            ctx.stroke();
          }
          prev = hidden ? null : point;
        }
        // A pulse of light travelling along the arc.
        const pulseT = (clock * 0.28 + a * 0.19) % 1;
        const q = view(arcPoint(from.v, to.v, pulseT, 0.22), cosR, sinR);
        if (!(q[2] < 0 && Math.hypot(q[0], q[1]) < 1)) {
          const g = ctx.createRadialGradient(cx + q[0] * R, cy - q[1] * R, 0, cx + q[0] * R, cy - q[1] * R, 6 * dpr);
          g.addColorStop(0, 'rgba(255, 245, 220, 0.95)');
          g.addColorStop(1, 'rgba(255, 200, 120, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx + q[0] * R, cy - q[1] * R, 6 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Rising sparks: the prayer going up from each place.
      if (!reduced && lights.length > 0) {
        const sparks = sparksRef.current;
        const wanted = Math.min(MAX_SPARKS, 10 + lights.length * 8);
        while (sparks.length < wanted) {
          const light = Math.floor(Math.random() * lights.length);
          if (Math.random() > 0.35 + 0.65 * lights[light].weight) break;
          sparks.push({ light, t: 0, speed: 0.22 + Math.random() * 0.25, drift: (Math.random() - 0.5) * 0.5 });
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const spark = sparks[i];
          spark.t += spark.speed * dt;
          if (spark.t >= 1 || !lights[spark.light]) {
            sparks.splice(i, 1);
            continue;
          }
          const base = projected[spark.light];
          if (!base || base[2] <= 0.05) continue;
          // Out along the surface normal, as seen on screen, with a gentle sway.
          const out = 1 + spark.t * 0.42;
          const sway = Math.sin(spark.t * 6 + spark.drift * 10) * 0.03 * spark.t;
          const x = cx + (base[0] * out + sway) * R;
          const y = cy - (base[1] * out + spark.drift * 0.08 * spark.t) * R;
          const alpha = Math.sin(Math.PI * spark.t) * 0.85 * Math.min(1, base[2] * 2);
          ctx.fillStyle = `rgba(255, 228, 170, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, (1.6 - spark.t) * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // The lights themselves: glow, breathing ring, bright core.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lights.length; i++) {
        const p = projected[i];
        if (p[2] <= 0.02) continue;
        const l = lights[i];
        const x = cx + p[0] * R;
        const y = cy - p[1] * R;
        const depth = Math.min(1, p[2] * 1.8);
        const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((clock * 0.9 + l.phase) * Math.PI * 2);
        const glowR = (10 + 22 * l.weight) * dpr * (0.85 + 0.15 * breathe);

        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, `rgba(255, 214, 140, ${(0.9 * depth).toFixed(3)})`);
        glow.addColorStop(0.35, `rgba(255, 168, 70, ${(0.45 * depth).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255, 150, 50, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();

        if (!reduced) {
          const ringT = (clock * 0.45 + l.phase) % 1;
          ctx.strokeStyle = `rgba(255, 210, 150, ${((1 - ringT) * 0.6 * depth).toFixed(3)})`;
          ctx.lineWidth = 1.2 * dpr;
          ctx.beginPath();
          ctx.arc(x, y, glowR * (0.3 + ringT * 1.1), 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(255, 250, 235, ${depth.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, (1.6 + 2 * l.weight) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = limb;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // A fine golden rim, brightest on the lit side.
      const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rim.addColorStop(0, 'rgba(255, 226, 170, 0.85)');
      rim.addColorStop(0.5, 'rgba(255, 190, 120, 0.25)');
      rim.addColorStop(1, 'rgba(150, 170, 255, 0.35)');
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
    };

    drawRef.current = () => draw();
    const loop = (time: number) => {
      if (!running) return;
      if (visible && document.visibilityState === 'visible') draw(time);
      else last = time;
      frame = requestAnimationFrame(loop);
    };

    draw();
    if (!reduced) frame = requestAnimationFrame(loop);

    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    observer?.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      drawRef.current = () => undefined;
    };
  }, [size]);

  // Drag to turn the globe; release leaves a little spin that eases back to cruising speed.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, rotation: rotationRef.current, lastX: e.clientX, lastT: performance.now() };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const now = performance.now();
    rotationRef.current = drag.rotation + ((e.clientX - drag.x) / size) * Math.PI;
    const dt = Math.max(1, now - drag.lastT) / 1000;
    velocityRef.current = (((e.clientX - drag.lastX) / size) * Math.PI) / dt;
    drag.lastX = e.clientX;
    drag.lastT = now;
    if (prefersReducedMotion()) drawRef.current();
  };
  const onPointerUp = () => {
    dragRef.current = null;
    velocityRef.current = Math.max(-3, Math.min(3, velocityRef.current));
  };

  const places = snapshot?.timezones.filter((z) => z.count > 0).length ?? 0;

  return (
    <div className="rotating-globe-wrap" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        className="rotating-globe"
        style={{ width: size, height: size }}
        role="img"
        aria-label={t('worldMap.globeAriaLabel', { count: snapshot?.presence ?? 0, places })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

export default RotatingGlobe;
