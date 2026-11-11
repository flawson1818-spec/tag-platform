import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { CommunityCard, Mobilization, communitiesApi, mobilizationsApi } from '../../lib/api';
import { communityIcon } from '../communities/communityIcons';

/** Entrust a request to a church, a cell, a team — besides an intercessor (§5.6). */
export function MobilizeGroup({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Mobilization[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CommunityCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (token) mobilizationsApi.forRequest(token, requestId).then(setItems).catch(() => setItems([]));
  }, [requestId]);

  useEffect(() => {
    if (!open) return;
    const token = getAccessToken();
    if (!token) return;
    const timer = setTimeout(() => {
      communitiesApi
        .directory(token, 1, search.trim() || undefined)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [open, search]);

  const invite = (communityId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    mobilizationsApi
      .invite(token, requestId, communityId)
      .then((m) => {
        setItems((prev) => [...prev, m]);
        setOpen(false);
        setSearch('');
      })
      .catch((err) => setError((err as Error).message));
  };

  const withdraw = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    mobilizationsApi
      .withdraw(token, id)
      .then(() => setItems((prev) => prev.filter((m) => m.id !== id)))
      .catch((err) => setError((err as Error).message));
  };

  const taken = new Set(items.map((m) => m.community.id));

  return (
    <div className="mobilize">
      {items.length > 0 && (
        <ul className="mobilize-list">
          {items.map((m) => (
            <li key={m.id} className={`mobilize-chip st-${m.status.toLowerCase()}`}>
              <span aria-hidden="true">{communityIcon(m.community.type)}</span> {m.community.name} · {t(`mobilization.status.${m.status}`)}
              <button type="button" onClick={() => withdraw(m.id)} aria-label={t('mobilization.withdraw', { name: m.community.name })}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="admin-status-button admin-status-button-visible" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">⛪</span> {t('mobilization.mobilize')}
      </button>
      {open && (
        <div className="recommend-panel">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('communities.searchPlaceholder')}
            aria-label={t('communities.searchPlaceholder')}
          />
          <ul>
            {results
              .filter((c) => !taken.has(c.id))
              .map((c) => (
                <li key={c.id}>
                  <button type="button" className="recommend-pick" onClick={() => invite(c.id)}>
                    <span className="recommend-score" aria-hidden="true">
                      {communityIcon(c.type)}
                    </span>
                    <span className="recommend-who">
                      <strong>{c.name}</strong>
                      <span className="hint">
                        {t(`communityTypes.${c.type}`, c.type)} · {t('groups.members', { count: c.memberCount })}
                      </span>
                    </span>
                    <span className="recommend-cta">{t('mobilization.invite')}</span>
                  </button>
                </li>
              ))}
          </ul>
          {results.length === 0 && <p className="hint">{t('groups.noResult')}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
