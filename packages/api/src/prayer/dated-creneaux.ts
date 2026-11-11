import { BadRequestException } from '@nestjs/common';
import { DatedCreneauDto } from './dto/add-creneaux.dto';
import { addDays, daysBetween, zonedToUtc } from './zoned-time';

export interface PlacedSegment {
  startAt: Date;
  endAt: Date;
  title: string;
  durationSeconds: number;
  guidedText?: string;
  bibleReferences?: string[];
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Turns créneaux written in local time into real instants. Within a créneau, a segment whose
 * start is earlier than the previous one has crossed midnight (23:58-00:03 → the next day).
 */
export function placeCreneaux(creneaux: DatedCreneauDto[], timeZone: string): PlacedSegment[] {
  const out: PlacedSegment[] = [];
  for (const creneau of creneaux) {
    let day = creneau.date;
    let previous = -1;
    for (const segment of creneau.segments) {
      const start = minutesOf(segment.start);
      if (previous >= 0 && start < previous) day = addDays(day, 1);
      previous = start;
      const end = minutesOf(segment.end);
      const endDay = end <= start ? addDays(day, 1) : day;
      const startAt = zonedToUtc(day, segment.start, timeZone);
      const endAt = zonedToUtc(endDay, segment.end, timeZone);
      const durationSeconds = Math.round((endAt.getTime() - startAt.getTime()) / 1000);
      if (durationSeconds < 30 || durationSeconds > 6 * 3600) {
        throw new BadRequestException(`Durée impossible pour « ${segment.title} » (${segment.start}-${segment.end}).`);
      }
      out.push({
        startAt,
        endAt,
        title: segment.title,
        durationSeconds,
        guidedText: segment.guidedText,
        bibleReferences: segment.bibleReferences,
      });
    }
  }
  return out;
}

/** Programming horizon: up to three months ahead in one go. */
export const MAX_REPEAT_DAYS = 92;
/** Safety net for one request (3 months of 24 h/24 hourly créneaux of ~13 segments). */
export const MAX_PLACED_SEGMENTS = 40_000;

/**
 * Repeats the pasted days to fill `repeatDays` days from the first one: a single day becomes
 * every day; a pasted week repeats week after week. Undated text has already been given a date.
 */
export function repeatCreneaux(creneaux: DatedCreneauDto[], repeatDays: number): DatedCreneauDto[] {
  if (creneaux.length === 0 || repeatDays <= 1) return creneaux;
  const days = Math.min(repeatDays, MAX_REPEAT_DAYS);
  const dates = creneaux.map((c) => c.date).sort();
  const first = dates[0];
  const span = daysBetween(first, dates[dates.length - 1]) + 1;
  const out: DatedCreneauDto[] = [];
  for (let offset = 0; offset < days; offset += span) {
    for (const creneau of creneaux) {
      const shift = daysBetween(first, creneau.date) + offset;
      if (shift >= days) continue;
      out.push({ ...creneau, date: addDays(first, shift) });
    }
  }
  return out;
}
