import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { CAMPAIGN_STATUSES, Campaign, campaignsApi } from '../../lib/api';
import { Pagination } from '../Pagination';

export function CampaignsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    campaignsApi
      .list(page)
      .then((res) => {
        setCampaigns(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setCreateError(t('campaigns.needLoginCreate'));
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await campaignsApi.create(token, {
        title,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setTitle('');
      setStartDate('');
      setEndDate('');
      if (page === 1) refresh();
      else setPage(1);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    const token = getAccessToken();
    if (!token) return;
    campaignsApi
      .updateStatus(token, id, status)
      .then(refresh)
      .catch((err) => setCreateError((err as Error).message));
  };

  return (
    <div className="communities-page">
      <h2>{t('campaigns.title')}</h2>
      <p className="hint">
        {t('campaigns.intro')} <code>campaign.manage</code>.
      </p>

      <form onSubmit={handleCreate} className="request-form">
        <input
          type="text"
          placeholder={t('campaigns.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button type="submit" disabled={creating}>
          {creating ? t('campaigns.creating') : t('campaigns.create')}
        </button>
      </form>
      {createError && <p className="error">{createError}</p>}

      {loading && <p>{t('campaigns.loading')}</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {campaigns.map((c) => (
          <li key={c.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`campaignStatuses.${c.status}`, c.status)}</span>
              {c.start_date && <span className="hint">{t('campaigns.fromDate', { date: c.start_date })}</span>}
              {c.end_date && <span className="hint">{t('campaigns.toDate', { date: c.end_date })}</span>}
            </div>
            <p>
              <strong>{c.title}</strong>
            </p>
            <div className="request-form">
              {CAMPAIGN_STATUSES.filter((s) => s !== c.status).map((s) => (
                <button key={s} onClick={() => handleStatusChange(c.id, s)}>
                  {t(`campaignStatuses.${s}`, s)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!loading && campaigns.length === 0 && !error && <p className="hint">{t('campaigns.noCampaigns')}</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default CampaignsPage;
