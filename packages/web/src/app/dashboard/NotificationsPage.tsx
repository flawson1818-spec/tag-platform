import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '../auth/AuthContext';
import { AppNotification, notificationsApi, pushApi } from '../../lib/api';
import { Pagination } from '../Pagination';

const PUSH_SUPPORTED = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function PushNotificationsToggle() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscription(sub))
      .catch(() => undefined)
      .finally(() => setChecked(true));
  }, []);

  const handleEnable = async () => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const { publicKey } = await pushApi.vapidPublicKey();
      if (!publicKey) {
        setError('Notifications push non configurées sur ce déploiement.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Autorisation refusée.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await pushApi.register(token, JSON.stringify(sub));
      setSubscription(sub);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    const token = getAccessToken();
    if (!token || !subscription) return;
    setError(null);
    setBusy(true);
    try {
      await pushApi.unregister(token, JSON.stringify(subscription));
      await subscription.unsubscribe();
      setSubscription(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!PUSH_SUPPORTED) return <p className="hint">Notifications push non prises en charge par ce navigateur.</p>;
  if (!checked) return null;

  return (
    <div className="request-form">
      {subscription ? (
        <button onClick={handleDisable} disabled={busy}>
          {busy ? '…' : 'Désactiver les notifications push'}
        </button>
      ) : (
        <button onClick={handleEnable} disabled={busy}>
          {busy ? '…' : 'Activer les notifications push'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  TESTIMONY_PUBLISHED: 'Ton témoignage a été publié',
  TESTIMONY_REJECTED: 'Ton témoignage a été refusé',
  PRAYER_REQUEST_ANSWERED: 'Ta demande de prière a une réponse',
  AI_CRISIS_ESCALATION: "Alerte IA : un utilisateur pourrait être en situation de crise",
  AI_USER_AUTO_MUTED: "IA Modératrice : un utilisateur a été mis en sourdine automatiquement",
};

function describe(notification: AppNotification): string {
  return TYPE_LABELS[notification.type] ?? notification.type;
}

/**
 * Neither testimonies nor prayer requests have an individual detail route (only their list
 * pages do), so "lien direct vers la ressource" (docs/07_UX_UI_SPECIFICATION.md §11) points at
 * the relevant list rather than a resource page that doesn't exist yet.
 */
function resourceLink(notification: AppNotification): string | null {
  switch (notification.type) {
    case 'TESTIMONY_PUBLISHED':
    case 'TESTIMONY_REJECTED':
      return '/testimonies';
    case 'PRAYER_REQUEST_ANSWERED':
      return '/prayer-requests';
    case 'AI_CRISIS_ESCALATION':
      return '/admin/users';
    case 'AI_USER_AUTO_MUTED':
      return '/room';
    default:
      return null;
  }
}

const FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'DELIVERED', label: 'Non lues' },
  { value: 'READ', label: 'Lues' },
  { value: 'ARCHIVED', label: 'Archivées' },
];

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(() =>
    getAccessToken() ? null : 'Connecte-toi pour voir tes notifications.',
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    notificationsApi
      .list(token, filter || undefined, page)
      .then((res) => {
        setNotifications(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [filter, page]);

  const handleFilterChange = (value: string) => {
    setFilter(value);
    setPage(1);
  };

  const handleMarkRead = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    notificationsApi.markRead(token, id).then(refresh).catch((err) => setError((err as Error).message));
  };

  const handleArchive = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    notificationsApi.archive(token, id).then(refresh).catch((err) => setError((err as Error).message));
  };

  const handleMarkAllRead = () => {
    const token = getAccessToken();
    if (!token) return;
    notificationsApi.markAllRead(token).then(refresh).catch((err) => setError((err as Error).message));
  };

  return (
    <div className="communities-page">
      <h2>Notifications</h2>

      {getAccessToken() && <PushNotificationsToggle />}

      <div className="request-form">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            disabled={filter === f.value}
            className={filter === f.value ? '' : 'link-button'}
          >
            {f.label}
          </button>
        ))}
        <button onClick={handleMarkAllRead}>Tout marquer comme lu</button>
      </div>

      {loading && <p>Chargement…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {notifications.map((n) => {
          const link = resourceLink(n);
          return (
            <li key={n.id} className="request-row">
              <div className="request-meta">
                <span className="chip">{n.status}</span>
                <span className="hint">{new Date(n.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <p>{describe(n)}</p>
              <div className="request-form">
                {link && <Link to={link}>Voir</Link>}
                {n.status !== 'READ' && n.status !== 'ARCHIVED' && (
                  <button onClick={() => handleMarkRead(n.id)}>Marquer comme lue</button>
                )}
                {n.status !== 'ARCHIVED' && <button onClick={() => handleArchive(n.id)}>Archiver</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && notifications.length === 0 && !error && <p className="hint">Aucune notification.</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default NotificationsPage;
