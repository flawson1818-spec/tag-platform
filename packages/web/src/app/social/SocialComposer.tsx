import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { FeedPost, PostKind, filesApi, socialApi } from '../../lib/api';
import { Avatar, KIND_ICONS } from './SocialPostCard';

const MAX_PHOTOS = 4;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 5 * 60;

/** The length of a video, read from the file itself. */
function videoSeconds(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => resolve(probe.duration);
    probe.onerror = () => resolve(0);
    probe.src = url;
  });
}

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
  const [video, setVideo] = useState<{ file: File; preview: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [communityId, setCommunityId] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'publishing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), [photos]);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.preview); }, [video]);
  useEffect(() => {
    if (open) textArea.current?.focus();
  }, [open, kind]);

  const start = (k: PostKind, pick: 'photos' | 'video' | null = null) => {
    setKind(k);
    setOpen(true);
    if (pick === 'photos') fileInput.current?.click();
    if (pick === 'video') videoInput.current?.click();
  };

  const addVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('video/')) return setError(t('social.onlyVideo'));
    if (file.size > MAX_VIDEO_BYTES) return setError(t('social.videoTooBig'));
    const preview = URL.createObjectURL(file);
    const seconds = await videoSeconds(preview);
    if (seconds > MAX_VIDEO_SECONDS) {
      URL.revokeObjectURL(preview);
      return setError(t('social.videoTooLong'));
    }
    setPhotos([]);
    setVideo({ file, preview });
    setOpen(true);
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
    setVideo(null);
    setProgress(0);
    setError(null);
  };

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || (!content.trim() && photos.length === 0 && !video)) return;
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
      let videoFileId: string | undefined;
      if (video) {
        const { file: stored, uploadUrl } = await filesApi.presign(token, {
          filename: video.file.name,
          mimeType: video.file.type,
          sizeBytes: video.file.size,
        });
        await filesApi.uploadWithProgress(uploadUrl, video.file, setProgress);
        videoFileId = stored.id;
      }
      setStatus('publishing');
      const post = await socialApi.createPost(token, {
        content: content.trim() || undefined,
        photoFileIds: photoFileIds.length ? photoFileIds : undefined,
        videoFileId,
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
      <input ref={videoInput} type="file" accept="video/*" onChange={addVideo} hidden />

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
            <button type="button" onClick={() => start('MESSAGE', 'photos')}>
              <span aria-hidden="true">📷</span> {t('composer.photo')}
            </button>
            <button type="button" className="composer-video-quick" onClick={() => start('MESSAGE', 'video')}>
              <span aria-hidden="true">🎬</span> {t('composer.video')}
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

          {video && (
            <div className="social-composer-video">
              <video src={video.preview} controls playsInline preload="metadata" />
              <button type="button" onClick={() => setVideo(null)} disabled={busy} aria-label={t('social.removeVideo')}>
                ×
              </button>
            </div>
          )}
          {status === 'uploading' && video && (
            <div className="social-upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div style={{ width: `${progress}%` }} />
              <span>{t('social.uploadingVideo', { percent: progress })}</span>
            </div>
          )}

          <div className="social-composer-bar">
            <button
              type="button"
              className="social-photo-pick"
              onClick={() => fileInput.current?.click()}
              disabled={busy || photos.length >= MAX_PHOTOS || Boolean(video)}
            >
              <span aria-hidden="true">📷</span> {t('social.addPhotos')} {photos.length > 0 && `(${photos.length}/${MAX_PHOTOS})`}
            </button>
            <button type="button" className="social-photo-pick" onClick={() => videoInput.current?.click()} disabled={busy || photos.length > 0}>
              <span aria-hidden="true">🎬</span> {t('composer.video')}
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
            <button type="submit" disabled={busy || (!content.trim() && photos.length === 0 && !video)}>
              {status === 'uploading' ? t('social.uploading') : status === 'publishing' ? t('social.publishing') : t('social.publish')}
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
