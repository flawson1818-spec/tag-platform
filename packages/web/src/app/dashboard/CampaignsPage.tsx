import { FormEvent, useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { CAMPAIGN_STATUSES, Campaign, campaignsApi } from '../../lib/api';
import { Pagination } from '../Pagination';

export function CampaignsPage() {
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
      setCreateError('Connecte-toi pour créer une campagne.');
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
      <h2>Campagnes de prière</h2>
      <p className="hint">
        Périodes de prière ciblées (jeûnes, veillées, semaines thématiques…). La création est
        réservée aux comptes disposant de la permission <code>campaign.manage</code>.
      </p>

      <form onSubmit={handleCreate} className="request-form">
        <input
          type="text"
          placeholder="Titre de la campagne"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button type="submit" disabled={creating}>
          {creating ? 'Création…' : 'Créer la campagne'}
        </button>
      </form>
      {createError && <p className="error">{createError}</p>}

      {loading && <p>Chargement…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {campaigns.map((c) => (
          <li key={c.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{c.status}</span>
              {c.start_date && <span className="hint">Du {c.start_date}</span>}
              {c.end_date && <span className="hint">au {c.end_date}</span>}
            </div>
            <p>
              <strong>{c.title}</strong>
            </p>
            <div className="request-form">
              {CAMPAIGN_STATUSES.filter((s) => s !== c.status).map((s) => (
                <button key={s} onClick={() => handleStatusChange(c.id, s)}>
                  {s}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!loading && campaigns.length === 0 && !error && <p className="hint">Aucune campagne pour l'instant.</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default CampaignsPage;
