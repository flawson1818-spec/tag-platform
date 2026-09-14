import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { DashboardSnapshot, EXPORT_SCOPES, ExportJob, analyticsApi } from '../../lib/api';

const ACCENT = '#45519c';
const ACCENT_SOFT = '#8b96e6';

function GrowthChart({ growth }: { growth: DashboardSnapshot['growth'] }) {
  const { t } = useTranslation();
  if (growth.length === 0) return <p className="hint">{t('analytics.noGrowthData')}</p>;

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
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-chart" role="img" aria-label={t('analytics.growthChartAriaLabel')}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="analytics-axis" />
        <path d={areaPath} fill={ACCENT_SOFT} opacity={0.18} stroke="none" />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <circle key={p.day} cx={p.x} cy={p.y} r={3} fill={ACCENT}>
            <title>{t('analytics.newAccountTooltip', { day: p.day, count: p.newUsers })}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function PeakHoursChart({ peakHours }: { peakHours: DashboardSnapshot['peakHours'] }) {
  const { t } = useTranslation();
  if (peakHours.length === 0) return <p className="hint">{t('analytics.noAttendanceData')}</p>;

  const width = 640;
  const height = 160;
  const padding = 24;
  const byHour = new Map(peakHours.map((h) => [h.hourOfDay, h.attendanceCount]));
  const max = Math.max(1, ...peakHours.map((h) => h.attendanceCount));
  const barWidth = (width - padding * 2) / 24;

  return (
    <div className="analytics-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-chart" role="img" aria-label={t('analytics.attendanceChartAriaLabel')}>
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
              <title>{t('analytics.attendanceTooltip', { hour, count })}</title>
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
  const { t } = useTranslation();
  if (topCategories.length === 0) return <p className="hint">{t('analytics.noTopics')}</p>;

  const max = Math.max(1, ...topCategories.map((c) => c.requestCount));

  return (
    <div className="worldmap-timezones">
      {topCategories.map((c) => (
        <div key={c.category} className="worldmap-tz-row">
          <span className="worldmap-tz-name">{t(`prayerCategories.${c.category}`, c.category)}</span>
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
  const { t } = useTranslation();
  return (
    <div className="worldmap-kpis">
      {retention.map((r) => (
        <div key={r.period} className="worldmap-kpi">
          <div className="worldmap-kpi-value">{r.retentionRate !== null ? `${r.retentionRate}%` : '—'}</div>
          <div className="worldmap-kpi-label">
            {t('analytics.retentionLabel', { period: r.period, retained: r.retainedUsers, eligible: r.eligibleUsers })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportPanel({ token }: { token: string }) {
  const { t } = useTranslation();
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
            {t(`exportScopes.${s}`, s)}
          </option>
        ))}
      </select>
      <button onClick={handleExport} disabled={requesting}>
        {requesting ? t('analytics.generating') : t('analytics.export')}
      </button>
      {job?.download_url && (
        <a href={job.download_url} target="_blank" rel="noreferrer">
          {t('analytics.downloadExport', { scope: t(`exportScopes.${job.scope}`, job.scope) })}
        </a>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function AnalyticsDashboardPage() {
  const { t } = useTranslation();
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

  if (!getAccessToken()) return <p className="hint">{t('analytics.needLogin')}</p>;
  if (loading) return <p>{t('analytics.loading')}</p>;
  if (error) return <p className="error">{error}</p>;
  if (!snapshot) return null;

  const token = getAccessToken() as string;

  return (
    <div className="worldmap-page">
      <h2>{t('analytics.title')}</h2>
      <p className="hint">{t('analytics.intro')}</p>

      <h3>{t('analytics.retentionTitle')}</h3>
      <RetentionTiles retention={snapshot.retention} />

      <h3>{t('analytics.newAccountsTitle')}</h3>
      <GrowthChart growth={snapshot.growth} />

      <h3>{t('analytics.peakHoursTitle')}</h3>
      <PeakHoursChart peakHours={snapshot.peakHours} />

      <h3>{t('analytics.topCategoriesTitle')}</h3>
      <TopCategories topCategories={snapshot.topCategories} />

      <h3>{t('analytics.exportTitle')}</h3>
      <p className="hint">{t('analytics.exportIntro')}</p>
      <ExportPanel token={token} />
    </div>
  );
}

export default AnalyticsDashboardPage;
