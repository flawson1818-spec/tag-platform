import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlotSpeech, speechApi } from '../../lib/api';

const PAUSE_BETWEEN_PARTS_MS = 1400;
const PAUSE_BETWEEN_READINGS_MS = 7000;
/** The most natural device voices, when the server has no neural voice. */
const NATURAL = /natural|neural|online|premium|enhanced|google|siri|wavenet/i;

/**
 * "L'IA lit la prière": the segment is read aloud — a natural (neural) voice from the server
 * when available, the device's best voice otherwise — in the visitor's language, as a prayer is
 * read: a request first, its verse, then the prayer, with silences between, again and again.
 */
export function RoomReader({ slotId, speech, kind }: { slotId: string; speech: SlotSpeech | null; kind?: string }) {
  const { t } = useTranslation();
  const supported = typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined');
  const [on, setOn] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lang = speech?.lang ?? 'fr';

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
      voiceRef.current = voices.find((v) => NATURAL.test(v.name)) ?? voices.find((v) => v.localService === false) ?? voices[0] ?? null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick);
  }, [lang]);

  const partsKey = speech ? `${slotId}|${speech.lang}|${speech.parts.join('|')}` : '';

  useEffect(() => {
    if (!on || !speech || kind === 'WORSHIP' || speech.parts.length === 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let audio: HTMLAudioElement | null = null;
    let neural = speech.neural;
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

    const next = (i: number) => {
      if (stopped) return;
      if (i >= speech.parts.length) {
        setReading(null);
        timer = setTimeout(() => next(0), PAUSE_BETWEEN_READINGS_MS);
        return;
      }
      const text = speech.parts[i];
      setReading(text);
      const after = () => {
        if (!stopped) timer = setTimeout(() => next(i + 1), PAUSE_BETWEEN_PARTS_MS);
      };
      const viaDevice = () => {
        if (!synth) return after();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voiceRef.current?.lang ?? lang;
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 0.88;
        u.pitch = 0.95;
        u.onend = after;
        u.onerror = after;
        synth.speak(u);
      };
      if (!neural) return viaDevice();
      audio = new Audio(speechApi.audioUrl(slotId, i, speech.lang));
      audio.onended = after;
      audio.onerror = () => {
        neural = false; // no natural voice right now: the device reads, without a gap
        viaDevice();
      };
      audio.play().catch(() => {
        neural = false;
        viaDevice();
      });
    };
    next(0);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      audio?.pause();
      synth?.cancel();
    };
    // partsKey stands for what is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, partsKey, kind]);

  if (!supported || kind === 'WORSHIP') return null;

  return (
    <div className={`room-reader${on ? ' is-on' : ''}`}>
      <button type="button" className="room-reader-toggle" onClick={() => setOn(!on)} aria-pressed={on}>
        <span aria-hidden="true">{on ? '🔇' : '🔊'}</span> {on ? t('room.reader.stop') : t('room.reader.start')}
      </button>
      {on && (
        <p className="room-reader-now" aria-live="polite">
          {reading ? t('room.reader.reading', { text: reading.length > 90 ? `${reading.slice(0, 89)}…` : reading }) : t('room.reader.pause')}
        </p>
      )}
    </div>
  );
}
