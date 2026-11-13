import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PrayerSlot } from '../../lib/api';
import { readingPlan } from './roomReading';

const PAUSE_BETWEEN_READINGS_MS = 6000;

/**
 * "L'IA lit la prière": the segment running in the room is read aloud by the device's own voice
 * (no recording, nothing sent anywhere) — a prayer request first, its verse, then the prayer —
 * and read again and again until the next segment. Each member turns it on for themselves.
 */
export function RoomReader({ slot }: { slot: PrayerSlot | null }) {
  const { t, i18n } = useTranslation();
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [on, setOn] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const lang = i18n.language.slice(0, 2);
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
      voiceRef.current = voices.find((v) => /google|natural|premium|enhanced/i.test(v.name)) ?? voices[0] ?? null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick);
  }, [supported, i18n.language]);

  const slotKey = slot ? `${slot.id}|${slot.guided_text ?? ''}|${slot.bible_references.join('|')}` : '';

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (!on || !slot || slot.kind === 'WORSHIP') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const plan = readingPlan(slot);

    const speak = (parts: string[], index: number) => {
      if (stopped) return;
      if (index >= parts.length) {
        setReading(null);
        timer = setTimeout(() => speak(plan.again, 0), PAUSE_BETWEEN_READINGS_MS);
        return;
      }
      const u = new SpeechSynthesisUtterance(parts[index]);
      u.lang = voiceRef.current?.lang ?? i18n.language;
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 0.92;
      u.onend = () => speak(parts, index + 1);
      u.onerror = () => speak(parts, index + 1);
      setReading(parts[index]);
      synth.speak(u);
    };
    speak(plan.first, 0);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      synth.cancel();
    };
    // slotKey stands for the slot's readable content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, slotKey, supported]);

  if (!supported) return null;

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
