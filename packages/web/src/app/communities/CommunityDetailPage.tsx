import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { Community, CommunityMember, MembershipStatus, Post, communitiesApi, postsApi } from '../../lib/api';
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
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('NONE');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotalPages, setPostsTotalPages] = useState(1);

  const [pendingMembers, setPendingMembers] = useState<CommunityMember[] | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

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
      communitiesApi.getMembership(token, id),
    ])
      .then(([c, m, p, membership]) => {
        setCommunity(c);
        setMembers(m.data);
        setPosts(p.data);
        setPostsTotalPages(p.meta.totalPages);
        setMembershipStatus(membership.status);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
    // Reserved to a Responsable+ — a 403 here just means this viewer isn't one, so the section
    // silently doesn't render rather than showing an error.
    communitiesApi
      .listPendingMembers(token, id)
      .then((res) => setPendingMembers(res.data))
      .catch(() => setPendingMembers(null));
  };

  useEffect(refresh, [id, postsPage]);

  const isMember = membershipStatus === 'ACTIVE';

  const handleJoin = async () => {
    const token = getAccessToken();
    if (!token || !id || !user) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await communitiesApi.join(token, id);
      setMembershipStatus(result.status);
      refresh();
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const handleApprove = async (userId: string) => {
    const token = getAccessToken();
    if (!token || !id) return;
    setApprovingId(userId);
    try {
      await communitiesApi.approveMember(token, id, userId);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovingId(null);
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

      {membershipStatus === 'NONE' && (
        <div>
          <button onClick={handleJoin} disabled={joining}>
            {joining ? 'Adhésion…' : 'Devenir membre'}
          </button>
          {joinError && <p className="error">{joinError}</p>}
        </div>
      )}
      {membershipStatus === 'PENDING' && (
        <p className="hint">
          Ta demande d'adhésion est <strong>en attente</strong> de validation par un Responsable.
        </p>
      )}

      {pendingMembers && pendingMembers.length > 0 && (
        <>
          <h3>Demandes en attente</h3>
          <ul className="request-list">
            {pendingMembers.map((m) => (
              <li key={m.id} className="request-row">
                <div className="request-meta">
                  <span>{m.users?.display_name ?? 'Utilisateur'}</span>
                </div>
                <button type="button" disabled={approvingId === m.user_id} onClick={() => handleApprove(m.user_id)}>
                  {approvingId === m.user_id ? 'Approbation…' : 'Approuver'}
                </button>
              </li>
            ))}
          </ul>
        </>
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
