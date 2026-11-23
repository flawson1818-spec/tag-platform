/**
 * Keeps an installed app up to date: the service worker is looked up again each time the app
 * comes back to the screen and every hour; when a new version takes over, the page is told so a
 * banner can offer to reload. (A phone keeps an installed app open in the background for days.)
 */
const listeners = new Set<() => void>();

export function onUpdateAvailable(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startUpdateWatcher(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let notified = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || notified) return; // first visit: nothing to update
    notified = true;
    listeners.forEach((l) => l());
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        const check = () => reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
        window.addEventListener('online', check);
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => undefined);
  });

  // A stale tab asking for a file a newer version removed: reload once to pick the new version.
  window.addEventListener('vite:preloadError', () => {
    try {
      if (sessionStorage.getItem('tag-reloaded') === '1') return;
      sessionStorage.setItem('tag-reloaded', '1');
    } catch {
      /* reload anyway */
    }
    window.location.reload();
  });
}
