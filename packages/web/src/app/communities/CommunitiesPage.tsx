import { FormEvent, MouseEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { COMMUNITY_TYPES, CommunityCard, JOIN_POLICIES, communitiesApi } from '../../lib/api';
import { Pagination } from '../Pagination';
import { CommunityTabs } from '../social/CommunityTabs';
import { communityIcon } from './communityIcons';

/** The types a member looks for first. */
const FILTER_TYPES = ['CHURCH', 'CELL', 'GROUP', 'MINISTRY', 'TEAM', 'CITY', 'COUNTRY'];

/** Join / request / member / waiting — the one button a card needs. */
export function JoinButton({ card, onChange }: { card: CommunityCard; onChange: (status: CommunityCard['myStatus']) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (card.myStatus === 'ACTIVE') return <span className="group-badge is-member"><span aria-hidden="true">✓</span> {t('groups.member')}</span>;
  if (card.myStatus === 'PENDING') return <span className="group-badge is-pending"><span aria-hidden="true">⏳</span> {t('groups.pending')}</span>;
  const join = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    communitiesApi
      .join(token, card.id)
      .then((res) => onChange(res.status))
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <button type="button" className="group-join" onClick={join} disabled={busy}>
        {card.join_policy === 'APPROVAL' ? t('groups.askToJoin') : t('groups.join')}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}

export function GroupCard({
  card,
  onChange,
  live,
}: {
  card: CommunityCard;
  onChange: (status: CommunityCard['myStatus']) => void;
  live?: string;
}) {
  const { t } = useTranslation();
  return (
    <li className={`group-card type-${card.type.toLowerCase()}`}>
      {live && (
        <Link to={`/communities/${card.id}?tab=live`} className="group-card-live">
          <span className="live-dot">{t('live.onAir')}</span> {live}
        </Link>
      )}
      <Link to={`/communities/${card.id}`} className="group-card-link">
        <span className="group-card-icon" aria-hidden="true">
          {communityIcon(card.type)}
        </span>
        <span className="group-card-body">
          <strong>{card.name}</strong>
          <span className="hint">
            {t(`communityTypes.${card.type}`, card.type)} · {t('groups.members', { count: card.memberCount })}
          </span>
          <span className="group-card-policy">{card.join_policy === 'APPROVAL' ? t('groups.policyApproval') : t('groups.policyOpen')}</span>
        </span>
      </Link>
      <div className="group-card-action">
        <JoinButton card={card} onChange={onChange} />
      </div>
    </li>
  );
}

/**
 * Églises et groupes: mine first, then the ones to discover — searchable, filtered by type, each a
 * card with one clear button. Creating one is a single button: directly for those allowed,
 * otherwise an application the administration validates.
 */
export function CommunitiesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mine, setMine] = useState<CommunityCard[]>([]);
  const [cards, setCards] = useState<CommunityCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'CHURCH', name: '', joinPolicy: 'OPEN' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lives, setLives] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    communitiesApi
      .directory(token, page, query || undefined, type || undefined)
      .then((res) => {
        setCards(res.data);
        setTotalPages(res.meta.totalPages);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [page, query, type]);

  useEffect(load, [load]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    communitiesApi.mine(token).then(setMine).catch(() => setMine([]));
    communitiesApi
      .live(token)
      .then((list) => setLives(Object.fromEntries(list.map((l) => [l.communityId, l.title]))))
      .catch(() => setLives({}));
    communitiesApi
      .canCreate(token)
      .then((r) => setCanCreate(r.canCreate))
      .catch(() => setCanCreate(false));
  }, []);

  // Debounced search: the list follows what is typed.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() === query) return;
      setLoading(true);
      setPage(1);
      setQuery(search.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [search, query]);

  const chooseType = (value: string) => {
    setLoading(true);
    setPage(1);
    setType(value);
  };

  const updateStatus = (id: string, status: CommunityCard['myStatus']) => {
    const change = (list: CommunityCard[]) =>
      list.map((c) => (c.id === id ? { ...c, myStatus: status, memberCount: c.memberCount + (status === 'ACTIVE' ? 1 : 0) } : c));
    setCards(change);
    const card = cards.find((c) => c.id === id);
    setMine((prev) => (prev.some((c) => c.id === id) ? change(prev) : card ? [...prev, { ...card, myStatus: status }] : prev));
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !form.name.trim()) return;
    setSaving(true);
    setCreateError(null);
    communitiesApi
      .create(token, { type: form.type, name: form.name.trim(), joinPolicy: form.joinPolicy })
      .then((created) => navigate(`/communities/${created.id}`))
      .catch((err) => setCreateError((err as Error).message))
      .finally(() => setSaving(false));
  };

  const mineIds = new Set(mine.map((m) => m.id));
  const discover = cards.filter((c) => !mineIds.has(c.id) || query || type);

  return (
    <div className="communities-page social-page">
      <div className="social-head">
        <div>
          <h2>{t('community.title')}</h2>
          <p className="hint">{t('community.groupsIntro')}</p>
        </div>
        {canCreate ? (
          <button type="button" className="groups-create-button" onClick={() => setCreating(!creating)} aria-expanded={creating}>
            ＋ {t('groups.create')}
          </button>
        ) : (
          <Link to="/candidatures?type=eglise" className="groups-create-button">
            ＋ {t('groups.register')}
          </Link>
        )}
      </div>
      <CommunityTabs />

      {creating && (
        <form className="groups-create" onSubmit={create}>
          <h3>{t('groups.createTitle')}</h3>
          <div className="groups-type-picker" role="radiogroup" aria-label={t('groups.typeLabel')}>
            {COMMUNITY_TYPES.map((ct) => (
              <button
                key={ct}
                type="button"
                role="radio"
                aria-checked={form.type === ct}
                className={form.type === ct ? 'is-on' : ''}
                onClick={() => setForm({ ...form, type: ct })}
              >
                <span aria-hidden="true">{communityIcon(ct)}</span> {t(`communityTypes.${ct}`, ct)}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('groups.namePlaceholder')}
            aria-label={t('groups.namePlaceholder')}
            maxLength={150}
            required
          />
          <div className="groups-policy">
            {JOIN_POLICIES.map((p) => (
              <label key={p} className={form.joinPolicy === p ? 'is-on' : ''}>
                <input type="radio" name="policy" checked={form.joinPolicy === p} onChange={() => setForm({ ...form, joinPolicy: p })} />
                <span>
                  <strong>{p === 'OPEN' ? t('groups.policyOpen') : t('groups.policyApproval')}</strong>
                  <span className="hint">{t(`groups.policyHelp.${p}`)}</span>
                </span>
              </label>
            ))}
          </div>
          {createError && <p className="error">{createError}</p>}
          <div className="groups-create-actions">
            <button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? t('communities.creating') : t('groups.createSubmit')}
            </button>
            <button type="button" className="link-button" onClick={() => setCreating(false)}>
              {t('composer.cancel')}
            </button>
          </div>
        </form>
      )}

      {mine.length > 0 && !query && !type && (
        <section className="groups-section">
          <h3>{t('groups.mine')}</h3>
          <ul className="group-grid">
            {mine.map((c) => (
              <GroupCard key={c.id} card={c} live={lives[c.id]} onChange={(s) => updateStatus(c.id, s)} />
            ))}
          </ul>
        </section>
      )}

      <section className="groups-section">
        <h3>{query || type ? t('groups.results') : t('groups.discover')}</h3>
        <div className="groups-search">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('communities.searchPlaceholder')}
            aria-label={t('communities.searchPlaceholder')}
          />
        </div>
        <div className="feed-filters">
          <button type="button" className={type === '' ? 'is-on' : ''} onClick={() => chooseType('')}>
            {t('groups.allTypes')}
          </button>
          {FILTER_TYPES.map((ft) => (
            <button key={ft} type="button" className={type === ft ? 'is-on' : ''} onClick={() => chooseType(ft)}>
              <span aria-hidden="true">{communityIcon(ft)}</span> {t(`communityTypes.${ft}`, ft)}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        {loading && <p className="hint">{t('communities.loading')}</p>}
        <ul className="group-grid">
          {discover.map((c) => (
            <GroupCard key={c.id} card={c} live={lives[c.id]} onChange={(s) => updateStatus(c.id, s)} />
          ))}
        </ul>
        {!loading && discover.length === 0 && !error && (
          <div className="social-empty">
            <p>{query || type ? t('groups.noResult') : t('communities.noCommunities')}</p>
            {!canCreate && (
              <Link to="/candidatures?type=eglise" className="feed-empty-cta">
                {t('groups.register')}
              </Link>
            )}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </section>
    </div>
  );
}

export default CommunitiesPage;
