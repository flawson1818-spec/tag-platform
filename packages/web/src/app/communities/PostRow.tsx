import { FormEvent, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { Comment, Post, postsApi } from '../../lib/api';

export function PostRow({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    const token = getAccessToken();
    if (next && token && comments.length === 0) {
      setLoading(true);
      postsApi
        .listComments(token, post.id)
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
      const created = await postsApi.createComment(token, post.id, content.trim());
      setComments((prev) => [...prev, created]);
      setContent('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <li className="request-row">
      <p>{post.content}</p>
      <button type="button" onClick={toggle}>
        {expanded ? 'Masquer les commentaires' : 'Voir les commentaires'}
      </button>

      {expanded && (
        <div className="comments-block">
          {loading && <p>Chargement…</p>}
          {error && <p className="error">{error}</p>}
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id}>{c.content}</li>
            ))}
          </ul>
          <form onSubmit={handleSubmit} className="reject-row">
            <input
              type="text"
              placeholder="Écrire un commentaire…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button type="submit" disabled={submitting}>
              Envoyer
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

export default PostRow;
