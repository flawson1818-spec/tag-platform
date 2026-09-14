import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { COMMUNITY_TYPES, Community, JOIN_POLICIES, communitiesApi } from '../../lib/api';
import { Pagination } from '../Pagination';
import i18n from '../../i18n/config';

export function CommunitiesPage() {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [listError, setListError] = useState<string | null>(() =>
    getAccessToken() ? null : i18n.t('communities.loginToView'),
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  const [type, setType] = useState<string>(COMMUNITY_TYPES[0]);
  const [name, setName] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<string>(JOIN_POLICIES[0]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    communitiesApi
      .list(token, page, undefined, search || undefined)
      .then((res) => {
        setCommunities(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setListError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page, search]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setCreateError(null);
    setCreating(true);
    try {
      await communitiesApi.create(token, { type, name, joinPolicy });
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
      <h2>{t('communities.title')}</h2>
      <p className="hint">{t('communities.intro')}</p>

      <input
        type="text"
        placeholder={t('communities.searchPlaceholder')}
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        style={{ marginBottom: '1rem', width: '100%' }}
      />

      <form onSubmit={handleCreate} className="request-form">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {COMMUNITY_TYPES.map((communityType) => (
            <option key={communityType} value={communityType}>
              {t(`communityTypes.${communityType}`, communityType)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t('communities.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <select value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value)}>
          {JOIN_POLICIES.map((p) => (
            <option key={p} value={p}>
              {t(`joinPolicies.${p}`)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={creating}>
          {creating ? t('communities.creating') : t('communities.create')}
        </button>
      </form>
      {createError && <p className="error">{createError}</p>}

      {loading && <p>{t('communities.loading')}</p>}
      {listError && <p className="error">{listError}</p>}

      <ul className="request-list">
        {communities.map((c) => (
          <li key={c.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`communityTypes.${c.type}`, c.type)}</span>
            </div>
            <p>
              <Link to={`/communities/${c.id}`}>{c.name}</Link>
            </p>
          </li>
        ))}
      </ul>
      {!loading && communities.length === 0 && !listError && <p className="hint">{t('communities.noCommunities')}</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default CommunitiesPage;
