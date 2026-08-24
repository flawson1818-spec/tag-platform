import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { DashboardSnapshot, EXPORT_SCOPES, ExportJob, analyticsApi } from '../../lib/api';

const ACCENT = '#45519c';
const ACCENT_SOFT = '#8b96e6';

function GrowthChart({ growth }: { growth: DashboardSnapshot['growth'] }) {
  if (growth.length === 0) return <p className="hint">Pas encore de données de croissance.</p>;

  const width = 640;
  const height = 160;
  const padding = 24;
  const max = Math.max(1, ...growth.map((d) => d.newUsers));
  const stepX = (width - padding * 2) / Math.max(1, growth.length - 1);
  const points = growth.map((d, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (d.newUsers / max) * (height - padding * 2);
    return { x, y, ...d };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="analytics-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-chart" role="img" aria-label="Nouveaux comptes par jour sur 30 jours">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="analytics-axis" />
        <path d={areaPath} fill={ACCENT_SOFT} opacity={0.18} stroke="none" />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <circle key={p.day} cx={p.x} cy={p.y} r={3} fill={ACCENT}>
            <title>{`${p.day} — ${p.newUsers} nouveau(x) compte(s)`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function PeakHoursChart({ peakHours }: { peakHours: DashboardSnapshot['peakHours'] }) {
  if (peakHours.length === 0) return <p className="hint">Pas encore de données de fréquentation.</p>;

  const width = 640;
  const height = 160;
  const padding = 24;
  const byHour = new Map(peakHours.map((h) => [h.hourOfDay, h.attendanceCount]));
  const max = Math.max(1, ...peakHours.map((h) => h.attendanceCount));
  const barWidth = (width - padding * 2) / 24;

  return (
    <div className="analytics-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-chart" role="img" aria-label="Fréquentation par heure de la journée">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="analytics-axis" />
        {Array.from({ length: 24 }, (_, hour) => {
          const count = byHour.get(hour) ?? 0;
          const barHeight = (count / max) * (height - padding * 2);
          const x = padding + hour * barWidth;
          const y = height - padding - barHeight;
          return (
            <rect
              key={hour}
              x={x + 1}
              y={y}
              width={Math.max(1, barWidth - 2)}
              height={barHeight}
              rx={2}
              fill={ACCENT_SOFT}
            >
              <title>{`${hour}h — ${count} présence(s)`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="analytics-chart-labels">
        <span>0h</span>
        <span>12h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

function TopCategories({ topCategories }: { topCategories: DashboardSnapshot['topCategories'] }) {
  if (topCategories.length === 0) return <p className="hint">Pas encore de sujets de prière.</p>;

  const max = Math.max(1, ...topCategories.map((c) => c.requestCount));

  return (
    <div className="worldmap-timezones">
      {topCategories.map((c) => (
        <div key={c.category} className="worldmap-tz-row">
          <span className="worldmap-tz-name">{c.category}</span>
          <span className="worldmap-tz-track">
            <span className="worldmap-tz-fill" style={{ width: `${(c.requestCount / max) * 100}%` }} />
          </span>
          <span className="worldmap-tz-count">{c.requestCount}</span>
        </div>
      ))}
    </div>
  );
}

function RetentionTiles({ retention }: { retention: DashboardSnapshot['retention'] }) {
  return (
    <div className="worldmap-kpis">
      {retention.map((r) => (
        <div key={r.period} className="worldmap-kpi">
          <div className="worldmap-kpi-value">{r.retentionRate !== null ? `${r.retentionRate}%` : '—'}</div>
          <div className="worldmap-kpi-label">
            Rétention {r.period} ({r.retainedUsers}/{r.eligibleUsers})
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportPanel({ token }: { token: string }) {
  const [scope, setScope] = useState<string>(EXPORT_SCOPES[0]);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    setError(null);
    setRequesting(true);
    analyticsApi
      .requestExport(token, scope)
      .then(setJob)
      .catch((err) => setError((err as Error).message))
      .finally(() => setRequesting(false));
  };

  return (
    <div className="request-form">
      <select value={scope} onChange={(e) => setScope(e.target.value)}>
        {EXPORT_SCOPES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button onClick={handleExport} disabled={requesting}>
        {requesting ? 'Génération…' : 'Exporter'}
      </button>
      {job?.download_url && (
        <a href={job.download_url} target="_blank" rel="noreferrer">
          Télécharger l'export {job.scope}
        </a>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function AnalyticsDashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    analyticsApi
      .dashboard(token)
      .then(setSnapshot)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (!getAccessToken()) return <p className="hint">Connecte-toi pour voir le tableau de bord.</p>;
  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!snapshot) return null;

  const token = getAccessToken() as string;

  return (
    <div className="worldmap-page">
      <h2>Tableau de bord</h2>
      <p className="hint">Statistiques agrégées — croissance, fréquentation, sujets de prière, rétention.</p>

      <h3>Rétention</h3>
      <RetentionTiles retention={snapshot.retention} />

      <h3>Nouveaux comptes (30 derniers jours)</h3>
      <GrowthChart growth={snapshot.growth} />

      <h3>Heures de pointe</h3>
      <PeakHoursChart peakHours={snapshot.peakHours} />

      <h3>Sujets de prière les plus fréquents</h3>
      <TopCategories topCategories={snapshot.topCategories} />

      <h3>Export</h3>
      <p className="hint">Génère un export JSON téléchargeable (lien valable 24h).</p>
      <ExportPanel token={token} />
    </div>
  );
}

export default AnalyticsDashboardPage;
