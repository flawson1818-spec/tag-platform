import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '../auth/AuthContext';
import { COMMUNITY_TYPES, Community, communitiesApi } from '../../lib/api';
import { Pagination } from '../Pagination';

export function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [listError, setListError] = useState<string | null>(() =>
    getAccessToken() ? null : 'Connecte-toi pour voir les communautés.',
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [type, setType] = useState<string>(COMMUNITY_TYPES[0]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    communitiesApi
      .list(token, page)
      .then((res) => {
        setCommunities(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setListError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setCreateError(null);
    setCreating(true);
    try {
      await communitiesApi.create(token, { type, name });
      setName('');
      if (page === 1) refresh();
      else setPage(1);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="communities-page">
      <h2>Communautés</h2>
      <p className="hint">
        Groupes, équipes, cellules, églises… La création est réservée aux Responsables d'équipe et au-dessus.
      </p>

      <form onSubmit={handleCreate} className="request-form">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {COMMUNITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Nom de la communauté"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" disabled={creating}>
          {creating ? 'Création…' : 'Créer la communauté'}
        </button>
      </form>
      {createError && <p className="error">{createError}</p>}

      {loading && <p>Chargement…</p>}
      {listError && <p className="error">{listError}</p>}

      <ul className="request-list">
        {communities.map((c) => (
          <li key={c.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{c.type}</span>
            </div>
            <p>
              <Link to={`/communities/${c.id}`}>{c.name}</Link>
            </p>
          </li>
        ))}
      </ul>
      {!loading && communities.length === 0 && !listError && <p className="hint">Aucune communauté pour l'instant.</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default CommunitiesPage;
