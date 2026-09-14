import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { AppNotification, notificationsApi, pushApi } from '../../lib/api';
import { Pagination } from '../Pagination';
import i18n from '../../i18n/config';

const PUSH_SUPPORTED = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function PushNotificationsToggle() {
  const { t } = useTranslation();
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
        setError(t('notifications.pushNotConfigured'));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError(t('notifications.permissionDenied'));
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

  if (!PUSH_SUPPORTED) return <p className="hint">{t('notifications.pushNotSupported')}</p>;
  if (!checked) return null;

  return (
    <div className="request-form">
      {subscription ? (
        <button onClick={handleDisable} disabled={busy}>
          {busy ? '…' : t('notifications.disablePush')}
        </button>
      ) : (
        <button onClick={handleEnable} disabled={busy}>
          {busy ? '…' : t('notifications.enablePush')}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function describe(notification: AppNotification): string {
  return i18n.t(`notificationTypes.${notification.type}`, notification.type);
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
    case 'PRAYER_REMINDER':
      return '/room';
    case 'EVENT_CREATED':
    case 'EVENT_REMINDER':
      return '/events';
    case 'PRAYER_TOPIC_STARTED':
      return '/room';
    default:
      return null;
  }
}

const FILTERS = [
  { value: '', key: 'all' },
  { value: 'DELIVERED', key: 'unread' },
  { value: 'READ', key: 'read' },
  { value: 'ARCHIVED', key: 'archived' },
];

export function NotificationsPage() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(() =>
    getAccessToken() ? null : i18n.t('notifications.needLogin'),
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
      <h2>{t('notifications.title')}</h2>

      {getAccessToken() && <PushNotificationsToggle />}

      <div className="request-form">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            disabled={filter === f.value}
            className={filter === f.value ? '' : 'link-button'}
          >
            {t(`notifications.filters.${f.key}`)}
          </button>
        ))}
        <button onClick={handleMarkAllRead}>{t('notifications.markAllRead')}</button>
      </div>

      {loading && <p>{t('notifications.loading')}</p>}
      {error && <p className="error">{error}</p>}

      <ul className="request-list">
        {notifications.map((n) => {
          const link = resourceLink(n);
          return (
            <li key={n.id} className="request-row">
              <div className="request-meta">
                <span className="chip">{t(`notificationStatuses.${n.status}`, n.status)}</span>
                <span className="hint">{new Date(n.created_at).toLocaleString(i18n.language)}</span>
              </div>
              <p>{describe(n)}</p>
              <div className="request-form">
                {link && <Link to={link}>{t('notifications.view')}</Link>}
                {n.status !== 'READ' && n.status !== 'ARCHIVED' && (
                  <button onClick={() => handleMarkRead(n.id)}>{t('notifications.markRead')}</button>
                )}
                {n.status !== 'ARCHIVED' && <button onClick={() => handleArchive(n.id)}>{t('notifications.archive')}</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && notifications.length === 0 && !error && <p className="hint">{t('notifications.noNotifications')}</p>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default NotificationsPage;
