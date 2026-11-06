import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Comment, FeedPost, postsApi, socialApi } from '../../lib/api';

export function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return url ? (
    <img className="social-avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="social-avatar social-avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials || '✝'}
    </span>
  );
}

export function formatWhen(iso: string, lang: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (diff < 60) return rtf.format(0, 'second');
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
  if (diff < 7 * 86400) return rtf.format(-Math.floor(diff / 86400), 'day');
  return date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** One publication in the feed: author, text, up to 4 photos, Amen and comments. */
export function SocialPostCard({ post }: { post: FeedPost }) {
  const { t, i18n } = useTranslation();
  const [amen, setAmen] = useState({ count: post.amenCount, mine: post.amenedByMe });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const toggleAmen = async () => {
    const token = getAccessToken();
    if (!token || busy) return;
    const next = !amen.mine;
    setBusy(true);
    setAmen((a) => ({ count: a.count + (next ? 1 : -1), mine: next }));
    try {
      const res = await socialApi.amen(token, post.id, next);
      setAmen({ count: res.amenCount, mine: res.amenedByMe });
    } catch (err) {
      setAmen((a) => ({ count: a.count + (next ? -1 : 1), mine: !next }));
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleComments = () => {
    const next = !open;
    setOpen(next);
    const token = getAccessToken();
    if (next && token && comments === null) {
      postsApi
        .listComments(token, post.id)
        .then((res) => setComments(res.data.filter((c) => c.status !== 'DELETED')))
        .catch((err) => setError((err as Error).message));
    }
  };

  const sendComment = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !draft.trim()) return;
    try {
      const created = await postsApi.createComment(token, post.id, draft.trim());
      setComments((prev) => [...(prev ?? []), created]);
      setCommentCount((n) => n + 1);
      setDraft('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <article className="social-post">
      <div className="social-post-head">
        <Link to={`/membres/${post.author.id}`} className="social-author">
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
          <span>
            <strong>{post.author.displayName}</strong>
            <span className="hint">
              {formatWhen(post.createdAt, i18n.language)}
              {post.community && <> · {t('social.inCommunity', { name: post.community.name })}</>}
              {post.edited && <> · {t('posts.edited')}</>}
            </span>
          </span>
        </Link>
      </div>

      {post.content && <p className="social-post-text">{post.content}</p>}

      {post.photos.length > 0 && (
        <div className={`social-photos social-photos-${Math.min(post.photos.length, 4)}`}>
          {post.photos.map((src) => (
            <button key={src} type="button" className="social-photo" onClick={() => setZoom(src)} aria-label={t('social.enlarge')}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="social-post-actions">
        <button type="button" className={`social-amen${amen.mine ? ' is-on' : ''}`} onClick={toggleAmen} aria-pressed={amen.mine}>
          🙏 {t('social.amen')}
          {amen.count > 0 && <span className="social-count">{amen.count}</span>}
        </button>
        <button type="button" className="social-action" onClick={toggleComments} aria-expanded={open}>
          💬 {t('social.comments', { count: commentCount })}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {open && (
        <div className="social-comments">
          {comments === null ? (
            <p className="hint">{t('posts.loading')}</p>
          ) : (
            <ul>
              {comments.map((c) => (
                <li key={c.id}>{c.content}</li>
              ))}
            </ul>
          )}
          <form onSubmit={sendComment} className="social-comment-form">
            <input
              type="text"
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('posts.commentPlaceholder')}
              aria-label={t('posts.commentPlaceholder')}
            />
            <button type="submit" disabled={!draft.trim()}>
              {t('posts.send')}
            </button>
          </form>
        </div>
      )}

      {zoom && (
        <div className="social-lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
        </div>
      )}
    </article>
  );
}
