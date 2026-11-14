/**
 * How the room's texts are READ: a Bible reference is never "three hours sixteen" but
 * "chapitre 3, verset 16"; labels, emojis and quote marks are not read; the order is the one a
 * prayer room follows (a request first, its verse, then the prayer). Built in French — the
 * language the créneaux are written in — then translated as a whole for other listeners.
 */

const ORDINAL: Record<string, string> = { '1': 'Premier', '2': 'Deuxième', '3': 'Troisième' };

/** "Jean 3:16" → "Jean, chapitre 3, verset 16"; "1 Jean 4:7-8" → "Premier Jean, chapitre 4, versets 7 à 8". */
export function speakReferences(text: string): string {
  return text.replace(
    /(?:\b([1-3])\s)?([A-ZÉÈÊÀÂÎÔÛÇ][\p{L}’'-]+(?:\s(?:des|de|du)\s[\p{L}]+)?)\s+(\d{1,3})\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/gu,
    (_m, ordinal: string | undefined, book: string, chapter: string, verse: string, end?: string) => {
      const name = ordinal ? `${ORDINAL[ordinal]} ${book}` : book;
      return `${name}, chapitre ${chapter}, ${end ? `versets ${verse} à ${end}` : `verset ${verse}`}`;
    },
  );
}

/** Text fit to be spoken: no [labels], emojis, quote marks; "Prière1:" → "Prière 1." */
export function speakable(text: string): string {
  return speakReferences(
    text
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[«»"“”]/g, '')
      .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '')
      .replace(/\b(Prière|Priere)\s*(\d+)\s*:/gi, 'Prière $2.'),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ReadableSlot {
  title: string;
  guided_text: string | null;
  bible_references: string[];
}

export function splitVerse(stored: string): { reference: string; text: string } {
  const dash = stored.indexOf(' — ');
  return dash > 0 ? { reference: stored.slice(0, dash), text: stored.slice(dash + 3) } : { reference: stored, text: '' };
}

/**
 * The parts read, in order. A prayer request: the request, its verse, the prayer. Any other
 * segment: its title, its prayer, its verses. The whole plan is read again and again.
 */
export function readingParts(slot: ReadableSlot): string[] {
  const verses = slot.bible_references.map((stored) => {
    const v = splitVerse(stored);
    return speakable(v.text ? `${v.reference}. ${v.text}` : v.reference);
  });
  const text = slot.guided_text?.trim() ?? '';
  if (/^Sujet de prière\s*:/i.test(text)) {
    const [subject, ...rest] = text.split(/\n\s*\n/);
    return [speakable(subject), ...verses, speakable(rest.join(' '))].filter(Boolean);
  }
  return [speakable(slot.title), speakable(text), ...verses].filter(Boolean);
}
