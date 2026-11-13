import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Pilotage, pilotageApi } from '../../lib/api';

const PERIODS = [7, 30, 90];
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

/** Two series over the period, one axis, crosshair + tooltip; legend above, end labels. */
function SeriesChart({ series }: { series: Pilotage['series'] }) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 720;
  const H = 220;
  const pad = { l: 34, r: 70, t: 12, b: 26 };
  const max = Math.max(1, ...series.map((s) => Math.max(s.requests, s.answered)));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, series.length - 1);
  const y = (v: number) => H - pad.b - (v / niceMax) * (H - pad.t - pad.b);
  const path = (key: 'requests' | 'answered') => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(series.length / 6);
  const last = series.length - 1;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  const h = hover !== null ? series[hover] : null;

  return (
    <div className="pilot-chart">
      <div className="pilot-legend" aria-hidden="true">
        <span><i className="sw sw-1" /> {t('pilotage.series.requests')}</span>
        <span><i className="sw sw-2" /> {t('pilotage.series.answered')}</span>
      </div>
      <div className="pilot-chart-box">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t('pilotage.chartLabel')}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="pilot-grid" />
              <text x={pad.l - 6} y={y(v) + 4} className="pilot-tick" textAnchor="end">{v}</text>
            </g>
          ))}
          {series.map((s, i) =>
            i % labelEvery === 0 || i === last ? (
              <text key={s.day} x={x(i)} y={H - 6} className="pilot-tick" textAnchor="middle">
                {fmt(s.day)}
              </text>
            ) : null,
          )}
          <path d={path('requests')} className="pilot-line l-1" />
          <path d={path('answered')} className="pilot-line l-2" />
          <text x={x(last) + 8} y={y(series[last].requests) + 4} className="pilot-end">{t('pilotage.series.requestsShort')}</text>
          <text x={x(last) + 8} y={y(series[last].answered) + 4 + (Math.abs(y(series[last].answered) - y(series[last].requests)) < 12 ? 12 : 0)} className="pilot-end">
            {t('pilotage.series.answeredShort')}
          </text>
          {hover !== null && h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="pilot-cross" />
              <circle cx={x(hover)} cy={y(h.requests)} r={4.5} className="pilot-dot d-1" />
              <circle cx={x(hover)} cy={y(h.answered)} r={4.5} className="pilot-dot d-2" />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <div className="pilot-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <strong>{fmt(h.day)}</strong>
            <span><i className="sw sw-1" /> {t('pilotage.series.requests')} : {h.requests}</span>
            <span><i className="sw sw-2" /> {t('pilotage.series.answered')} : {h.answered}</span>
          </div>
        )}
      </div>
      <details className="pilot-table">
        <summary>{t('pilotage.showTable')}</summary>
        <table>
          <thead>
            <tr>
              <th>{t('pilotage.day')}</th>
              <th>{t('pilotage.series.requests')}</th>
              <th>{t('pilotage.series.answered')}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.day}>
                <td>{fmt(s.day)}</td>
                <td>{s.requests}</td>
                <td>{s.answered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * Pilotage (§5.10): is every request received, entrusted, carried, answered? Where do they come
 * from, how fast are they entrusted, how many testimonies come out of them — over 7, 30, 90 days.
 */
export function PilotagePanel() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Pilotage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    pilotageApi
      .get(token, days)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const sourceMax = useMemo(() => Math.max(1, ...(data?.sources.map((s) => s.count) ?? [1])), [data]);

  return (
    <section className="pilotage">
      <div className="pilot-head">
        <div>
          <h3>{t('pilotage.title')}</h3>
          <p className="hint">{t('pilotage.intro')}</p>
        </div>
        <div className="feed-filters" role="tablist" aria-label={t('pilotage.period')}>
          {PERIODS.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={days === p} className={days === p ? 'is-on' : ''} onClick={() => setDays(p)}>
              {t('pilotage.days', { count: p })}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="hint">{t('analytics.loading')}</p>}
      {data && (
        <>
          <div className="pilot-tiles">
            <div className="pilot-tile">
              <span className="pilot-value">{data.totals.requests}</span>
              <span className="pilot-label">{t('pilotage.tiles.requests')}</span>
            </div>
            <div className="pilot-tile">
              <span className="pilot-value">{pct(data.rates.assigned)}</span>
              <span className="pilot-label">{t('pilotage.tiles.assigned')}</span>
            </div>
            <div className="pilot-tile">
              <span className="pilot-value">{pct(data.rates.inCare)}</span>
              <span className="pilot-label">{t('pilotage.tiles.inCare')}</span>
            </div>
            <div className="pilot-tile">
              <span className="pilot-value">{pct(data.rates.answered)}</span>
              <span className="pilot-label">{t('pilotage.tiles.answered')}</span>
            </div>
            <div className="pilot-tile">
              <span className="pilot-value">{pct(data.rates.carriedInRoom)}</span>
              <span className="pilot-label">{t('pilotage.tiles.carriedInRoom')}</span>
            </div>
            <div className="pilot-tile">
              <span className="pilot-value">{data.medianHoursToAssign === null ? '—' : t('pilotage.hours', { count: data.medianHoursToAssign })}</span>
              <span className="pilot-label">{t('pilotage.tiles.delay')}</span>
            </div>
            <div className="pilot-tile">
              <span className="pilot-value">{pct(data.rates.testimoniesPublished)}</span>
              <span className="pilot-label">{t('pilotage.tiles.testimonies', { count: data.totals.testimonies })}</span>
            </div>
          </div>

          <h4>{t('pilotage.seriesTitle')}</h4>
          <SeriesChart series={data.series} />

          <div className="pilot-columns">
            <div>
              <h4>{t('pilotage.sourcesTitle')}</h4>
              <ul className="pilot-bars">
                {data.sources.map((s) => (
                  <li key={s.key}>
                    <span className="pilot-bar-label">{t(`pilotage.sources.${s.key}`)}</span>
                    <span className="pilot-bar-track">
                      <span className="pilot-bar" style={{ width: `${(s.count / sourceMax) * 100}%` }} />
                    </span>
                    <span className="pilot-bar-value">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{t('pilotage.lifeTitle')}</h4>
              <ul className="pilot-life">
                <li><span aria-hidden="true">🙏</span> {t('pilotage.life.prayers', { count: data.totals.prayers })}</li>
                <li><span aria-hidden="true">⛪</span> {t('pilotage.life.mobilizations', { count: data.totals.mobilizations })}</li>
                <li><span aria-hidden="true">🔥</span> {t('pilotage.life.faithActs', { count: data.totals.faithActs })}</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
