import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { COMMUNITY_TYPES, Community, CommunityMember, MembershipStatus, Post, communitiesApi, postsApi } from '../../lib/api';
import { PostRow } from './PostRow';
import { Pagination } from '../Pagination';

/**
 * docs/07_UX_UI_SPECIFICATION.md §9 "hiérarchie (cellule → église → pays)" — parent_id already
 * existed on Community but nothing walked it. Ancestors are fetched one GET at a time (no
 * dedicated "path to root" endpoint) — hierarchies are shallow by nature (a handful of levels),
 * so this is simpler than adding a new endpoint for what's ultimately a breadcrumb.
 */
async function fetchAncestors(token: string, community: Community): Promise<Community[]> {
  const chain: Community[] = [];
  let current = community;
  while (current.parent_id) {
    const parent = await communitiesApi.get(token, current.parent_id);
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [community, setCommunity] = useState<Community | null>(null);
  const [ancestors, setAncestors] = useState<Community[]>([]);
  const [children, setChildren] = useState<Community[]>([]);
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

  const [subType, setSubType] = useState<string>(COMMUNITY_TYPES[0]);
  const [subName, setSubName] = useState('');
  const [subCreating, setSubCreating] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token || !id) return;
    Promise.all([
      communitiesApi.get(token, id),
      communitiesApi.listMembers(token, id),
      postsApi.listForCommunity(token, id, postsPage),
      communitiesApi.getMembership(token, id),
      communitiesApi.list(token, 1, id),
    ])
      .then(([c, m, p, membership, sub]) => {
        setCommunity(c);
        setMembers(m.data);
        setPosts(p.data);
        setPostsTotalPages(p.meta.totalPages);
        setMembershipStatus(membership.status);
        setChildren(sub.data);
        return fetchAncestors(token, c);
      })
      .then(setAncestors)
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

  const handleCreateSub = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id) return;
    setSubError(null);
    setSubCreating(true);
    try {
      await communitiesApi.create(token, { type: subType, name: subName, parentId: id });
      setSubName('');
      refresh();
    } catch (err) {
      setSubError((err as Error).message);
    } finally {
      setSubCreating(false);
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
      {ancestors.length > 0 && (
        <p className="hint">
          {ancestors.map((a) => (
            <span key={a.id}>
              <Link to={`/communities/${a.id}`}>{a.name}</Link>
              {' → '}
            </span>
          ))}
          {community.name}
        </p>
      )}
      <h2>{community.name}</h2>
      <p className="hint">
        {community.type} · {members.length} membre{members.length > 1 ? 's' : ''}
      </p>

      <h3>Sous-communautés</h3>
      {children.length > 0 && (
        <ul className="request-list">
          {children.map((c) => (
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
      )}
      <form onSubmit={handleCreateSub} className="request-form">
        <select value={subType} onChange={(e) => setSubType(e.target.value)}>
          {COMMUNITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Nom de la sous-communauté"
          value={subName}
          onChange={(e) => setSubName(e.target.value)}
          required
        />
        <button type="submit" disabled={subCreating}>
          {subCreating ? 'Création…' : 'Ajouter une sous-communauté'}
        </button>
      </form>
      {subError && <p className="error">{subError}</p>}

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
