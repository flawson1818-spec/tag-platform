import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { MemberSummary, socialApi } from '../../lib/api';
import { CommunityTabs } from './CommunityTabs';
import { Avatar } from './SocialPostCard';

type Member = MemberSummary & { churchName: string | null; city: string | null };

/** Find brothers and sisters by name, open their profile, write to them. */
export function MembersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    socialApi
      .members(token, query)
      .then((list) => {
        setMembers(list);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [query]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQuery(search.trim());
  };

  return (
    <section className="social-page">
      <div className="social-head">
        <div>
          <h2>{t('community.title')}</h2>
          <p className="hint">{t('community.membersIntro')}</p>
        </div>
      </div>
      <CommunityTabs />
      <form className="admin-search" onSubmit={onSearch} role="search">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('community.searchMembers')}
          aria-label={t('community.searchMembers')}
        />
        <button type="submit">{t('adminUsers.search')}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {members === null && !error && <p className="hint">{t('posts.loading')}</p>}
      {members?.length === 0 && <p className="social-empty">{t('community.noMembers')}</p>}
      <div className="members-grid">
        {members?.map((m) => (
          <Link key={m.id} to={`/membres/${m.id}`} className="member-card">
            <Avatar name={m.displayName} url={m.avatarUrl} size={52} />
            <strong>{m.displayName}</strong>
            <span className="hint">{[m.churchName, m.city].filter(Boolean).join(' · ') || ' '}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
