import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import {
  CONFIDENTIALITY_LEVELS,
  PRAYER_REQUEST_CATEGORIES,
  PrayerProgram,
  PrayerRequest,
  filesApi,
  prayerApi,
  prayerRequestsApi,
} from '../../lib/api';
import { Pagination } from '../Pagination';

const REQUEST_STATUSES = ['DRAFT', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED', 'ARCHIVED', 'RESTORED'];
const MODERATOR_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED', 'ARCHIVED', 'RESTORED'];

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

function RequestPhoto({ requestId }: { requestId: string }) {
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
  return <img src={url} alt="Demande de prière" className="testimony-media" />;
}

const CONFIDENTIALITY_LABELS: Record<string, string> = {
  ANONYMOUS: 'Anonyme',
  PRIVATE: 'Privé (modérateurs uniquement)',
  PUBLIC: 'Public',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  NEW: 'Nouveau',
  ASSIGNED: 'Assignée',
  IN_PROGRESS: 'En cours',
  WAITING: 'En attente',
  ANSWERED: 'Exaucée',
  ARCHIVED: 'Archivée',
  RESTORED: 'Restaurée',
};

export function PrayerRequestsPage() {
  const [category, setCategory] = useState<string>(PRAYER_REQUEST_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [confidentiality, setConfidentiality] = useState('ANONYMOUS');
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PrayerRequest | null>(null);

  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(() => Boolean(getAccessToken()));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [programs, setPrograms] = useState<PrayerProgram[]>([]);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteProgramId, setPromoteProgramId] = useState('');

  const refreshRequests = () => {
    const token = getAccessToken();
    if (!token) return;

    setListLoading(true);
    prayerRequestsApi
      .list(token, page, { status: statusFilter || undefined, category: categoryFilter || undefined })
      .then((res) => {
        setRequests(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setListError((err as Error).message))
      .finally(() => setListLoading(false));
  };

  useEffect(refreshRequests, [page, statusFilter, categoryFilter]);

  useEffect(() => {
    prayerApi
      .listPrograms()
      .then((res) => setPrograms(res.data))
      .catch(() => setPrograms([]));
  }, []);

  const handleFilterChange = (setter: (value: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (id: string, status: string) => {
    const token = getAccessToken();
    if (!token) return;
    prayerRequestsApi
      .updateStatus(token, id, status)
      .then(refreshRequests)
      .catch((err) => setListError((err as Error).message));
  };

  const handlePromote = (id: string) => {
    const token = getAccessToken();
    if (!token || !promoteProgramId) return;
    prayerRequestsApi
      .promote(token, id, promoteProgramId)
      .then(() => {
        setPromotingId(null);
        refreshRequests();
      })
      .catch((err) => setListError((err as Error).message));
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_PHOTO_SIZE_BYTES) {
      setSubmitError('Photo trop lourde (5 Mo maximum).');
      setPhoto(null);
      return;
    }
    setSubmitError(null);
    setPhoto(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setConfirmation(null);
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
      setConfirmation(created);
      setDescription('');
      setPhoto(null);
      if (token) {
        if (page === 1) {
          setRequests((prev) => [created, ...prev]);
        } else {
          setPage(1);
        }
      }
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="requests-page">
      <h2>Demandes de prière</h2>
      <p className="hint">
        Tout le monde peut déposer une demande, même sans compte. Sans connexion, elle reste anonyme.
      </p>

      <form onSubmit={handleSubmit} className="request-form">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {PRAYER_REQUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <textarea
          placeholder="Décris ta demande de prière…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          required
        />

        {getAccessToken() && (
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        )}

        <div className="confidentiality-picker">
          {CONFIDENTIALITY_LEVELS.map((level) => (
            <label key={level}>
              <input
                type="radio"
                name="confidentiality"
                value={level}
                checked={confidentiality === level}
                onChange={(e) => setConfidentiality(e.target.value)}
              />
              {CONFIDENTIALITY_LABELS[level]}
            </label>
          ))}
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </form>

      {submitError && <p className="error">{submitError}</p>}
      {confirmation && (
        <p className="confirmation">
          Demande envoyée — confidentialité retenue :{' '}
          <strong>{CONFIDENTIALITY_LABELS[confirmation.confidentiality]}</strong>
        </p>
      )}

      <h3>Demandes de la communauté</h3>
      {!getAccessToken() && <p className="hint">Connecte-toi pour voir les demandes déposées par les autres.</p>}

      {getAccessToken() && (
        <div className="inline-form">
          <label htmlFor="request-status-filter">Statut</label>
          <select id="request-status-filter" value={statusFilter} onChange={handleFilterChange(setStatusFilter)}>
            <option value="">Tous</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <label htmlFor="request-category-filter">Catégorie</label>
          <select id="request-category-filter" value={categoryFilter} onChange={handleFilterChange(setCategoryFilter)}>
            <option value="">Toutes</option>
            {PRAYER_REQUEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {listLoading && <p>Chargement…</p>}
      {listError && <p className="error">{listError}</p>}
      {requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r) => (
            <li key={r.id} className="request-row">
              <div className="request-meta">
                <span className="chip">{r.category}</span>
                <span className="chip chip-status">{STATUS_LABELS[r.status] ?? r.status}</span>
              </div>
              <p>{r.description}</p>
              {r.photo_file_id && <RequestPhoto requestId={r.id} />}

              <div className="request-form">
                {MODERATOR_STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button key={s} type="button" onClick={() => handleStatusChange(r.id, s)}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>

              {promotingId === r.id ? (
                <div className="request-form">
                  <select value={promoteProgramId} onChange={(e) => setPromoteProgramId(e.target.value)}>
                    <option value="">Choisir un programme…</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => handlePromote(r.id)} disabled={!promoteProgramId}>
                    Confirmer
                  </button>
                  <button type="button" className="link-button" onClick={() => setPromotingId(null)}>
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setPromotingId(r.id);
                    setPromoteProgramId('');
                  }}
                >
                  Transformer en sujet collectif (Modo)
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default PrayerRequestsPage;
