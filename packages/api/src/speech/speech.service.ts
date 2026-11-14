import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrayerSlotsService } from '../prayer/prayer-slots.service';
import { PrayerRealtimeGateway } from '../prayer/prayer-realtime.gateway';
import { PrayerSlot } from '../prayer/prayer-slot.entity';
import { readingParts, splitVerse } from './spoken';

export const SPEECH_LANGS = ['fr', 'en', 'es', 'pt'] as const;
export type SpeechLang = (typeof SPEECH_LANGS)[number];

const LOCALES: Record<SpeechLang, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR' };
const BUCKET = 'tag-files';
const TTS_URL = 'https://texttospeech.googleapis.com/v1';
const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface SlotSpeech {
  lang: SpeechLang;
  translated: boolean;
  title: string;
  guidedText: string | null;
  verses: { reference: string; text: string }[];
  /** What is read aloud, in order, then read again. */
  parts: string[];
  /** A natural (neural) voice is available for these parts. */
  neural: boolean;
}

/**
 * Reading and translating the prayer room (Google Cloud: Text-to-Speech + Translation, one API
 * key GOOGLE_CLOUD_API_KEY). Every translation and every audio is made once and kept (table
 * speech_translations, files tts/… in storage); a monthly budget keeps it inside Google's free
 * tier. Without a key: the room stays in French and the device's own voice reads it.
 */
