import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrayerSlotsService } from '../prayer/prayer-slots.service';
import { PrayerRealtimeGateway } from '../prayer/prayer-realtime.gateway';
import { PrayerSlot } from '../prayer/prayer-slot.entity';
import { HourTheme, hourTheme } from './day-period';
import { readingParts, splitVerse } from './spoken';

export const SPEECH_LANGS = ['fr', 'en', 'es', 'pt'] as const;
export type SpeechLang = (typeof SPEECH_LANGS)[number];

const LOCALES: Record<SpeechLang, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR' };
const BUCKET = 'tag-files';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
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
  /** The call of the hour (morning, night, midnight vigil…), translated like the rest. */
  hour: { key: string; label: string; intro: string; verse: { reference: string; text: string } } | null;
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

  /** Google Cloud (Text-to-Speech + Translation): needs a billing account. */
  private get key(): string | null {
    return process.env.GOOGLE_CLOUD_API_KEY?.trim() || null;
  }

  /** Gemini API (Google AI Studio): a free key, no billing account. Used when there is no Cloud key. */
  private get geminiKey(): string | null {
    return process.env.GEMINI_API_KEY?.trim() || null;
  }

  /** Is any provider configured? Without one the room stays in French, read by the device. */
  private get enabled(): boolean {
    return Boolean(this.key || this.geminiKey);
  }

  status() {
    return { neural: this.enabled, translate: this.enabled, provider: this.key ? 'google-cloud' : this.geminiKey ? 'gemini' : null };
  }

  async slot(id: string, lang: SpeechLang): Promise<SlotSpeech> {
    const slot = await this.resolve(id);
    const verses = slot.bible_references.map(splitVerse);
    // Worship and prayer-request segments keep their own words; every other one gets the call of the hour.
    const isRequest = /^Sujet de prière\s*:/i.test(slot.guided_text ?? '');
    const theme: HourTheme | null = (slot as { kind?: string }).kind === 'WORSHIP' || id.startsWith('worship-') || isRequest ? null : hourTheme();
    const parts = readingParts(slot, theme);
    const base = { title: slot.title, guidedText: slot.guided_text, verses, parts };
    const french = { ...base, hour: theme, translated: false, neural: this.enabled };
    if (lang === 'fr' || !this.enabled) return { lang: this.enabled ? lang : 'fr', ...french };

    const extra = theme ? [theme.label, theme.intro, theme.verse.reference, theme.verse.text] : [];
    const source = [slot.title, slot.guided_text ?? '', ...verses.flatMap((v) => [v.reference, v.text]), ...parts, ...extra];
    const out = await this.translate(source, lang);
    if (!out) return { lang: 'fr', ...french, neural: true };
    let i = 2;
    const tVerses = verses.map(() => ({ reference: out[i++], text: out[i++] }));
    const tParts = out.slice(i, i + parts.length);
    i += parts.length;
    return {
      lang,
      translated: true,
      title: out[0],
      guidedText: slot.guided_text ? out[1] : null,
      verses: tVerses,
      hour: theme ? { key: theme.key, label: out[i], intro: out[i + 1], verse: { reference: out[i + 2], text: out[i + 3] } } : null,
      parts: tParts,
      neural: true,
    };
  }

  /** MP3 of one part, in a natural voice; null when none is available (the device reads it). */
  async audio(id: string, index: number, lang: SpeechLang): Promise<{ data: Buffer; type: string } | null> {
    if (!this.enabled) return null;
    const view = await this.slot(id, lang);
    const text = view.parts[index];
    if (!text) throw new NotFoundException('Rien à lire.');
    if (!this.key) return this.geminiAudio(text);
    const voice = await this.voice(view.lang);
    if (!voice) return null;
    const path = `tts/${this.hash(`${voice.name}|${text}`)}.mp3`;
    const storage = this.supabase.client.storage.from(BUCKET);
    const cached = await storage.download(path).catch(() => ({ data: null }));
    if (cached.data) return { data: Buffer.from(await cached.data.arrayBuffer()), type: 'audio/mpeg' };

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
    return { data: audio, type: 'audio/mpeg' };
  }

  // ---- Gemini API (free key from Google AI Studio) ----

  private geminiModels: { text: string | null; tts: string | null } | null = null;

  /** Picks the free Flash models the key can use (a name may change over time: GEMINI_TEXT_MODEL / GEMINI_TTS_MODEL override). */
  private async pickGeminiModels(): Promise<{ text: string | null; tts: string | null }> {
    if (this.geminiModels) return this.geminiModels;
    const forced = { text: process.env.GEMINI_TEXT_MODEL?.trim() || null, tts: process.env.GEMINI_TTS_MODEL?.trim() || null };
    if (forced.text && forced.tts) return (this.geminiModels = forced);
    try {
      const res = await fetch(`${GEMINI_URL}/models?pageSize=200`, { headers: { 'x-goog-api-key': this.geminiKey as string }, signal: AbortSignal.timeout(10_000) });
      const list = ((await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }).models ?? [];
      const names = list.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
      const stable = (n: string) => !/preview|exp|live|image|thinking|audio|native|robotics|computer/i.test(n);
      const textOnes = names.filter((n) => /flash/i.test(n) && !/tts/i.test(n) && !/live|image|audio/i.test(n));
      const ttsOnes = names.filter((n) => /tts/i.test(n));
      const best = (xs: string[], prefer: RegExp[]) => {
        for (const p of prefer) {
          const hit = xs.filter((n) => p.test(n)).sort((a, b) => Number(stable(b)) - Number(stable(a)) || b.localeCompare(a))[0];
          if (hit) return hit;
        }
        return xs.sort((a, b) => Number(stable(b)) - Number(stable(a)) || b.localeCompare(a))[0] ?? null;
      };
      this.geminiModels = {
        text: forced.text ?? best(textOnes, [/flash-lite/i, /flash/i]),
        tts: forced.tts ?? best(ttsOnes, [/flash/i]),
      };
    } catch (error) {
      this.logger.warn(`Gemini model list failed: ${(error as Error).message}`);
      return { text: forced.text, tts: forced.tts };
    }
    return this.geminiModels;
  }

  private async geminiTranslate(texts: string[], lang: SpeechLang): Promise<string[] | null> {
    const { text: model } = await this.pickGeminiModels();
    if (!model) return null;
    const language = { fr: 'French', en: 'English', es: 'Spanish', pt: 'Portuguese' }[lang];
    const prompt =
      `Translate each string of this JSON array from French to ${language}. They are Christian prayers, Bible verses and texts of an online prayer room: ` +
      `keep a warm, reverent tone, render Bible verses in the wording of a well-known ${language} Bible, keep proper names, and do not add or remove anything. ` +
      `Reply with only a JSON array of strings, the same length and order.\n${JSON.stringify(texts)}`;
    try {
      const res = await fetch(`${GEMINI_URL}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.geminiKey as string },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'STRING' } }, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null') as unknown;
      if (!Array.isArray(parsed) || parsed.length !== texts.length || parsed.some((v) => typeof v !== 'string')) throw new Error('unexpected answer');
      return parsed as string[];
    } catch (error) {
      this.logger.warn(`Gemini translation failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** A natural voice from Gemini's text-to-speech (raw 24 kHz audio, wrapped as WAV so every browser plays it). */
  private async geminiAudio(text: string): Promise<{ data: Buffer; type: string } | null> {
    const { tts: model } = await this.pickGeminiModels();
    if (!model) return null;
    const voiceName = process.env.GEMINI_TTS_VOICE?.trim() || 'Kore';
    const path = `tts/${this.hash(`gemini|${model}|${voiceName}|${text}`)}.wav`;
    const storage = this.supabase.client.storage.from(BUCKET);
    const cached = await storage.download(path).catch(() => ({ data: null }));
    if (cached.data) return { data: Buffer.from(await cached.data.arrayBuffer()), type: 'audio/wav' };
    if (!(await this.withinBudget('tts_chars', text.length, envNumber('TTS_MONTHLY_CHAR_LIMIT', 900_000)))) return null;
    try {
      const res = await fetch(`${GEMINI_URL}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.geminiKey as string },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Say slowly, warmly and calmly, like a prayer: ${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
      const pcm = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (!pcm) throw new Error('no audio in the answer');
      const wav = pcmToWav(Buffer.from(pcm, 'base64'));
      await storage.upload(path, wav, { contentType: 'audio/wav', upsert: true }).catch(() => undefined);
      return { data: wav, type: 'audio/wav' };
    } catch (error) {
      this.logger.warn(`Gemini voice failed: ${(error as Error).message}`);
      return null;
    }
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
      if (!this.key) {
        const translated = await this.geminiTranslate(todo.map((i) => texts[i]), lang);
        if (!translated) return null;
        const rows = todo.map((i, k) => {
          out[i] = translated[k];
          this.memory.set(keys[i], translated[k]);
          return { hash: keys[i], lang, source: texts[i].slice(0, 4000), text: translated[k] };
        });
        await this.supabase.client.from('speech_translations').upsert(rows, { onConflict: 'hash', ignoreDuplicates: true });
        return out as string[];
      }
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

/** Raw 16-bit mono 24 kHz audio (what Gemini returns) with a WAV header, playable everywhere. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
