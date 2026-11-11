import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { FeedPost, PostKind, filesApi, socialApi } from '../../lib/api';
import { Avatar, KIND_ICONS } from './SocialPostCard';

const MAX_PHOTOS = 4;
const MAX_BYTES = 25 * 1024 * 1024;

const KINDS: PostKind[] = ['MESSAGE', 'EXPERIENCE', 'WRITING'];

interface Props {
  communities: { id: string; name: string }[];
  onPublished: (post: FeedPost) => void;
  /** On a group's page: everything published goes to that group. */
  fixedCommunity?: { id: string; name: string };
  avatarUrl?: string | null;
}

/**
 * "Quoi de neuf ?" — closed, a single line inviting to share (like any social network); open, the
 * kind of post (message, experience, writing), the text, up to 4 photos, and where it goes.
 */
export function SocialComposer({ communities, onPublished, fixedCommunity, avatarUrl }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PostKind>('MESSAGE');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [communityId, setCommunityId] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'publishing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), [photos]);
  useEffect(() => {
    if (open) textArea.current?.focus();
  }, [open, kind]);

  const start = (k: PostKind, pickPhotos = false) => {
    setKind(k);
    setOpen(true);
    if (pickPhotos) fileInput.current?.click();
  };

  const addPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);
    if (picked.some((f) => !f.type.startsWith('image/'))) setError(t('social.onlyImages'));
    if (picked.some((f) => f.size > MAX_BYTES)) setError(t('social.tooBig'));
    const ok = picked.filter((f) => f.type.startsWith('image/') && f.size <= MAX_BYTES);
    if (photos.length + ok.length > MAX_PHOTOS) setError(t('social.tooManyPhotos'));
    setPhotos((prev) => [...prev, ...ok.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
    if (ok.length) setOpen(true);
  };

  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const close = () => {
    setOpen(false);
    setContent('');
    setPhotos([]);
    setError(null);
  };

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
        communityId: fixedCommunity?.id ?? (communityId || undefined),
        kind,
      });
      onPublished(post);
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus('idle');
    }
  };

  const busy = status !== 'idle';
  const firstName = (user?.display_name ?? '').split(' ')[0];

  return (
    <form className={`social-composer${open ? ' is-open' : ''}`} onSubmit={publish}>
      <input ref={fileInput} type="file" accept="image/*" multiple onChange={addPhotos} hidden />

      {!open ? (
        <>
          <div className="composer-closed">
            <Avatar name={user?.display_name ?? '?'} url={avatarUrl ?? null} size={40} />
            <button type="button" className="composer-invite" onClick={() => start('MESSAGE')}>
              {fixedCommunity
                ? t('composer.inviteGroup', { name: fixedCommunity.name })
                : t('composer.invite', { name: firstName })}
            </button>
          </div>
          <div className="composer-quick">
            <button type="button" onClick={() => start('MESSAGE', true)}>
              <span aria-hidden="true">📷</span> {t('composer.photo')}
            </button>
            <button type="button" onClick={() => start('EXPERIENCE')}>
              <span aria-hidden="true">✨</span> {t('composer.kinds.EXPERIENCE')}
            </button>
            <button type="button" onClick={() => start('WRITING')}>
              <span aria-hidden="true">📖</span> {t('composer.kinds.WRITING')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="composer-kinds" role="radiogroup" aria-label={t('composer.kindLabel')}>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={kind === k ? 'is-on' : ''}
                onClick={() => setKind(k)}
              >
                <span aria-hidden="true">{KIND_ICONS[k]}</span> {t(`composer.kinds.${k}`)}
              </button>
            ))}
          </div>
          <textarea
            ref={textArea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={5000}
            rows={kind === 'WRITING' ? 8 : 4}
            placeholder={t(`composer.placeholders.${kind}`)}
            aria-label={t(`composer.placeholders.${kind}`)}
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
            <button
              type="button"
              className="social-photo-pick"
              onClick={() => fileInput.current?.click()}
              disabled={busy || photos.length >= MAX_PHOTOS}
            >
              <span aria-hidden="true">📷</span> {t('social.addPhotos')} {photos.length > 0 && `(${photos.length}/${MAX_PHOTOS})`}
            </button>
            {fixedCommunity ? (
              <span className="hint">{t('social.inCommunity', { name: fixedCommunity.name })}</span>
            ) : (
              communities.length > 0 && (
                <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} aria-label={t('social.publishTo')}>
                  <option value="">{t('composer.toEveryone')}</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t('composer.toGroup', { name: c.name })}
                    </option>
                  ))}
                </select>
              )
            )}
            <span className="composer-spacer" />
            <button type="button" className="link-button" onClick={close} disabled={busy}>
              {t('composer.cancel')}
            </button>
            <button type="submit" disabled={busy || (!content.trim() && photos.length === 0)}>
              {status === 'uploading' ? t('social.uploading') : status === 'publishing' ? t('social.publishing') : t('social.publish')}
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
