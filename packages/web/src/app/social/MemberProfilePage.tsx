import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { FeedPost, MemberProfile, socialApi } from '../../lib/api';
import { Avatar, SocialPostCard } from './SocialPostCard';
import { MessageMemberButton } from './MessagesPage';

/** A member's public profile: name, church, city, communities and their publications.
 *  Never their e-mail or phone. */
export function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ bio: '', churchName: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !id) return;
    socialApi
      .profile(token, id)
      .then((p) => {
        setError(null);
        setProfile(p);
        setForm({ bio: p.bio ?? '', churchName: p.churchName ?? '', city: p.city ?? '' });
      })
      .catch((err) => setError((err as Error).message));
    socialApi
      .memberPosts(token, id)
      .then((res) => setPosts(res.data))
      .catch(() => setPosts([]));
  }, [id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await socialApi.updateMyProfile(token, {
        bio: form.bio.trim(),
        churchName: form.churchName.trim(),
        city: form.city.trim(),
      });
      setProfile(updated);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !profile) return <p className="error">{error}</p>;
  // Another member's page was showing until this one loads.
  if (!profile || profile.id !== id) return <p className="hint">{t('posts.loading')}</p>;

  const since = new Date(profile.memberSince).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });

  return (
    <section className="social-page">
      <Link to="/fil" className="link-button">← {t('social.backToFeed')}</Link>

      <div className="social-profile-card">
        <Avatar name={profile.displayName} url={profile.avatarUrl} size={88} />
        <div className="social-profile-main">
          <h2>{profile.displayName}</h2>
          <p className="hint">
            {[profile.churchName, profile.city].filter(Boolean).join(' · ')}
            {(profile.churchName || profile.city) && ' · '}
            {t('social.memberSince', { date: since })}
          </p>
          {profile.bio && <p className="social-bio">{profile.bio}</p>}
          {profile.communities.length > 0 && (
            <div className="social-chips">
              {profile.communities.map((c) => (
                <Link key={c.id} to={`/communities/${c.id}`} className="social-chip">
                  {c.name}
                </Link>
              ))}
            </div>
          )}
          {!profile.isMe && <MessageMemberButton memberId={profile.id} />}
          {profile.isMe && !editing && (
            <button type="button" onClick={() => { setEditing(true); setSaved(false); }}>
              {t('social.editProfile')}
            </button>
          )}
          {saved && <p className="hint">{t('social.saved')}</p>}
        </div>
      </div>

      {editing && (
        <form className="social-profile-form" onSubmit={save}>
          <label>
            {t('social.church')}
            <input value={form.churchName} maxLength={120} onChange={(e) => setForm({ ...form, churchName: e.target.value })} />
          </label>
          <label>
            {t('social.city')}
            <input value={form.city} maxLength={80} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>
            {t('social.bio')}
            <textarea value={form.bio} maxLength={500} rows={3} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </label>
          <p className="hint">{t('social.privacyNote')}</p>
          <div className="social-composer-bar">
            <button type="submit" disabled={saving}>{t('posts.save')}</button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>{t('posts.cancel')}</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <h3 className="social-section-title">{t('social.postsTitle', { count: profile.postCount })}</h3>
      <div className="social-list">
        {posts.map((post) => (
          <SocialPostCard key={post.id} post={post} />
        ))}
      </div>
      {posts.length === 0 && <p className="social-empty">{t('social.noPosts')}</p>}
    </section>
  );
}
