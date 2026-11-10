import { BadRequestException } from '@nestjs/common';
import { DatedCreneauDto } from './dto/add-creneaux.dto';
import { addDays, zonedToUtc } from './zoned-time';

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
