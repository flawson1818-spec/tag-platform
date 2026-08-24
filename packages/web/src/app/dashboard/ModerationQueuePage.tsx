import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { FlaggedPrayerRequest, Testimony, prayerRequestsApi, testimoniesApi } from '../../lib/api';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ModerationQueuePage() {
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [requests, setRequests] = useState<FlaggedPrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([testimoniesApi.listFlagged(token), prayerRequestsApi.listFlagged(token)])
      .then(([t, r]) => {
        setTestimonies(t);
        setRequests(r);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (!getAccessToken()) return <p className="hint">Connecte-toi avec un compte modérateur.</p>;

  return (
    <div className="communities-page">
      <h2>Contenus signalés</h2>
      <p className="hint">
        Signalés par l'IA Modératrice (texte, cohérence, contenu sensible) — l'IA n'exclut ni ne supprime
        jamais rien elle-même, chaque signalement attend une revue humaine. Le chat n'apparaît pas ici : un
        message jugé critique est mis en quarantaine automatiquement et immédiatement dans la salle.
      </p>
      {loading && <p>Chargement…</p>}
      {error && <p className="error">{error}</p>}

      <h3>Témoignages ({testimonies.length})</h3>
      {testimonies.length === 0 && !loading && <p className="hint">Aucun témoignage signalé.</p>}
      <ul className="request-list">
        {testimonies.map((t) => (
          <li key={t.id} className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{t.status}</span>
              <span className="hint">{formatDateTime(t.created_at)}</span>
            </div>
            <p>{t.content}</p>
            <p className="error">
              ⚠ {t.ai_flag_reason ?? 'Signalé sans motif précis'}
              {t.ai_flag_confidence !== null ? ` (confiance ${Math.round(t.ai_flag_confidence * 100)}%)` : ''}
            </p>
          </li>
        ))}
      </ul>

      <h3>Demandes de prière ({requests.length})</h3>
      {requests.length === 0 && !loading && <p className="hint">Aucune demande signalée.</p>}
      <ul className="request-list">
        {requests.map((r) => (
          <li key={r.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{r.category}</span>
              <span className="chip chip-status">{r.status}</span>
              <span className="hint">{formatDateTime(r.created_at)}</span>
            </div>
            <p>{r.description}</p>
            <p className="error">
              ⚠ {r.ai_flag_reason ?? 'Signalé sans motif précis'}
              {r.ai_flag_confidence !== null ? ` (confiance ${Math.round(r.ai_flag_confidence * 100)}%)` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ModerationQueuePage;
