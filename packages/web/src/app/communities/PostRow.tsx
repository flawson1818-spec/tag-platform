import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Comment, Post, postsApi } from '../../lib/api';

function CommentRow({
  comment,
  onUpdated,
  onDeleted,
}: {
  comment: Comment;
  onUpdated: (updated: Comment) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [error, setError] = useState<string | null>(null);

  if (comment.status === 'DELETED') return null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !content.trim()) return;
    try {
      const updated = await postsApi.updateComment(token, comment.post_id, comment.id, content.trim());
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await postsApi.deleteComment(token, comment.post_id, comment.id);
      onDeleted(comment.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (editing) {
    return (
      <li>
        <form onSubmit={handleSave} className="reject-row">
          <input type="text" value={content} onChange={(e) => setContent(e.target.value)} required />
          <button type="submit">{t('posts.save')}</button>
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            {t('posts.cancel')}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </li>
    );
  }

  return (
    <li>
      {comment.content}
      {comment.status === 'EDITED' && <span className="hint"> {t('posts.edited')}</span>}
      <button type="button" className="link-button" onClick={() => setEditing(true)}>
        {t('posts.edit')}
      </button>
      <button type="button" className="link-button" onClick={handleDelete}>
        {t('posts.delete')}
      </button>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export function PostRow({ post }: { post: Post }) {
  const { t } = useTranslation();
  const [localPost, setLocalPost] = useState(post);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [postContent, setPostContent] = useState(post.content);
  const [archived, setArchived] = useState(false);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    const token = getAccessToken();
    if (next && token && comments.length === 0) {
      setLoading(true);
      postsApi
        .listComments(token, localPost.id)
        .then((res) => setComments(res.data))
        .catch((err) => setError((err as Error).message))
        .finally(() => setLoading(false));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await postsApi.createComment(token, localPost.id, content.trim());
      setComments((prev) => [...prev, created]);
      setContent('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePost = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !postContent.trim()) return;
    try {
      const updated = await postsApi.update(token, localPost.id, postContent.trim());
      setLocalPost(updated);
      setEditingPost(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleArchive = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await postsApi.archive(token, localPost.id);
      setArchived(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (archived) return null;

  return (
    <li className="request-row">
      {editingPost ? (
        <form onSubmit={handleSavePost} className="reject-row">
          <input type="text" value={postContent} onChange={(e) => setPostContent(e.target.value)} required />
          <button type="submit">{t('posts.save')}</button>
          <button type="button" className="link-button" onClick={() => setEditingPost(false)}>
            {t('posts.cancel')}
          </button>
        </form>
      ) : (
        <>
          <p>
            {localPost.content}
            {localPost.status === 'EDITED' && <span className="hint"> {t('posts.edited')}</span>}
          </p>
          <div className="request-form">
            <button type="button" onClick={toggle}>
              {expanded ? t('posts.hideComments') : t('posts.showComments')}
            </button>
            <button type="button" className="link-button" onClick={() => setEditingPost(true)}>
              {t('posts.edit')}
            </button>
            <button type="button" className="link-button" onClick={handleArchive}>
              {t('posts.archive')}
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      {expanded && (
        <div className="comments-block">
          {loading && <p>{t('posts.loading')}</p>}
          <ul className="comment-list">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                onUpdated={(updated) => setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                onDeleted={(id) => setComments((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </ul>
          <form onSubmit={handleSubmit} className="reject-row">
            <input
              type="text"
              placeholder={t('posts.commentPlaceholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button type="submit" disabled={submitting}>
              {t('posts.send')}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

export default PostRow;
