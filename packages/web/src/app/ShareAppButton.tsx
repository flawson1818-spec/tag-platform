import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** The platform's public address: the site the member is using right now. */
function appUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/**
 * "Partager l'application": on a phone, the system share sheet (WhatsApp, SMS, Messenger,
 * e-mail… — the member picks the contacts); elsewhere, a small panel with WhatsApp, SMS,
 * e-mail, Facebook and "copy the link". Nothing is read from the contacts by the site.
 */
export function ShareAppButton({ variant = 'menu' }: { variant?: 'menu' | 'card' | 'icon' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Icon variant: the panel is placed on screen under the icon, never cut by the edge. */
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const url = appUrl();
  const message = t('share.message', { url });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const share = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Tour d'avant-garde", text: t('share.text'), url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // the member closed the sheet
      }
    }
    if (variant === 'icon' && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const width = 230;
      setPlace({ top: r.bottom + 6, left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)) });
    }
    setOpen((o) => !o);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('share.copyPrompt'), url);
    }
  };

  const enc = encodeURIComponent;
  const links = [
    { key: 'whatsapp', icon: '💬', href: `https://wa.me/?text=${enc(message)}` },
    { key: 'sms', icon: '📱', href: `sms:?&body=${enc(message)}` },
    { key: 'email', icon: '✉️', href: `mailto:?subject=${enc("Tour d'avant-garde")}&body=${enc(message)}` },
    { key: 'facebook', icon: '📘', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { key: 'telegram', icon: '✈️', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(t('share.text'))}` },
  ];

  return (
    <div className={`share-app share-app-${variant}`} ref={ref}>
      {variant === 'icon' ? (
        <button
          type="button"
          className="share-app-icon"
          onClick={share}
          aria-expanded={open}
          aria-label={t('share.button')}
          title={t('share.button')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        </button>
      ) : (
        <button type="button" className="share-app-button" onClick={share} aria-expanded={open}>
          <span aria-hidden="true">📤</span> {t('share.button')}
        </button>
      )}
      {variant === 'card' && <p className="hint">{t('share.hint')}</p>}
      {open && (
        <div
          className={`share-app-panel${variant === 'icon' ? ' is-floating' : ''}`}
          style={variant === 'icon' && place ? { top: place.top, left: place.left } : undefined}
          role="dialog" aria-label={t('share.button')}>
          {links.map((l) => (
            <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <span aria-hidden="true">{l.icon}</span> {t(`share.via.${l.key}`)}
            </a>
          ))}
          <button type="button" onClick={copy}>
            <span aria-hidden="true">🔗</span> {copied ? t('share.copied') : t('share.copy')}
          </button>
        </div>
      )}
    </div>
  );
}
