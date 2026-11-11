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
export function ShareAppButton({ variant = 'menu' }: { variant?: 'menu' | 'card' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
      <button type="button" className="share-app-button" onClick={share} aria-expanded={open}>
        <span aria-hidden="true">📤</span> {t('share.button')}
      </button>
      {variant === 'card' && <p className="hint">{t('share.hint')}</p>}
      {open && (
        <div className="share-app-panel" role="dialog" aria-label={t('share.button')}>
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
