import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A video in the feed, the way people expect it today: it starts by itself, muted, when most of
 * it is on screen, and pauses when you scroll away. One tap on the sound button turns the sound
 * on; the usual controls (pause, seek, full screen) stay available.
 */
export function PostVideo({ src }: { src: string }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) void el.play().catch(() => undefined);
        else el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  if (failed) return <p className="hint">{t('social.videoFailed')}</p>;

  return (
    <div className="post-video">
      <video
        ref={video}
        src={`${src}#t=0.1`}
        muted={muted}
        loop
        playsInline
        controls
        preload="metadata"
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        className="post-video-sound"
        onClick={() => {
          const next = !muted;
          setMuted(next);
          if (video.current) video.current.muted = next;
        }}
        aria-pressed={!muted}
        aria-label={muted ? t('social.soundOn') : t('social.soundOff')}
      >
        <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      </button>
    </div>
  );
}
