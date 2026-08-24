import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { Community, CommunityMember, Post, communitiesApi, postsApi } from '../../lib/api';
import { PostRow } from './PostRow';
import { Pagination } from '../Pagination';

export function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotalPages, setPostsTotalPages] = useState(1);

  const [postContent, setPostContent] = useState('');
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token || !id) return;
    Promise.all([
      communitiesApi.get(token, id),
      communitiesApi.listMembers(token, id),
      postsApi.listForCommunity(token, id, postsPage),
    ])
      .then(([c, m, p]) => {
        setCommunity(c);
        setMembers(m.data);
        setPosts(p.data);
        setPostsTotalPages(p.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id, postsPage]);

  const isMember = members.some((m) => m.user_id === user?.id);

  const handleJoin = async () => {
    const token = getAccessToken();
    if (!token || !id || !user) return;
    setJoining(true);
    setJoinError(null);
    try {
      await communitiesApi.join(token, id);
      refresh();
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const handlePost = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id) return;
    setPostError(null);
    setPostSubmitting(true);
    try {
      const created = await postsApi.create(token, id, postContent);
      if (postsPage === 1) {
        setPosts((prev) => [created, ...prev]);
      } else {
        setPostsPage(1);
      }
      setPostContent('');
    } catch (err) {
      setPostError((err as Error).message);
    } finally {
      setPostSubmitting(false);
    }
  };

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!community) return null;

  return (
    <div className="communities-page">
      <h2>{community.name}</h2>
      <p className="hint">
        {community.type} · {members.length} membre{members.length > 1 ? 's' : ''}
      </p>

      {!isMember && (
        <div>
          <button onClick={handleJoin} disabled={joining}>
            {joining ? 'Adhésion…' : 'Devenir membre'}
          </button>
          {joinError && <p className="error">{joinError}</p>}
        </div>
      )}

      <h3>Membres</h3>
      <ul className="request-list">
        {members.map((m) => (
          <li key={m.id} className="request-row">
            {m.users?.display_name ?? 'Utilisateur'}
            {m.internal_role ? ` — ${m.internal_role}` : ''}
          </li>
        ))}
      </ul>

      <h3>Fil d'actualité</h3>
      {isMember ? (
        <form onSubmit={handlePost} className="request-form">
          <textarea
            placeholder="Partage une annonce ou une nouvelle…"
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            rows={2}
            required
          />
          <button type="submit" disabled={postSubmitting}>
            {postSubmitting ? 'Publication…' : 'Publier'}
          </button>
        </form>
      ) : (
        <p className="hint">Deviens membre pour publier.</p>
      )}
      {postError && <p className="error">{postError}</p>}

      <ul className="request-list">
        {posts.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
      </ul>
      {posts.length === 0 && <p className="hint">Aucune publication pour l'instant.</p>}
      <Pagination page={postsPage} totalPages={postsTotalPages} onChange={setPostsPage} />
    </div>
  );
}

export default CommunityDetailPage;
