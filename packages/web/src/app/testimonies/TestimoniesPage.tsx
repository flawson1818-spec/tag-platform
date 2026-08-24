import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { Testimony, filesApi, testimoniesApi } from '../../lib/api';
import { Pagination } from '../Pagination';

const MEDIA_TYPES = ['TEXT', 'PHOTO', 'AUDIO', 'VIDEO'] as const;
const MEDIA_TYPE_LABELS: Record<string, string> = { TEXT: 'Texte', PHOTO: 'Photo', AUDIO: 'Audio', VIDEO: 'Vidéo' };
const MEDIA_TYPE_ACCEPT: Record<string, string> = { PHOTO: 'image/*', AUDIO: 'audio/*', VIDEO: 'video/*' };
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;

function TestimonyMedia({ testimonyId, mediaType }: { testimonyId: string; mediaType: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    testimoniesApi
      .mediaUrl(token, testimonyId)
      .then((res) => setUrl(res.url))
      .catch(() => setError(true));
  }, [testimonyId]);

  if (error) return <p className="hint">Média indisponible.</p>;
  if (!url) return <p className="hint">Chargement du média…</p>;
  if (mediaType === 'PHOTO') return <img src={url} alt="Témoignage" className="testimony-media" />;
  if (mediaType === 'AUDIO') return <audio src={url} controls className="testimony-media" />;
  if (mediaType === 'VIDEO') return <video src={url} controls className="testimony-media" />;
  return null;
}

export function TestimoniesPage() {
  const token = getAccessToken();

  const [mediaType, setMediaType] = useState<string>('TEXT');
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  const [published, setPublished] = useState<Testimony[]>([]);
  const [pending, setPending] = useState<Testimony[]>([]);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [listError, setListError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [publishedPage, setPublishedPage] = useState(1);
  const [publishedTotalPages, setPublishedTotalPages] = useState(1);

  const refresh = () => {
    const currentToken = getAccessToken();
    if (!currentToken) return;
    setLoading(true);
    Promise.all([testimoniesApi.list(currentToken, undefined, publishedPage), testimoniesApi.list(currentToken, 'DRAFT')])
      .then(([pub, draft]) => {
        setPublished(pub.data);
        setPublishedTotalPages(pub.meta.totalPages);
        setPending(draft.data);
      })
      .catch((err) => setListError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [publishedPage]);

  const handleMediaTypeChange = (type: string) => {
    setMediaType(type);
    setMediaFile(null);
    setSubmitError(null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_MEDIA_SIZE_BYTES) {
      setSubmitError('Fichier trop lourd (25 Mo maximum).');
      setMediaFile(null);
      return;
    }
    setSubmitError(null);
    setMediaFile(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);
    setConfirmation(false);

    if (mediaType === 'TEXT' && !content.trim()) {
      setSubmitError('Écris ton témoignage.');
      return;
    }
    if (mediaType !== 'TEXT' && !mediaFile) {
      setSubmitError('Choisis un fichier.');
      return;
    }

    setSubmitting(true);
    try {
      let fileId: string | undefined;
      if (mediaFile) {
        const { file: stored, uploadUrl } = await filesApi.presign(token, {
          filename: mediaFile.name,
          mimeType: mediaFile.type,
          sizeBytes: mediaFile.size,
        });
        await filesApi.upload(uploadUrl, mediaFile);
        fileId = stored.id;
      }
      await testimoniesApi.create(token, { mediaType, content: content || undefined, fileId });
      setContent('');
      setMediaFile(null);
      setConfirmation(true);
      refresh();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    setActingId(id);
    try {
      await testimoniesApi.approve(token, id);
      if (publishedPage === 1) refresh();
      else setPublishedPage(1);
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!token || !rejectReason.trim()) return;
    setActingId(id);
    try {
      await testimoniesApi.reject(token, id, rejectReason.trim());
      setRejectingId(null);
      setRejectReason('');
      refresh();
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="testimonies-page">
      <h2>Témoignages</h2>

      {token ? (
        <form onSubmit={handleSubmit} className="request-form">
          <div className="confidentiality-picker">
            {MEDIA_TYPES.map((type) => (
              <label key={type}>
                <input
                  type="radio"
                  name="media-type"
                  value={type}
                  checked={mediaType === type}
                  onChange={() => handleMediaTypeChange(type)}
                />
                {MEDIA_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
          {mediaType === 'TEXT' ? (
            <textarea
              placeholder="Raconte ce que Dieu a fait…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
          ) : (
            <>
              <input type="file" accept={MEDIA_TYPE_ACCEPT[mediaType]} onChange={handleFileChange} />
              <textarea
                placeholder="Légende (facultatif)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={2}
              />
            </>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Envoi…' : 'Soumettre à modération'}
          </button>
        </form>
      ) : (
        <p className="hint">Connecte-toi pour partager un témoignage.</p>
      )}
      {submitError && <p className="error">{submitError}</p>}
      {confirmation && <p className="confirmation">Témoignage envoyé — en attente de validation par un modérateur.</p>}

      {loading && <p>Chargement…</p>}
      {listError && <p className="error">{listError}</p>}

      {pending.length > 0 && (
        <>
          <h3>En attente de modération</h3>
          <ul className="request-list">
            {pending.map((t) => (
              <li key={t.id} className="request-row">
                {t.content && <p>{t.content}</p>}
                {t.file_id && <TestimonyMedia testimonyId={t.id} mediaType={t.media_type} />}
                {t.ai_flagged && (
                  <p className="error">
                    ⚠ Signalé par l'IA Modératrice{t.ai_flag_reason ? ` — ${t.ai_flag_reason}` : ''}
                  </p>
                )}
                {rejectingId === t.id ? (
                  <div className="reject-row">
                    <input
                      type="text"
                      placeholder="Motif du rejet"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button disabled={actingId === t.id} onClick={() => handleReject(t.id)}>
                      Confirmer le rejet
                    </button>
                    <button type="button" onClick={() => setRejectingId(null)}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="reject-row">
                    <button disabled={actingId === t.id} onClick={() => handleApprove(t.id)}>
                      Approuver
                    </button>
                    <button type="button" onClick={() => setRejectingId(t.id)}>
                      Rejeter
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Témoignages publiés</h3>
      {published.length === 0 && !loading && <p className="hint">Aucun témoignage publié pour l'instant.</p>}
      <ul className="request-list">
        {published.map((t) => (
          <li key={t.id} className="request-row">
            {t.content && <p>{t.content}</p>}
            {t.file_id && <TestimonyMedia testimonyId={t.id} mediaType={t.media_type} />}
          </li>
        ))}
      </ul>
      <Pagination page={publishedPage} totalPages={publishedTotalPages} onChange={setPublishedPage} />
    </div>
  );
}

export default TestimoniesPage;
