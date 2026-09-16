import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import {
  Announcement,
  COMMUNITY_TYPES,
  Community,
  CommunityDocument,
  CommunityMember,
  MembershipStatus,
  Post,
  announcementsApi,
  communitiesApi,
  communityDocumentsApi,
  filesApi,
  postsApi,
} from '../../lib/api';
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
  const { t } = useTranslation();
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

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);

  const [subType, setSubType] = useState<string>(COMMUNITY_TYPES[0]);
  const [subName, setSubName] = useState('');
  const [subCreating, setSubCreating] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<CommunityDocument[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token || !id) return;
    Promise.all([
      communitiesApi.get(token, id),
      communitiesApi.listMembers(token, id),
      postsApi.listForCommunity(token, id, postsPage),
      communitiesApi.getMembership(token, id),
      communitiesApi.list(token, 1, id),
      announcementsApi.list(id),
      communityDocumentsApi.list(id),
    ])
      .then(([c, m, p, membership, sub, ann, docs]) => {
        setCommunity(c);
        setMembers(m.data);
        setPosts(p.data);
        setPostsTotalPages(p.meta.totalPages);
        setMembershipStatus(membership.status);
        setChildren(sub.data);
        setAnnouncements(ann.data);
        setDocuments(docs);
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

  const handleAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id) return;
    setAnnouncementError(null);
    setAnnouncementSubmitting(true);
    try {
      const created = await announcementsApi.create(token, { communityId: id, content: announcementContent });
      setAnnouncements((prev) => [created, ...prev]);
      setAnnouncementContent('');
    } catch (err) {
      setAnnouncementError((err as Error).message);
    } finally {
      setAnnouncementSubmitting(false);
    }
  };

  const handleTogglePin = async (announcement: Announcement) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const updated = announcement.pinned_at
        ? await announcementsApi.unpin(token, announcement.id)
        : await announcementsApi.pin(token, announcement.id);
      setAnnouncements((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setAnnouncementError((err as Error).message);
    }
  };

  const handleRemoveAnnouncement = async (announcementId: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await announcementsApi.remove(token, announcementId);
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
    } catch (err) {
      setAnnouncementError((err as Error).message);
    }
  };

  const handleUploadDocument = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id || !docFile) return;
    setDocError(null);
    setDocUploading(true);
    try {
      const { file: stored, uploadUrl } = await filesApi.presign(token, {
        filename: docFile.name,
        mimeType: docFile.type,
        sizeBytes: docFile.size,
      });
      await filesApi.upload(uploadUrl, docFile);
      const created = await communityDocumentsApi.create(token, id, { fileId: stored.id, title: docTitle.trim() });
      setDocuments((prev) => [created, ...prev]);
      setDocTitle('');
      setDocFile(null);
    } catch (err) {
      setDocError((err as Error).message);
    } finally {
      setDocUploading(false);
    }
  };

  const handleOpenDocument = async (documentId: string) => {
    if (!id) return;
    setDocError(null);
    try {
      const { url } = await communityDocumentsApi.getUrl(id, documentId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setDocError((err as Error).message);
    }
  };

  const handleRemoveDocument = async (documentId: string) => {
    const token = getAccessToken();
    if (!token || !id) return;
    try {
      await communityDocumentsApi.remove(token, id, documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch (err) {
      setDocError((err as Error).message);
    }
  };

  if (loading) return <p>{t('communityDetail.loading')}</p>;
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
        {t(`communityTypes.${community.type}`, community.type)} · {t('communityDetail.memberCount', { count: members.length })}
      </p>

      <h3>{t('communityDetail.subCommunitiesTitle')}</h3>
      {children.length > 0 && (
        <ul className="request-list">
          {children.map((c) => (
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
      )}
      <form onSubmit={handleCreateSub} className="request-form">
        <select value={subType} onChange={(e) => setSubType(e.target.value)}>
          {COMMUNITY_TYPES.map((communityType) => (
            <option key={communityType} value={communityType}>
              {t(`communityTypes.${communityType}`, communityType)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t('communityDetail.subNamePlaceholder')}
          value={subName}
          onChange={(e) => setSubName(e.target.value)}
          required
        />
        <button type="submit" disabled={subCreating}>
          {subCreating ? t('communityDetail.creating') : t('communityDetail.addSubCommunity')}
        </button>
      </form>
      {subError && <p className="error">{subError}</p>}

      {membershipStatus === 'NONE' && (
        <div>
          <button onClick={handleJoin} disabled={joining}>
            {joining ? t('communityDetail.joining') : t('communityDetail.becomeMember')}
          </button>
          {joinError && <p className="error">{joinError}</p>}
        </div>
      )}
      {membershipStatus === 'PENDING' && (
        <p className="hint">
          {t('communityDetail.pendingApprovalPrefix')} <strong>{t('communityDetail.pendingApprovalStrong')}</strong>{' '}
          {t('communityDetail.pendingApprovalSuffix')}
        </p>
      )}

      {pendingMembers && pendingMembers.length > 0 && (
        <>
          <h3>{t('communityDetail.pendingRequestsTitle')}</h3>
          <ul className="request-list">
            {pendingMembers.map((m) => (
              <li key={m.id} className="request-row">
                <div className="request-meta">
                  <span>{m.users?.display_name ?? t('communityDetail.unknownUser')}</span>
                </div>
                <button type="button" disabled={approvingId === m.user_id} onClick={() => handleApprove(m.user_id)}>
                  {approvingId === m.user_id ? t('communityDetail.approving') : t('communityDetail.approve')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>{t('communityDetail.membersTitle')}</h3>
      <ul className="request-list">
        {members.map((m) => (
          <li key={m.id} className="request-row">
            {m.users?.display_name ?? t('communityDetail.unknownUser')}
            {m.internal_role ? ` — ${m.internal_role}` : ''}
          </li>
        ))}
      </ul>

      <h3>{t('communityDetail.announcementsTitle')}</h3>
      <p className="hint">{t('communityDetail.announcementsIntro')}</p>
      <form onSubmit={handleAnnouncement} className="request-form">
        <textarea
          placeholder={t('communityDetail.announcementPlaceholder')}
          value={announcementContent}
          onChange={(e) => setAnnouncementContent(e.target.value)}
          rows={2}
          required
        />
        <button type="submit" disabled={announcementSubmitting}>
          {announcementSubmitting ? t('communityDetail.publishing') : t('communityDetail.publish')}
        </button>
      </form>
      {announcementError && <p className="error">{announcementError}</p>}
      {announcements.length === 0 && <p className="hint">{t('communityDetail.noAnnouncements')}</p>}
      <ul className="request-list">
        {announcements.map((a) => (
          <li key={a.id} className="request-row">
            <div className="request-meta">
              {a.pinned_at && (
                <span className="chip chip-status">
                  <span role="img" aria-label={t('communityDetail.pinned')}>📌</span> {t('communityDetail.pinned')}
                </span>
              )}
              {a.community_id === null && <span className="chip">{t('communityDetail.national')}</span>}
            </div>
            <p>{a.content}</p>
            <div className="request-form">
              <button type="button" className="link-button" onClick={() => handleTogglePin(a)}>
                {a.pinned_at ? t('communityDetail.unpin') : t('communityDetail.pin')}
              </button>
              <button type="button" className="link-button" onClick={() => handleRemoveAnnouncement(a.id)}>
                {t('communityDetail.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3>{t('communityDetail.documentsTitle')}</h3>
      <form onSubmit={handleUploadDocument} className="request-form">
        <input
          type="text"
          placeholder={t('communityDetail.documentTitlePlaceholder')}
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          required
        />
        <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={docUploading}>
          {docUploading ? t('communityDetail.uploading') : t('communityDetail.uploadDocument')}
        </button>
      </form>
      {docError && <p className="error">{docError}</p>}
      {documents.length === 0 && <p className="hint">{t('communityDetail.noDocuments')}</p>}
      <ul className="request-list">
        {documents.map((d) => (
          <li key={d.id} className="request-row">
            <div className="request-form">
              <button type="button" className="link-button" onClick={() => handleOpenDocument(d.id)}>
                <span role="img" aria-label={t('communityDetail.documentIcon')}>📄</span> {d.title}
              </button>
              <button type="button" className="link-button" onClick={() => handleRemoveDocument(d.id)}>
                {t('communityDetail.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3>{t('communityDetail.feedTitle')}</h3>
      {isMember ? (
        <form onSubmit={handlePost} className="request-form">
          <textarea
            placeholder={t('communityDetail.postPlaceholder')}
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            rows={2}
            required
          />
          <button type="submit" disabled={postSubmitting}>
            {postSubmitting ? t('communityDetail.publishing') : t('communityDetail.publish')}
          </button>
        </form>
      ) : (
        <p className="hint">{t('communityDetail.becomeMemberToPost')}</p>
      )}
      {postError && <p className="error">{postError}</p>}

      <ul className="request-list">
        {posts.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
      </ul>
      {posts.length === 0 && <p className="hint">{t('communityDetail.noPosts')}</p>}
      <Pagination page={postsPage} totalPages={postsTotalPages} onChange={setPostsPage} />
    </div>
  );
}

export default CommunityDetailPage;
