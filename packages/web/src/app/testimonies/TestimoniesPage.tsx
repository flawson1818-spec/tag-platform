import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { Testimony, filesApi, testimoniesApi } from '../../lib/api';
import { Pagination } from '../Pagination';

const MEDIA_TYPES = ['TEXT', 'PHOTO', 'AUDIO', 'VIDEO'] as const;
const MEDIA_TYPE_ACCEPT: Record<string, string> = { PHOTO: 'image/*', AUDIO: 'audio/*', VIDEO: 'video/*' };
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;

function TestimonyMedia({ testimonyId, mediaType }: { testimonyId: string; mediaType: string }) {
  const { t } = useTranslation();
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

  if (error) return <p className="hint">{t('testimonies.mediaUnavailable')}</p>;
  if (!url) return <p className="hint">{t('testimonies.mediaLoading')}</p>;
  if (mediaType === 'PHOTO') return <img src={url} alt={t('testimonies.mediaAlt')} className="testimony-media" />;
  if (mediaType === 'AUDIO') return <audio src={url} controls className="testimony-media" />;
  if (mediaType === 'VIDEO') return <video src={url} controls className="testimony-media" />;
  return null;
}

export function TestimoniesPage() {
  const { t } = useTranslation();
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
      setSubmitError(t('testimonies.fileTooLarge'));
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
      setSubmitError(t('testimonies.writeYours'));
      return;
    }
    if (mediaType !== 'TEXT' && !mediaFile) {
      setSubmitError(t('testimonies.chooseFile'));
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
      <h2>{t('testimonies.title')}</h2>

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
                {t(`testimonies.mediaType.${type}`)}
              </label>
            ))}
          </div>
          {mediaType === 'TEXT' ? (
            <textarea
              placeholder={t('testimonies.contentPlaceholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
          ) : (
            <>
              <input type="file" accept={MEDIA_TYPE_ACCEPT[mediaType]} onChange={handleFileChange} />
              <textarea
                placeholder={t('testimonies.captionPlaceholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={2}
              />
            </>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? t('testimonies.submitting') : t('testimonies.submit')}
          </button>
        </form>
      ) : (
        <p className="hint">{t('testimonies.loginToShare')}</p>
      )}
      {submitError && <p className="error">{submitError}</p>}
      {confirmation && <p className="confirmation">{t('testimonies.confirmation')}</p>}

      {loading && <p>{t('testimonies.loading')}</p>}
      {listError && <p className="error">{listError}</p>}

      {pending.length > 0 && (
        <>
          <h3>{t('testimonies.pendingTitle')}</h3>
          <ul className="request-list">
            {pending.map((item) => (
              <li key={item.id} className="request-row">
                {item.content && <p>{item.content}</p>}
                {item.file_id && <TestimonyMedia testimonyId={item.id} mediaType={item.media_type} />}
                {item.ai_flagged && (
                  <p className="error">
                    {t('testimonies.aiFlagged')}{item.ai_flag_reason ? ` — ${item.ai_flag_reason}` : ''}
                  </p>
                )}
                {rejectingId === item.id ? (
                  <div className="reject-row">
                    <input
                      type="text"
                      placeholder={t('testimonies.rejectReasonPlaceholder')}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button disabled={actingId === item.id} onClick={() => handleReject(item.id)}>
                      {t('testimonies.confirmReject')}
                    </button>
                    <button type="button" onClick={() => setRejectingId(null)}>
                      {t('testimonies.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="reject-row">
                    <button disabled={actingId === item.id} onClick={() => handleApprove(item.id)}>
                      {t('testimonies.approve')}
                    </button>
                    <button type="button" onClick={() => setRejectingId(item.id)}>
                      {t('testimonies.reject')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>{t('testimonies.publishedTitle')}</h3>
      {published.length === 0 && !loading && <p className="hint">{t('testimonies.noPublished')}</p>}
      <ul className="request-list">
        {published.map((item) => (
          <li key={item.id} className="request-row">
            {item.content && <p>{item.content}</p>}
            {item.file_id && <TestimonyMedia testimonyId={item.id} mediaType={item.media_type} />}
          </li>
        ))}
      </ul>
      <Pagination page={publishedPage} totalPages={publishedTotalPages} onChange={setPublishedPage} />
    </div>
  );
}

export default TestimoniesPage;
