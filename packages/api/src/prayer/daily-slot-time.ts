export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const REFERENCE_DATE = '2000-01-01';
const REFERENCE_NEXT_DATE = '2000-01-02';

/**
 * Prayer slots are a daily-recurring schedule ("06:00–06:30 every day"), not one-off calendar
 * events — docs/01_FUNCTIONAL_SPECIFICATION.md section 2.3's continuous room loops its program
 * forever, and PrayerEngineService.activate() already rewrites a slot's start_at/end_at to the
 * real current moment every time it cycles back to it, so the literal calendar date stored at
 * creation time is only ever read once, to derive the slot's duration (end - start) and for the
 * create-time overlap check below. Anchoring every slot onto the same fixed reference date lets
 * the existing timestamptz columns and lt/gt overlap-range query keep working completely
 * unchanged, while the admin only ever has to type two times of day, never a date.
 *
 * A slot crossing midnight (e.g. 23:30–00:15) rolls its end onto the reference date's "next day"
 * so endAt stays after startAt, exactly like it would for any other day. An endTime equal to
 * startTime stays same-day (a zero-duration slot) rather than wrapping into a full 24h one — the
 * existing "endAt must be after startAt" check in assertNoOverlap is what actually rejects it.
 */
export function toDailySlotRange(startTime: string, endTime: string): { startAt: string; endAt: string } {
  const startAt = `${REFERENCE_DATE}T${startTime}:00.000Z`;
  const endDate = endTime < startTime ? REFERENCE_NEXT_DATE : REFERENCE_DATE;
  const endAt = `${endDate}T${endTime}:00.000Z`;
  return { startAt, endAt };
}
