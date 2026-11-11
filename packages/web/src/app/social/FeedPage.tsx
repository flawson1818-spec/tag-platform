import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { CommunityCard, FeedPost, FeedView, MemberProfile, communitiesApi, socialApi } from '../../lib/api';
import { SocialComposer } from './SocialComposer';
import { Avatar, SocialPostCard } from './SocialPostCard';
import { CommunityTabs } from './CommunityTabs';
import { communityIcon } from '../communities/communityIcons';
import { useUnreadMessages } from './useUnreadMessages';

const VIEWS: { view: FeedView; icon: string }[] = [
  { view: 'all', icon: '🌍' },
  { view: 'groups', icon: '⛪' },
  { view: 'photos', icon: '📷' },
  { view: 'EXPERIENCE', icon: '✨' },
  { view: 'WRITING', icon: '📖' },
];

/**
 * The Christian social network's home: share (a message, an experience, a writing, photos),
 * then read what the family shares — everything, my churches and groups, photos, experiences,
 * writings. Beside it: my churches and groups, my messages.
 */
export function FeedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const unread = useUnreadMessages(true);
  const [view, setView] = useState<FeedView>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [me, setMe] = useState<MemberProfile | null>(null);
  const [groups, setGroups] = useState<CommunityCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((p: number, v: FeedView) => {
    const token = getAccessToken();
    if (!token) return;
    socialApi
      .feed(token, p, { view: v })
      .then((res) => {
        setPosts((prev) => (p === 1 ? res.data : [...prev, ...res.data.filter((n) => !prev.some((o) => o.id === n.id))]));
        setHasMore(res.meta.page < res.meta.totalPages);
        setPage(p);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, 'all');
    const token = getAccessToken();
    if (!token) return;
    if (user) socialApi.profile(token, user.id).then(setMe).catch(() => setMe(null));
    communitiesApi.mine(token).then(setGroups).catch(() => setGroups([]));
  }, [load, user]);

  const choose = (v: FeedView) => {
    if (v === view) return;
    setView(v);
    setLoading(true);
    setPosts([]);
    load(1, v);
  };

  const activeGroups = groups.filter((g) => g.myStatus === 'ACTIVE');

  return (
    <section className="social-page feed-page">
      <div className="social-head">
        <div>
          <h2>{t('community.title')}</h2>
          <p className="hint">{t('social.subtitle')}</p>
        </div>
        {user && (
          <Link to={`/membres/${user.id}`} className="social-me">
            <Avatar name={me?.displayName ?? user.display_name} url={me?.avatarUrl ?? null} size={36} />
            <span>{t('social.myProfile')}</span>
          </Link>
        )}
      </div>

      <CommunityTabs />

      <div className="feed-layout">
        <div className="feed-main">
          <SocialComposer
            communities={activeGroups.map((g) => ({ id: g.id, name: g.name }))}
            avatarUrl={me?.avatarUrl}
            onPublished={(post) => setPosts((prev) => [post, ...prev])}
          />

          <div className="feed-filters" role="tablist" aria-label={t('feed.filtersLabel')}>
            {VIEWS.map(({ view: v, icon }) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={view === v ? 'is-on' : ''}
                onClick={() => choose(v)}
              >
                <span aria-hidden="true">{icon}</span> {t(`feed.views.${v}`)}
              </button>
            ))}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="social-list">
            {posts.map((post) => (
              <SocialPostCard key={post.id} post={post} />
            ))}
          </div>

          {!loading && posts.length === 0 && !error && (
            <div className="social-empty">
              <p>{t(`feed.empty.${view}`)}</p>
              {view === 'groups' && activeGroups.length === 0 && (
                <Link to="/communaute/groupes" className="feed-empty-cta">
                  {t('feed.findGroup')}
                </Link>
              )}
            </div>
          )}
          {loading && <p className="hint">{t('posts.loading')}</p>}
          {hasMore && !loading && (
            <button
              type="button"
              className="social-more"
              onClick={() => {
                setLoading(true);
                load(page + 1, view);
              }}
            >
              {t('social.loadMore')}
            </button>
          )}
        </div>

        <aside className="feed-aside">
          <section className="feed-card">
            <div className="feed-card-head">
              <h3>{t('feed.myGroups')}</h3>
              <Link to="/communaute/groupes">{t('feed.seeAll')}</Link>
            </div>
            {groups.length === 0 ? (
              <p className="hint">
                {t('feed.noGroup')} <Link to="/communaute/groupes">{t('feed.findGroup')}</Link>
              </p>
            ) : (
              <ul className="feed-group-list">
                {groups.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    <Link to={`/communities/${g.id}`}>
                      <span className="feed-group-icon" aria-hidden="true">
                        {communityIcon(g.type)}
                      </span>
                      <span>
                        <strong>{g.name}</strong>
                        <span className="hint">
                          {g.myStatus === 'PENDING' ? t('groups.pending') : t('groups.members', { count: g.memberCount })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link to="/messages" className="feed-card feed-card-link">
            <span aria-hidden="true">✉️</span>
            <span>
              <strong>{t('nav.messages')}</strong>
              <span className="hint">{unread > 0 ? t('memberHome.unread', { count: unread }) : t('memberHome.noUnread')}</span>
            </span>
          </Link>
          <Link to="/communaute/membres" className="feed-card feed-card-link">
            <span aria-hidden="true">👥</span>
            <span>
              <strong>{t('community.members')}</strong>
              <span className="hint">{t('feed.findMembers')}</span>
            </span>
          </Link>
        </aside>
      </div>
    </section>
  );
}
