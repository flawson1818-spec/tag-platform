import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from './auth/AuthContext';
import { PUSH_SUPPORTED, pushTurnedOff, ringBell, subscribeDevice } from '../lib/push';

const DISMISSED_KEY = 'tag-push-prompt-dismissed';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Notifications on by default for whoever is signed in: when the browser already allows them the
 * device is registered silently (so a new phone or browser is never forgotten); otherwise a
 * single clear banner asks once. Also rings a bell when a push arrives while the app is open.
 */
export function PushPrompt() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !PUSH_SUPPORTED) return;
    const token = getAccessToken();
    if (!token) return;
    if (Notification.permission === 'granted') {
      if (!pushTurnedOff()) subscribeDevice(token, false).catch(() => undefined);
    } else if (Notification.permission === 'default' && !dismissedBefore()) {
      setOpen(true);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'push-received') ringBell();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  if (!open) return null;

  const enable = async () => {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await subscribeDevice(token, true);
      setOpen(false);
    } catch (err) {
      const code = (err as Error).message;
      setError(code === 'denied' ? t('notifications.permissionDenied') : code === 'not-configured' ? t('notifications.pushNotConfigured') : code);
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="push-prompt" role="dialog" aria-label={t('push.promptTitle')}>
      <span className="push-prompt-icon" aria-hidden="true">🔔</span>
      <div className="push-prompt-text">
        <strong>{t('push.promptTitle')}</strong>
        <span>{t('push.promptText')}</span>
        {error && <span className="error">{error}</span>}
      </div>
      <div className="push-prompt-actions">
        <button type="button" onClick={enable} disabled={busy}>{busy ? '…' : t('push.enable')}</button>
        <button type="button" className="link-button" onClick={later}>{t('push.later')}</button>
      </div>
    </div>
  );
}
