/**
 * Turns a créneau written the way moderators already write it (a WhatsApp-style text: a date
 * line, then segments with a time range, a title or "PrièreN:" text, and Bible verses) into
 * structured segments the prayer room can run.
 *
 *   Prière d'ouverture 12:00-12:03
 *   12:10-12:15
 *   Prière1: Père merci pour ta puissance…
 *   Jean 10:10 « Le voleur ne vient que pour dérober… »
 *   Supplication Personnelle
 *   12:48-12:53
 *
 * Pure and forgiving: anything it cannot place ends up in the segment's text, never dropped,
 * and the moderator reviews the preview before anything is saved.
 */

export interface ParsedVerse {
  reference: string;
  text: string;
}

export interface ParsedSegment {
  /** "HH:mm" as written. */
  start: string;
  end: string;
  durationSeconds: number;
  title: string;
  /** The prayer itself, empty for a segment like "Louange intense". */
  prayer: string;
  verses: ParsedVerse[];
}

export interface ParsedCreneau {
  /** The heading line before the first segment, e.g. "JEUDI 05 NOVEMBRE 2026". */
  heading: string | null;
  segments: ParsedSegment[];
  /** Lines that came before any segment and weren't the heading. */
  warnings: string[];
}

const TIME_RANGE = /(\d{1,2})\s*[:hH]\s*(\d{2})\s*(?:-|–|—|à|a)\s*(\d{1,2})\s*[:hH]\s*(\d{2})/;
/** "Prière1:", "Prière 7 :", "Priere 2 -" */
const PRAYER_MARKER = /^pri[eè]re\s*(\d+)\s*[:.\-–]\s*/i;
/** Book names: "Jean", "1 Thessaloniciens", "Ésaïe", "Cantique des cantiques", "Actes". */
const VERSE_REF =
  /^((?:[1-3]\s*)?[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+(?:des|de|du)\s+[a-zà-ÿ]+)?)\s+(\d{1,3})\s*[:.,]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\b\s*(.*)$/;
const SHORT_TITLE_MAX = 60;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function minutesOf(h: number, m: number): number {
  return h * 60 + m;
}

