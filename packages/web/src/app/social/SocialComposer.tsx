import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { FeedPost, filesApi, socialApi } from '../../lib/api';

const MAX_PHOTOS = 4;
const MAX_BYTES = 25 * 1024 * 1024;

interface Props {
  communities: { id: string; name: string }[];
  onPublished: (post: FeedPost) => void;
}

/** "Partage une grâce…": text, up to 4 photos, and where to publish it. */
export function SocialComposer({ communities, onPublished }: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [communityId, setCommunityId] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'publishing'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), [photos]);

  const addPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);
    if (picked.some((f) => !f.type.startsWith('image/'))) setError(t('social.onlyImages'));
    if (picked.some((f) => f.size > MAX_BYTES)) setError(t('social.tooBig'));
    const ok = picked.filter((f) => f.type.startsWith('image/') && f.size <= MAX_BYTES);
    if (photos.length + ok.length > MAX_PHOTOS) setError(t('social.tooManyPhotos'));
    setPhotos((prev) =>
      [...prev, ...ok.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS),
    );
  };

  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || (!content.trim() && photos.length === 0)) return;
    setError(null);
    try {
      setStatus('uploading');
      const photoFileIds: string[] = [];
      for (const { file } of photos) {
        const { file: stored, uploadUrl } = await filesApi.presign(token, {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        await filesApi.upload(uploadUrl, file);
        photoFileIds.push(stored.id);
      }
      setStatus('publishing');
      const post = await socialApi.createPost(token, {
        content: content.trim() || undefined,
        photoFileIds: photoFileIds.length ? photoFileIds : undefined,
        communityId: communityId || undefined,
      });
      onPublished(post);
      setContent('');
      setPhotos([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus('idle');
    }
  };

  const busy = status !== 'idle';

  return (
    <form className="social-composer" onSubmit={publish}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={5000}
        rows={3}
        placeholder={t('social.composerPlaceholder')}
        aria-label={t('social.composerPlaceholder')}
      />

      {photos.length > 0 && (
        <div className="social-composer-previews">
          {photos.map((p, i) => (
            <div key={p.preview} className="social-composer-thumb">
              <img src={p.preview} alt="" />
              <button type="button" onClick={() => removePhoto(i)} aria-label={t('social.removePhoto')}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="social-composer-bar">
        <label className={`social-photo-pick${photos.length >= MAX_PHOTOS ? ' is-disabled' : ''}`}>
          <span aria-hidden="true">📷</span> {t('social.addPhotos')}
          <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={busy || photos.length >= MAX_PHOTOS} hidden />
        </label>
        {communities.length > 0 && (
          <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} aria-label={t('social.publishTo')}>
            <option value="">{t('social.everyone')}</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" disabled={busy || (!content.trim() && photos.length === 0)}>
          {status === 'uploading' ? t('social.uploading') : status === 'publishing' ? t('social.publishing') : t('social.publish')}
        </button>
      </div>
      <p className="hint">{t('social.photosHint')}</p>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
