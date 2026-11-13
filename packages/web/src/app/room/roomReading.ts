import { splitVerse } from '../../lib/creneau-parser';

/** Text fit to be spoken: no [labels], no emojis, no quote marks, no extra spaces. */
export function speakable(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[«»"“”]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Browsers cut long utterances: speak sentence by sentence, never more than ~180 characters. */
export function chunks(text: string, max = 180): string[] {
  const out: string[] = [];
  for (const sentence of speakable(text).split(/(?<=[.!?;])\s+/)) {
    if (!sentence) continue;
    if (sentence.length <= max) {
      out.push(sentence);
      continue;
    }
    let rest = sentence;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max);
      out.push(rest.slice(0, cut > 40 ? cut : max));
      rest = rest.slice(cut > 40 ? cut + 1 : max);
    }
    if (rest) out.push(rest);
  }
  return out;
}

export interface ReadingSlot {
  title: string;
  guided_text: string | null;
  bible_references: string[];
}

/**
 * The order the AI reads a segment, the way a prayer room is led:
 * - a prayer request: the request first, then the verse that carries it, then the prayer;
 * - any other segment: its title, its prayer, its verses.
 * `again` is what is read again and again until the segment ends ("lire et relire").
 */
export function readingPlan(slot: ReadingSlot): { first: string[]; again: string[] } {
  const verses = slot.bible_references.map((stored) => {
    const v = splitVerse(stored);
    return v.text ? `${v.reference}. ${v.text}` : v.reference;
  });
  const text = slot.guided_text?.trim() ?? '';
  const isRequest = /^Sujet de prière\s*:/i.test(text);
  if (isRequest) {
    const [subject, ...rest] = text.split(/\n\s*\n/);
    const prayer = rest.join(' ');
    const plan = [subject, ...verses, prayer].filter(Boolean);
    return { first: plan.flatMap((p) => chunks(p)), again: plan.flatMap((p) => chunks(p)) };
  }
  const body = [text, ...verses].filter(Boolean);
  return {
    first: [slot.title, ...body].flatMap((p) => chunks(p)),
    again: (body.length ? body : [slot.title]).flatMap((p) => chunks(p)),
  };
}