function stripQuotes(text: string): string {
  return text
    .trim()
    .replace(/^[«"“]\s*/, '')
    .replace(/\s*[»"”]$/, '')
    .trim();
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isVerseRef(line: string): RegExpMatchArray | null {
  const m = line.match(VERSE_REF);
  if (!m) return null;
  // "Prière 2 : …" would otherwise look like a book named Prière.
  if (/^pri[eè]re$/i.test(m[1].trim())) return null;
  return m;
}

/** A line that only names the next segment ("Supplication Personnelle"). */
function looksLikeTitle(line: string): boolean {
  return (
    line.length <= SHORT_TITLE_MAX &&
    !PRAYER_MARKER.test(line) &&
    !isVerseRef(line) &&
    !/[.!?»"”]$/.test(line)
  );
}

interface Draft {
  start: string;
  end: string;
  durationSeconds: number;
  title: string;
  prayerParts: string[];
  verses: ParsedVerse[];
  /** Collecting the text of the last verse when it's on the lines after its reference. */
  inVerse: boolean;
}

export function parseCreneau(input: string): ParsedCreneau {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter((l) => l.length > 0);

  const segments: ParsedSegment[] = [];
  const warnings: string[] = [];
  let heading: string | null = null;
  let draft: Draft | null = null;

  const finish = () => {
    if (!draft) return;
    const prayer = normalizeSpaces(draft.prayerParts.join(' '));
    segments.push({
      start: draft.start,
      end: draft.end,
      durationSeconds: draft.durationSeconds,
      title: draft.title || (prayer ? 'Prière' : 'Temps de prière'),
      prayer,
      verses: draft.verses.map((v) => ({ reference: v.reference, text: stripQuotes(normalizeSpaces(v.text)) })),
    });
    draft = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const time = line.match(TIME_RANGE);

    if (time) {
      // A short title alone on the line just before ("Supplication Personnelle" / "12:48-12:53")
      // belongs to this new segment, not to the end of the previous one.
      let carriedTitle = '';
      if (draft && i > 0 && lines[i - 1] === pendingTitleCandidate(draft)) {
        carriedTitle = popTrailingTitle(draft);
      }
      finish();

      const [h1, m1, h2, m2] = [time[1], time[2], time[3], time[4]].map(Number);
      const startMin = minutesOf(h1, m1);
      let endMin = minutesOf(h2, m2);
      if (endMin <= startMin) endMin += 24 * 60; // crosses midnight
      const before = line.slice(0, time.index).trim().replace(/[:\-–]$/, '').trim();

      draft = {
        start: `${pad(h1)}:${pad(m1)}`,
        end: `${pad(h2 % 24)}:${pad(m2)}`,
        durationSeconds: (endMin - startMin) * 60,
        // Text after the time on a title line ("… 12:58-13:00 Voici un exemple") is a remark,
        // not part of the prayer; only the text before the time names the segment.
        title: before || carriedTitle,
        prayerParts: [],
        verses: [],
        inVerse: false,
      };
      continue;
    }

    if (!draft) {
      if (heading === null) heading = line;
      else warnings.push(line);
      continue;
    }

    const marker = line.match(PRAYER_MARKER);
    if (marker) {
      if (!draft.title) draft.title = `Prière ${marker[1]}`;
      draft.prayerParts.push(line.slice(marker[0].length));
      draft.inVerse = false;
      continue;
    }

    const verse = isVerseRef(line);
    if (verse) {
      const reference = `${normalizeSpaces(verse[1])} ${verse[2]}:${verse[3].replace(/\s+/g, '')}`;
      draft.verses.push({ reference, text: verse[4] ?? '' });
      draft.inVerse = !verse[4] || !/[»"”.!?]$/.test(verse[4].trim());
      continue;
    }

    if (draft.inVerse && draft.verses.length > 0) {
      const last = draft.verses[draft.verses.length - 1];
      last.text = last.text ? `${last.text} ${line}` : line;
      if (/[»"”.!?]$/.test(line)) draft.inVerse = false;
      continue;
    }

    if (!draft.title && draft.prayerParts.length === 0 && looksLikeTitle(line)) {
      draft.title = line;
      continue;
    }

    draft.prayerParts.push(line);
  }

  // A trailing short title with no time after it stays where it was written.
  finish();
  return { heading, segments, warnings };
}

/** The last raw line appended to a draft, if it could be the next segment's title. */
function pendingTitleCandidate(draft: Draft): string | null {
  if (draft.inVerse) return null;
  const lastPart = draft.prayerParts[draft.prayerParts.length - 1];
  if (lastPart && looksLikeTitle(lastPart) && (draft.prayerParts.length > 1 || draft.verses.length > 0 || draft.title)) {
    return lastPart;
  }
  return null;
}

function popTrailingTitle(draft: Draft): string {
  return draft.prayerParts.pop() ?? '';
}

/** "Jean 10:10 — Le voleur…" — the one-line form stored in a slot's bible_references. */
export function formatVerse(verse: ParsedVerse): string {
  return verse.text ? `${verse.reference} — ${verse.text}` : verse.reference;
}

/** Splits a stored bible_references entry back into reference + text for display. */
export function splitVerse(stored: string): ParsedVerse {
  const dash = stored.indexOf(' — ');
  if (dash > 0) return { reference: stored.slice(0, dash), text: stored.slice(dash + 3) };
  const m = stored.match(VERSE_REF);
  if (m && m[4]) return { reference: `${m[1]} ${m[2]}:${m[3]}`, text: stripQuotes(m[4]) };
  return { reference: stored, text: '' };
}

// ---- Several dated créneaux at once (a day, a week, a month) ----

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};
const WORD_DATE = /\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})\b/i;
const NUM_DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/;

/** "JEUDI 05 NOVEMBRE 2026" or "05/11/2026" → "2026-11-05"; null when the line holds no date. */
export function parseDateLine(line: string): string | null {
  const clean = line.replace(/\u00a0/g, ' ');
  let day: number, month: number, year: number;
  const w = clean.match(WORD_DATE);
  if (w) {
    day = Number(w[1]);
    month = MONTHS[w[2].toLowerCase().replace('û', 'u')] ?? MONTHS[w[2].toLowerCase()];
    year = Number(w[3]);
  } else {
    const n = clean.match(NUM_DATE);
    if (!n) return null;
    [day, month, year] = [Number(n[1]), Number(n[2]), Number(n[3])];
  }
  if (!month || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // 31 février
  return d.toISOString().slice(0, 10);
}

export interface DatedCreneau extends ParsedCreneau {
  /** null when the text gave no date: the moderator picks it. */
  date: string | null;
}

/**
 * Splits a paste covering several days into créneaux: every line that carries a date (and no
 * time range) starts a new one. Text without any date is a single créneau with date null.
 */
export function parseCreneauxByDate(input: string): DatedCreneau[] {
  const lines = input.split(/\r?\n/);
  const chunks: { date: string | null; lines: string[] }[] = [];
  let current: { date: string | null; lines: string[] } | null = null;
  for (const line of lines) {
    const date = TIME_RANGE.test(line) ? null : parseDateLine(line);
    if (date) {
      current = { date, lines: [line] };
      chunks.push(current);
      continue;
    }
    if (!current) {
      current = { date: null, lines: [] };
      chunks.push(current);
    }
    current.lines.push(line);
  }
  return chunks
    .map((chunk) => ({ date: chunk.date, ...parseCreneau(chunk.lines.join('\n')) }))
    .filter((c) => c.segments.length > 0);
}
