import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { CONFIDENTIALITY_LEVELS, PRAYER_REQUEST_CATEGORIES, PrayerRequest, filesApi, prayerRequestsApi } from '../../lib/api';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export function RequestPhoto({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    prayerRequestsApi
      .mediaUrl(token, requestId, 'photo')
      .then((res) => setUrl(res.url))
      .catch(() => undefined);
  }, [requestId]);

  if (!url) return null;
  return <img src={url} alt={t('prayerRequests.photoAlt')} className="testimony-media" />;
}

/** Where a request stands, in words a member understands. */
export function RequestStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`chip chip-status status-${status.toLowerCase()}`}>{t(`requestStatuses.${status}`, status)}</span>;
}

/**
 * Asking for prayer: a member (or a visitor) deposits a request, and follows where it stands.
 * Requests are received only by the administration, which entrusts each one to intercessors —
 * members never browse other people's requests. An intercessor also finds here the requests
 * entrusted to them.
 */
export function PrayerRequestsPage() {
  const { t, i18n } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  const [category, setCategory] = useState<string>(PRAYER_REQUEST_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [confidentiality, setConfidentiality] = useState('PRIVATE');
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<PrayerRequest[]>([]);
  const [entrusted, setEntrusted] = useState<PrayerRequest[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !signedIn) return;
    prayerRequestsApi.listMine(token).then((res) => setMine(res.data)).catch(() => setMine([]));
    prayerRequestsApi.listAssignedToMe(token).then((res) => setEntrusted(res.data)).catch(() => setEntrusted([]));
  }, [signedIn]);

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_PHOTO_SIZE_BYTES) {
      setSubmitError(t('prayerRequests.photoTooLarge'));
      setPhoto(null);
      return;
    }
    setSubmitError(null);
    setPhoto(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSent(false);
    setSubmitting(true);
    const token = getAccessToken();
    try {
      let photoFileId: string | undefined;
      if (photo && token) {
        const { file: stored, uploadUrl } = await filesApi.presign(token, {
          filename: photo.name,
          mimeType: photo.type,
          sizeBytes: photo.size,
        });
        await filesApi.upload(uploadUrl, photo);
        photoFileId = stored.id;
      }
      const created = await prayerRequestsApi.create({ category, description, confidentiality, photoFileId }, token);
      setSent(true);
      setDescription('');
      setPhoto(null);
      // An anonymous request has no author: it can't appear in "Mes demandes".
      if (created.author_id) setMine((prev) => [created, ...prev]);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  return (
    <div className="requests-page">
      <section className="pr-ask">
        <h2>{t('prayerRequests.askTitle')}</h2>
        <p className="hint">{t('prayerRequests.askIntro')}</p>

        <form onSubmit={handleSubmit} className="pr-form">
          <label>
            {t('prayerRequests.categoryLabel')}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {PRAYER_REQUEST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`prayerCategories.${c}`, c)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('prayerRequests.yourRequest')}
            <textarea
              placeholder={t('prayerRequests.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
            />
          </label>

          {signedIn && (
            <label>
              {t('prayerRequests.photoOptional')}
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
          )}

          <fieldset className="confidentiality-picker">
            <legend>{t('prayerRequests.whoSees')}</legend>
            {CONFIDENTIALITY_LEVELS.map((level) => (
              <label key={level}>
                <input
                  type="radio"
                  name="confidentiality"
                  value={level}
                  checked={confidentiality === level}
                  onChange={(e) => setConfidentiality(e.target.value)}
                />
                <span>
                  <strong>{t(`confidentiality.${level}`)}</strong>
                  <span className="hint"> — {t(`prayerRequests.confidentialityHelp.${level}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <button type="submit" disabled={submitting}>
            {submitting ? t('prayerRequests.submitting') : t('prayerRequests.submit')}
          </button>
        </form>

        {submitError && <p className="error">{submitError}</p>}
        {sent && <p className="confirmation">{t('prayerRequests.sent')}</p>}
      </section>

      {signedIn ? (
        <>
          {entrusted.length > 0 && (
            <section className="pr-block pr-entrusted">
              <h3>{t('prayerRequests.entrustedTitle')}</h3>
              <p className="hint">{t('prayerRequests.entrustedIntro')}</p>
              <ul className="request-list">
                {entrusted.map((r) => (
                  <li key={r.id} className="request-row">
                    <div className="request-meta">
                      <span className="chip">{t(`prayerCategories.${r.category}`, r.category)}</span>
                      <RequestStatus status={r.status} />
                    </div>
                    <p>{r.description}</p>
                    {r.photo_file_id && <RequestPhoto requestId={r.id} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="pr-block">
            <h3>{t('prayerRequests.mineTitle')}</h3>
            {mine.length === 0 ? (
              <p className="hint">{t('prayerRequests.mineEmpty')}</p>
            ) : (
              <ul className="request-list">
                {mine.map((r) => (
                  <li key={r.id} className="request-row">
                    <div className="request-meta">
                      <span className="chip">{t(`prayerCategories.${r.category}`, r.category)}</span>
                      <RequestStatus status={r.status} />
                      <span className="hint">{when(r.created_at)}</span>
                    </div>
                    <p>{r.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="hint">
          {t('prayerRequests.loginToFollow')} <Link to="/login">{t('nav.login')}</Link>
        </p>
      )}
    </div>
  );
}

export default PrayerRequestsPage;
