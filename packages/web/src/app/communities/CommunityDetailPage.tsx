import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import {
  Announcement,
  COMMUNITY_TYPES,
  Community,
  CommunityDocument,
  CommunityMember,
  FeedPost,
  MembershipStatus,
  announcementsApi,
  communitiesApi,
  communityDocumentsApi,
  filesApi,
  socialApi,
} from '../../lib/api';
import { SocialComposer } from '../social/SocialComposer';
import { Avatar, SocialPostCard } from '../social/SocialPostCard';
import { communityIcon } from './communityIcons';
import { GroupLiveRoom, LIVE_ICONS } from './GroupLiveRoom';
import { GroupRequests } from './GroupRequests';

type Tab = 'live' | 'requests' | 'posts' | 'members' | 'announcements' | 'documents' | 'groups';

/** Parents up to the top (cellule → église → pays): a short breadcrumb. */
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

/**
 * A church's or group's page, like a group on a social network: its header with one clear button
 * (join, request, member), then tabs — Publications (its own wall), Members, Announcements,
 * Documents, Sub-groups. Management tools appear only to those who manage it.
 */
export function CommunityDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'live' ? 'live' : params.get('tab') === 'requests' ? 'requests' : 'posts');
  const [invited, setInvited] = useState(0);
  const [live, setLive] = useState<{ title: string; kind: string } | null>(null);
  const [memberTotal, setMemberTotal] = useState(0);
  const [community, setCommunity] = useState<Community | null>(null);
  const [ancestors, setAncestors] = useState<Community[]>([]);
  const [children, setChildren] = useState<Community[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [pending, setPending] = useState<CommunityMember[]>([]);
  const [status, setStatus] = useState<MembershipStatus>('NONE');
  const [canManage, setCanManage] = useState(false);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsPage, setPostsPage] = useState(1);
  const [hasMorePosts, setHasMorePosts] = useState(false);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementText, setAnnouncementText] = useState('');
  const [documents, setDocuments] = useState<CommunityDocument[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [subType, setSubType] = useState<string>('CELL');
  const [subName, setSubName] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) => {
    setNotice(null);
    setError((err as Error).message);
  };

  const loadPosts = useCallback(
    (page: number) => {
      const token = getAccessToken();
      if (!token || !id) return;
      socialApi
        .feed(token, page, { communityId: id })
        .then((res) => {
          setPosts((prev) => (page === 1 ? res.data : [...prev, ...res.data.filter((n) => !prev.some((o) => o.id === n.id))]));
          setPostsPage(page);
          setHasMorePosts(res.meta.page < res.meta.totalPages);
        })
        .catch(() => setPosts([]));
    },
    [id],
  );

  const refresh = useCallback(() => {
    const token = getAccessToken();
    if (!token || !id) return;
    Promise.all([
      communitiesApi.get(token, id),
      communitiesApi.listMembers(token, id),
      communitiesApi.getMembership(token, id),
      communitiesApi.list(token, 1, id),
      announcementsApi.list(id),
    ])
      .then(([c, m, membership, sub, ann]) => {
        setCommunity(c);
        setMembers(m.data);
        setMemberTotal(m.meta?.total ?? m.data.length);
        setStatus(membership.status);
        setCanManage(Boolean(membership.canManage));
        setCanManageMembers(Boolean(membership.canManageMembers));
        setChildren(sub.data);
        setAnnouncements(ann.data);
        if (membership.canManageMembers) {
          communitiesApi
            .listPendingMembers(token, id)
            .then((res) => setPending(res.data))
            .catch(() => setPending([]));
        }
        if (membership.status === 'ACTIVE') loadPosts(1);
        return fetchAncestors(token, c);
      })
      .then(setAncestors)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
    communityDocumentsApi
      .list(token, id)
      .then(setDocuments)
      .catch(() => setDocuments([]));
    communitiesApi
      .live(token)
      .then((list) => setLive(list.find((l) => l.communityId === id) ?? null))
      .catch(() => setLive(null));
  }, [id, loadPosts]);

  useEffect(refresh, [refresh]);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (done) setNotice(done);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    const token = getAccessToken();
    if (!token || !id) return;
    setJoining(true);
    communitiesApi
      .join(token, id)
      .then((res) => {
        setStatus(res.status);
        if (res.status === 'ACTIVE') refresh();
      })
      .catch(fail)
      .finally(() => setJoining(false));
  };

  const leave = () => {
    const token = getAccessToken();
    if (!token || !id) return;
    if (!window.confirm(t('groupPage.leaveConfirm', { name: community?.name }))) return;
    void run(async () => {
      await communitiesApi.leave(token, id);
      setStatus('NONE');
      setPosts([]);
      refresh();
    });
  };

  const approve = (userId: string) => {
    const token = getAccessToken();
    if (!token || !id) return;
    void run(async () => {
      await communitiesApi.approveMember(token, id, userId);
      setPending((prev) => prev.filter((p) => p.user_id !== userId));
      refresh();
    }, t('groupPage.approved'));
  };

  const announce = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id || !announcementText.trim()) return;
    void run(async () => {
      const created = await announcementsApi.create(token, { communityId: id, content: announcementText.trim() });
      setAnnouncements((prev) => [created, ...prev]);
      setAnnouncementText('');
    });
  };

  const togglePin = (a: Announcement) => {
    const token = getAccessToken();
    if (!token) return;
    void run(async () => {
      const updated = a.pinned_at ? await announcementsApi.unpin(token, a.id) : await announcementsApi.pin(token, a.id);
      setAnnouncements((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    });
  };

  const removeAnnouncement = (announcementId: string) => {
    const token = getAccessToken();
    if (!token) return;
    void run(async () => {
      await announcementsApi.remove(token, announcementId);
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
    });
  };

  const uploadDocument = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id || !docFile) return;
    void run(async () => {
      const { file: stored, uploadUrl } = await filesApi.presign(token, {
        filename: docFile.name,
        mimeType: docFile.type,
        sizeBytes: docFile.size,
      });
      await filesApi.upload(uploadUrl, docFile);
      const created = await communityDocumentsApi.create(token, id, { fileId: stored.id, title: docTitle.trim() || docFile.name });
      setDocuments((prev) => [created, ...prev]);
      setDocTitle('');
      setDocFile(null);
    });
  };

  const openDocument = (documentId: string) => {
    if (!id) return;
    void run(async () => {
      const { url } = await communityDocumentsApi.getUrl(id, documentId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  const removeDocument = (documentId: string) => {
    const token = getAccessToken();
    if (!token || !id) return;
    void run(async () => {
      await communityDocumentsApi.remove(token, id, documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    });
  };

  const createSub = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !id || !subName.trim()) return;
    void run(async () => {
      await communitiesApi.create(token, { type: subType, name: subName.trim(), parentId: id });
      setSubName('');
      refresh();
    });
  };

  if (loading) return <p className="hint">{t('communityDetail.loading')}</p>;
  if (!community) return <p className="error">{error ?? t('communityDetail.loading')}</p>;

  const isMember = status === 'ACTIVE';
  const sortedAnnouncements = [...announcements].sort((a, b) => Number(Boolean(b.pinned_at)) - Number(Boolean(a.pinned_at)));
  const tabs: { key: Tab; label: string; count?: number; badge?: number }[] = [
    { key: 'live', label: `${live ? '🔴' : '📡'} ${t('groupPage.tabs.live')}` },
    { key: 'posts', label: t('groupPage.tabs.posts') },
    { key: 'requests', label: `🙏 ${t('groupPage.tabs.requests')}`, badge: invited },
    { key: 'members', label: t('groupPage.tabs.members'), count: memberTotal, badge: pending.length },
    { key: 'announcements', label: t('groupPage.tabs.announcements'), count: announcements.length },
    { key: 'documents', label: t('groupPage.tabs.documents'), count: documents.length },
    { key: 'groups', label: t('groupPage.tabs.groups'), count: children.length },
  ];

  return (
    <div className="communities-page social-page group-page">
      <p className="group-breadcrumb">
        <Link to="/communaute/groupes">← {t('community.groups')}</Link>
        {ancestors.map((a) => (
          <span key={a.id}>
            {' / '}
            <Link to={`/communities/${a.id}`}>{a.name}</Link>
          </span>
        ))}
      </p>

      <div className={`group-hero type-${community.type.toLowerCase()}`}>
        <span className="group-hero-icon" aria-hidden="true">
          {communityIcon(community.type)}
        </span>
        <div className="group-hero-body">
          <h2>{community.name}</h2>
          <p className="hint">
            {t(`communityTypes.${community.type}`, community.type)} · {t('groups.members', { count: memberTotal })} ·{' '}
            {community.join_policy === 'APPROVAL' ? t('groups.policyApproval') : t('groups.policyOpen')}
          </p>
          <div className="group-avatars" aria-hidden="true">
            {members.slice(0, 6).map((m) => (
              <Avatar key={m.id} name={m.users?.display_name ?? '?'} url={null} size={28} />
            ))}
          </div>
        </div>
        <div className="group-hero-action">
          {status === 'ACTIVE' && (
            <>
              <span className="group-badge is-member"><span aria-hidden="true">✓</span> {t('groups.member')}</span>
              <button type="button" className="link-button" onClick={leave}>
                {t('groupPage.leave')}
              </button>
            </>
          )}
          {status === 'PENDING' && <span className="group-badge is-pending"><span aria-hidden="true">⏳</span> {t('groups.pending')}</span>}
          {status === 'NONE' && (
            <button type="button" className="group-join" onClick={join} disabled={joining}>
              {community.join_policy === 'APPROVAL' ? t('groups.askToJoin') : t('groups.join')}
            </button>
          )}
        </div>
      </div>

      {live && tab !== 'live' && (
        <button type="button" className="live-banner" onClick={() => setTab('live')}>
          <span className="live-dot">{t('live.onAir')}</span>
          <span>
            <span aria-hidden="true">{LIVE_ICONS[live.kind] ?? '📢'}</span> {live.title}
          </span>
          <strong>{t('live.joinNow')} →</strong>
        </button>
      )}

      <div className="group-tabs" role="tablist" aria-label={t('groupPage.tabsLabel')}>
        {tabs.map((tb) => (
          <button key={tb.key} type="button" className={tab === tb.key ? 'is-on' : ''} onClick={() => setTab(tb.key)}>
            {tb.label}
            {tb.count ? <span className="group-tab-count">{tb.count}</span> : null}
            {tb.badge ? <span className="nav-badge">{tb.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'requests' && (isMember || canManage) && <GroupRequests communityId={community.id} onCount={setInvited} />}
      {tab === 'requests' && !isMember && !canManage && (
        <p className="social-empty group-locked">{t('groupPage.joinToSee')}</p>
      )}

      {tab === 'live' && (
        <GroupLiveRoom
          communityId={community.id}
          isMember={isMember || canManage}
          onLiveChange={(on) => setLive(on ? (live ?? { title: '', kind: 'INFORMATION' }) : null)}
        />
      )}

      {notice && <p className="admin-notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {tab === 'posts' && (
        <section>
          {isMember ? (
            <>
              <SocialComposer
                communities={[]}
                fixedCommunity={{ id: community.id, name: community.name }}
                onPublished={(post) => setPosts((prev) => [post, ...prev])}
              />
              <div className="social-list">
                {posts.map((p) => (
                  <SocialPostCard key={p.id} post={p} />
                ))}
              </div>
              {posts.length === 0 && <p className="social-empty">{t('groupPage.noPosts')}</p>}
              {hasMorePosts && (
                <button type="button" className="social-more" onClick={() => loadPosts(postsPage + 1)}>
                  {t('social.loadMore')}
                </button>
              )}
            </>
          ) : (
            <div className="social-empty group-locked">
              <p>
                <span aria-hidden="true">🔒</span> {t('groupPage.joinToSee')}
              </p>
              {status === 'NONE' && (
                <button type="button" className="group-join" onClick={join} disabled={joining}>
                  {community.join_policy === 'APPROVAL' ? t('groups.askToJoin') : t('groups.join')}
                </button>
              )}
              {status === 'PENDING' && <p className="hint">{t('groupPage.pendingHint')}</p>}
            </div>
          )}
        </section>
      )}

      {tab === 'members' && (
        <section>
          {canManageMembers && pending.length > 0 && (
            <div className="group-pending">
              <h3>{t('groupPage.pendingTitle', { count: pending.length })}</h3>
              <ul className="group-member-grid">
                {pending.map((m) => (
                  <li key={m.id} className="group-member">
                    <Avatar name={m.users?.display_name ?? '?'} url={null} size={40} />
                    <span className="group-member-name">{m.users?.display_name ?? t('communityDetail.unknownUser')}</span>
                    <button type="button" onClick={() => approve(m.user_id)} disabled={busy}>
                      {t('communityDetail.approve')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="group-member-grid">
            {members.map((m) => (
              <li key={m.id} className="group-member">
                <Link to={`/membres/${m.user_id}`} className="group-member-link">
                  <Avatar name={m.users?.display_name ?? '?'} url={null} size={40} />
                  <span className="group-member-name">{m.users?.display_name ?? t('communityDetail.unknownUser')}</span>
                </Link>
                {m.internal_role && <span className="chip">{m.internal_role}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'announcements' && (
        <section>
          {canManage && (
            <form className="group-tool" onSubmit={announce}>
              <textarea
                rows={2}
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                placeholder={t('communityDetail.announcementPlaceholder')}
                aria-label={t('communityDetail.announcementPlaceholder')}
              />
              <button type="submit" disabled={busy || !announcementText.trim()}>
                {t('communityDetail.publish')}
              </button>
            </form>
          )}
          {sortedAnnouncements.length === 0 && <p className="social-empty">{t('communityDetail.noAnnouncements')}</p>}
          <ul className="group-announcements">
            {sortedAnnouncements.map((a) => (
              <li key={a.id} className={a.pinned_at ? 'is-pinned' : ''}>
                {a.pinned_at && (
                  <span className="chip chip-status">
                    <span aria-hidden="true">📌</span> {t('communityDetail.pinned')}
                  </span>
                )}
                {a.community_id === null && <span className="chip">{t('communityDetail.national')}</span>}
                <p>{a.content}</p>
                <span className="hint">{new Date(a.created_at).toLocaleDateString()}</span>
                {canManage && a.community_id !== null && (
                  <div className="group-tool-actions">
                    <button type="button" className="link-button" onClick={() => togglePin(a)}>
                      {a.pinned_at ? t('communityDetail.unpin') : t('communityDetail.pin')}
                    </button>
                    <button type="button" className="link-button" onClick={() => removeAnnouncement(a.id)}>
                      {t('communityDetail.remove')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'documents' && (
        <section>
          {canManage && (
            <form className="group-tool" onSubmit={uploadDocument}>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder={t('communityDetail.documentTitlePlaceholder')}
                aria-label={t('communityDetail.documentTitlePlaceholder')}
              />
              <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} aria-label={t('communityDetail.uploadDocument')} />
              <button type="submit" disabled={busy || !docFile}>
                {t('communityDetail.uploadDocument')}
              </button>
            </form>
          )}
          {documents.length === 0 && <p className="social-empty">{t('communityDetail.noDocuments')}</p>}
          <ul className="group-documents">
            {documents.map((d) => (
              <li key={d.id}>
                <button type="button" className="link-button" onClick={() => openDocument(d.id)}>
                  <span aria-hidden="true">📄</span> {d.title}
                </button>
                {canManage && (
                  <button type="button" className="link-button" onClick={() => removeDocument(d.id)}>
                    {t('communityDetail.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'groups' && (
        <section>
          {children.length === 0 && <p className="social-empty">{t('groupPage.noSubGroups')}</p>}
          <ul className="group-grid">
            {children.map((c) => (
              <li key={c.id} className="group-card">
                <Link to={`/communities/${c.id}`} className="group-card-link">
                  <span className="group-card-icon" aria-hidden="true">
                    {communityIcon(c.type)}
                  </span>
                  <span className="group-card-body">
                    <strong>{c.name}</strong>
                    <span className="hint">{t(`communityTypes.${c.type}`, c.type)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {canManage && (
            <form className="group-tool" onSubmit={createSub}>
              <select value={subType} onChange={(e) => setSubType(e.target.value)} aria-label={t('groups.typeLabel')}>
                {COMMUNITY_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {communityIcon(ct)} {t(`communityTypes.${ct}`, ct)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder={t('communityDetail.subNamePlaceholder')}
                aria-label={t('communityDetail.subNamePlaceholder')}
              />
              <button type="submit" disabled={busy || !subName.trim()}>
                {t('communityDetail.addSubCommunity')}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

export default CommunityDetailPage;
