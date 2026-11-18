import { pushApi } from './api';

export const PUSH_SUPPORTED = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const OFF_KEY = 'tag-push-off';

/** The member turned notifications off on purpose: never turn them back on silently. */
export function pushTurnedOff(value?: boolean): boolean {
  try {
    if (value === true) localStorage.setItem(OFF_KEY, '1');
    else if (value === false) localStorage.removeItem(OFF_KEY);
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/** Subscribes this device and tells the server. Throws a French-ready message code on failure. */
export async function subscribeDevice(accessToken: string, askPermission: boolean): Promise<PushSubscription | null> {
  if (!PUSH_SUPPORTED) return null;
  const { publicKey } = await pushApi.vapidPublicKey();
  if (!publicKey) throw new Error('not-configured');
  if (Notification.permission === 'default' && askPermission) await Notification.requestPermission();
  if (Notification.permission !== 'granted') {
    if (askPermission) throw new Error('denied');
    return null;
  }
  if (askPermission) pushTurnedOff(false);
  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
  await pushApi.register(accessToken, JSON.stringify(sub));
  return sub;
}

let audio: AudioContext | null = null;

/** A short two-note bell, for a call to prayer or a message while the app is open. */
export function ringBell(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    [660, 880, 660, 880].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      const t0 = audio!.currentTime + i * 0.28;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  } catch {
    /* no sound available: the banner still shows */
  }
}
