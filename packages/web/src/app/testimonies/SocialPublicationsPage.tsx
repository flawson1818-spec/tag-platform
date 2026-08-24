import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { SocialPublication, socialPublicationsApi } from '../../lib/api';
import { Pagination } from '../Pagination';

export function SocialPublicationsPage() {
  const token = getAccessToken();
  const [drafts, setDrafts] = useState<SocialPublication[]>([]);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = () => {
    const currentToken = getAccessToken();
    if (!currentToken) return;
    setLoading(true);
    socialPublicationsApi
      .list(currentToken, 'DRAFT', page)
      .then((res) => {
        setDrafts(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (!token) return;
    setActingId(id);
    try {
      await (action === 'approve' ? socialPublicationsApi.approve(token, id) : socialPublicationsApi.reject(token, id));
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  if (!token) return <p className="hint">Connecte-toi pour voir les brouillons de publication.</p>;
  if (loading) return <p>Chargement…</p>;

  return (
    <div className="testimonies-page">
      <h2>Brouillons de publication</h2>
      <p className="hint">
        Générés automatiquement par l'IA Communication à chaque témoignage approuvé — un brouillon par
        réseau, toujours soumis à validation humaine avant envoi.
      </p>
      {error && <p className="error">{error}</p>}

      {drafts.length === 0 && <p className="hint">Aucun brouillon en attente.</p>}
      <ul className="request-list">
        {drafts.map((d) => (
          <li key={d.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{d.channel}</span>
            </div>
            <p>{d.draft_content}</p>
            <div className="reject-row">
              <button disabled={actingId === d.id} onClick={() => act(d.id, 'approve')}>
                Approuver
              </button>
              <button type="button" disabled={actingId === d.id} onClick={() => act(d.id, 'reject')}>
                Rejeter
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default SocialPublicationsPage;
