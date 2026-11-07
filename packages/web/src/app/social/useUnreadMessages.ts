import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { messagesApi } from '../../lib/api';

const POLL_MS = 45_000;

/** Unread private messages for the header badge: polled, and refreshed when the Messages page changes something. */
export function useUnreadMessages(enabled: boolean): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refresh = () => {
      const token = getAccessToken();
      if (!token) return;
      messagesApi
        .unread(token)
        .then((res) => !cancelled && setUnread(res.unread))
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener('tag:messages-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('tag:messages-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled]);

  return enabled ? unread : 0;
}
