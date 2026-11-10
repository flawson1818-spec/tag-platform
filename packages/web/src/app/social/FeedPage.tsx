import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { FeedPost, MemberProfile, socialApi } from '../../lib/api';
import { SocialComposer } from './SocialComposer';
import { Avatar, SocialPostCard } from './SocialPostCard';
import { CommunityTabs } from './CommunityTabs';

/** The Christian social network's home: what the prayer family shares. */
export function FeedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [me, setMe] = useState<MemberProfile | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((p: number) => {
    const token = getAccessToken();
    if (!token) return;
    socialApi
      .feed(token, p)
      .then((res) => {
        setPosts((prev) => (p === 1 ? res.data : [...prev, ...res.data.filter((n) => !prev.some((o) => o.id === n.id))]));
        setHasMore(res.meta.page < res.meta.totalPages);
        setPage(p);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1);
    const token = getAccessToken();
    if (token && user) socialApi.profile(token, user.id).then(setMe).catch(() => setMe(null));
  }, [load, user]);

  return (
    <section className="social-page">
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

      <SocialComposer communities={me?.communities ?? []} onPublished={(post) => setPosts((prev) => [post, ...prev])} />

      {error && <p className="error">{error}</p>}

      <div className="social-list">
        {posts.map((post) => (
          <SocialPostCard key={post.id} post={post} />
        ))}
      </div>

      {!loading && posts.length === 0 && !error && <p className="social-empty">{t('social.empty')}</p>}
      {loading && <p className="hint">{t('posts.loading')}</p>}
      {hasMore && !loading && (
        <button type="button" className="social-more" onClick={() => {
            setLoading(true);
            load(page + 1);
          }}>
          {t('social.loadMore')}
        </button>
      )}
    </section>
  );
}
