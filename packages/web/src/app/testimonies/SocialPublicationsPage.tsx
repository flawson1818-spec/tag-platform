import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { SocialPublication, SocialPublicationChannelSetting, socialPublicationsApi } from '../../lib/api';
import { Pagination } from '../Pagination';

export function SocialPublicationsPage() {
  const token = getAccessToken();
  const [drafts, setDrafts] = useState<SocialPublication[]>([]);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [channelSettings, setChannelSettings] = useState<SocialPublicationChannelSetting[] | null>(null);
  const [togglingChannel, setTogglingChannel] = useState<string | null>(null);

  useEffect(() => {
    const currentToken = getAccessToken();
    if (!currentToken) return;
    socialPublicationsApi
      .listChannelSettings(currentToken)
      .then(setChannelSettings)
      .catch(() => setChannelSettings(null)); // likely a permission 403 — this section is opt-in for admins
  }, []);

  const toggleAutoPublish = async (channel: string, next: boolean) => {
    const currentToken = getAccessToken();
    if (!currentToken) return;
    setTogglingChannel(channel);
    try {
      const updated = await socialPublicationsApi.setChannelAutoPublish(currentToken, channel, next);
      setChannelSettings((prev) => prev?.map((s) => (s.channel === channel ? updated : s)) ?? prev);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTogglingChannel(null);
    }
  };

  const refresh = () => {
    const currentToken = getAccessToken();
    if (!currentToken) return;
    setLoading(true);
    socialPublicationsApi
      .list(currentToken, 'DRAFT', page)
      .then((res) => {
        setDrafts(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (!token) return;
    setActingId(id);
    try {
      await (action === 'approve' ? socialPublicationsApi.approve(token, id) : socialPublicationsApi.reject(token, id));
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  if (!token) return <p className="hint">Connecte-toi pour voir les brouillons de publication.</p>;
  if (loading) return <p>Chargement…</p>;

  return (
    <div className="testimonies-page">
      <h2>Brouillons de publication</h2>
      <p className="hint">
        Générés automatiquement par l'IA Communication à chaque témoignage approuvé — un brouillon par
        réseau, toujours soumis à validation humaine avant envoi, sauf canal en mode auto-publish ci-dessous.
      </p>
      {error && <p className="error">{error}</p>}

      {channelSettings && (
        <div className="panel-section">
          <h3>Auto-publish par canal</h3>
          <p className="hint">
            Réservé au Super Administrateur. Un canal activé ici publie ses brouillons directement,
            sans passer par cette file d'attente.
          </p>
          <ul className="channel-settings-list">
            {channelSettings.map((s) => (
              <li key={s.channel} className="channel-settings-row">
                <span>{s.channel}</span>
                <button
                  type="button"
                  className={s.auto_publish ? 'active' : ''}
                  disabled={togglingChannel === s.channel}
                  onClick={() => toggleAutoPublish(s.channel, !s.auto_publish)}
                >
                  {s.auto_publish ? 'Auto-publish activé' : 'Auto-publish désactivé'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {drafts.length === 0 && <p className="hint">Aucun brouillon en attente.</p>}
      <ul className="request-list">
        {drafts.map((d) => (
          <li key={d.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{d.channel}</span>
            </div>
            <p>{d.draft_content}</p>
            <div className="reject-row">
              <button disabled={actingId === d.id} onClick={() => act(d.id, 'approve')}>
                Approuver
              </button>
              <button type="button" disabled={actingId === d.id} onClick={() => act(d.id, 'reject')}>
                Rejeter
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default SocialPublicationsPage;