@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly memory = new Map<string, string>();
  private readonly voices = new Map<string, { name: string; rate: boolean } | null>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly slotsService: PrayerSlotsService,
    private readonly gateway: PrayerRealtimeGateway,
  ) {}

  private get key(): string | null {
    return process.env.GOOGLE_CLOUD_API_KEY?.trim() || null;
  }

  status() {
    return { neural: Boolean(this.key), translate: Boolean(this.key) };
  }

  async slot(id: string, lang: SpeechLang): Promise<SlotSpeech> {
    const slot = await this.resolve(id);
    const verses = slot.bible_references.map(splitVerse);
    const parts = readingParts(slot);
    if (lang === 'fr' || !this.key) {
      return { lang: this.key ? lang : 'fr', translated: false, title: slot.title, guidedText: slot.guided_text, verses, parts, neural: Boolean(this.key) };
    }
    const source = [slot.title, slot.guided_text ?? '', ...verses.flatMap((v) => [v.reference, v.text]), ...parts];
    const out = await this.translate(source, lang);
    if (!out) return { lang: 'fr', translated: false, title: slot.title, guidedText: slot.guided_text, verses, parts, neural: true };
    let i = 2;
    const tVerses = verses.map(() => ({ reference: out[i++], text: out[i++] }));
    return {
      lang,
      translated: true,
      title: out[0],
      guidedText: slot.guided_text ? out[1] : null,
      verses: tVerses,
      parts: out.slice(i),
      neural: true,
    };
  }

  /** MP3 of one part, in a natural voice; null when none is available (the device reads it). */
  async audio(id: string, index: number, lang: SpeechLang): Promise<Buffer | null> {
    if (!this.key) return null;
    const view = await this.slot(id, lang);
    const text = view.parts[index];
    if (!text) throw new NotFoundException('Rien à lire.');
    const voice = await this.voice(view.lang);
    if (!voice) return null;
    const path = `tts/${this.hash(`${voice.name}|${text}`)}.mp3`;
    const storage = this.supabase.client.storage.from(BUCKET);
    const cached = await storage.download(path).catch(() => ({ data: null }));
    if (cached.data) return Buffer.from(await cached.data.arrayBuffer());

    if (!(await this.withinBudget('tts_chars', text.length, envNumber('TTS_MONTHLY_CHAR_LIMIT', 900_000)))) return null;
    const res = await fetch(`${TTS_URL}/text:synthesize?key=${this.key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: LOCALES[view.lang], name: voice.name },
        audioConfig: { audioEncoding: 'MP3', ...(voice.rate ? { speakingRate: 0.9 } : {}) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      this.logger.warn(`TTS failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return null;
    }
    const audio = Buffer.from(((await res.json()) as { audioContent: string }).audioContent, 'base64');
    await storage.upload(path, audio, { contentType: 'audio/mpeg', upsert: true }).catch(() => undefined);
    return audio;
  }

  // ---- helpers ----

  private async resolve(id: string): Promise<PrayerSlot> {
    const live = this.gateway.findLiveSlot(id);
    if (live) return live;
    if (UUID.test(id)) return this.slotsService.findById(id);
    throw new NotFoundException('Segment introuvable.');
  }

  /**
   * The most human voice Google has for the language: Chirp 3 HD (default), or the tier set in
   * GOOGLE_TTS_TIER (Neural2, Wavenet, Standard); GOOGLE_TTS_GENDER picks MALE or FEMALE.
   */
  private async voice(lang: SpeechLang): Promise<{ name: string; rate: boolean } | null> {
    if (this.voices.has(lang)) return this.voices.get(lang) ?? null;
    const tier = process.env.GOOGLE_TTS_TIER?.trim() || 'Chirp3-HD';
    const gender = (process.env.GOOGLE_TTS_GENDER?.trim() || 'MALE').toUpperCase();
    try {
      const res = await fetch(`${TTS_URL}/voices?languageCode=${LOCALES[lang]}&key=${this.key}`, { signal: AbortSignal.timeout(10_000) });
      const list = ((await res.json()) as { voices?: { name: string; ssmlGender: string }[] }).voices ?? [];
      const local = list.filter((v) => v.name.startsWith(LOCALES[lang]));
      const order = [tier, 'Chirp3-HD', 'Neural2', 'Wavenet', 'Standard'];
      let pick: { name: string; ssmlGender: string } | undefined;
      for (const t of order) {
        const ofTier = local.filter((v) => v.name.includes(`-${t}-`));
        pick = ofTier.find((v) => v.ssmlGender === gender) ?? ofTier[0];
        if (pick) break;
      }
      const chosen = pick ? { name: pick.name, rate: !pick.name.includes('Chirp') } : null;
      this.voices.set(lang, chosen);
      return chosen;
    } catch (error) {
      this.logger.warn(`Voice list failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** French → lang, with every piece translated only once (memory, then the table, then Google). */
  private async translate(texts: string[], lang: SpeechLang): Promise<string[] | null> {
    const keys = texts.map((t) => this.hash(`${lang}|${t}`));
    const out: (string | null)[] = texts.map((t, i) => (t.trim() ? (this.memory.get(keys[i]) ?? null) : ''));
    const missingKeys = keys.filter((_, i) => out[i] === null);
    if (missingKeys.length) {
      const { data } = await this.supabase.client.from('speech_translations').select('hash, text').in('hash', missingKeys);
      for (const row of (Array.isArray(data) ? data : []) as { hash: string; text: string }[]) {
        const i = keys.indexOf(row.hash);
        out[i] = row.text;
        this.memory.set(row.hash, row.text);
      }
    }
    const todo = out.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (todo.length) {
      const chars = todo.reduce((n, i) => n + texts[i].length, 0);
      if (!(await this.withinBudget('translate_chars', chars, envNumber('TRANSLATE_MONTHLY_CHAR_LIMIT', 450_000)))) return null;
      try {
        const res = await fetch(`${TRANSLATE_URL}?key=${this.key}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: todo.map((i) => texts[i]), source: 'fr', target: lang, format: 'text' }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
        const translations = ((await res.json()) as { data: { translations: { translatedText: string }[] } }).data.translations;
        const rows = todo.map((i, k) => {
          out[i] = translations[k].translatedText;
          this.memory.set(keys[i], out[i] as string);
          return { hash: keys[i], lang, source: texts[i].slice(0, 4000), text: out[i] };
        });
        await this.supabase.client.from('speech_translations').upsert(rows, { onConflict: 'hash', ignoreDuplicates: true });
      } catch (error) {
        this.logger.warn(`Translation failed: ${(error as Error).message}`);
        return null;
      }
    }
    return out as string[];
  }

  /** Counts this month's characters; false once the monthly budget is spent (fail-open: true). */
  private async withinBudget(column: 'tts_chars' | 'translate_chars', chars: number, limit: number): Promise<boolean> {
    const month = new Date().toISOString().slice(0, 7);
    const db = this.supabase.client.from('speech_usage');
    const { data, error } = await db.select('tts_chars, translate_chars').eq('month', month).maybeSingle();
    if (error) return true;
    const row = (data as { tts_chars: number; translate_chars: number } | null) ?? { tts_chars: 0, translate_chars: 0 };
    if (row[column] + chars > limit) {
      this.logger.warn(`Monthly ${column} budget reached (${limit})`);
      return false;
    }
    await this.supabase.client.from('speech_usage').upsert({ month, ...row, [column]: row[column] + chars }, { onConflict: 'month' });
    return true;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 40);
  }
}
