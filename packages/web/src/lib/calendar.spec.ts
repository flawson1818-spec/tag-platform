import { formatViewRangeLabel, getViewRange, isWithinView, shiftReferenceDate } from './calendar';

// Wednesday, matched against a Monday-start week.
const WEDNESDAY = new Date('2026-03-11T15:30:00');

describe('getViewRange', () => {
  it('day: covers midnight to midnight of the reference date', () => {
    const { start, end } = getViewRange('day', WEDNESDAY);
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-11');
    expect(end.toISOString().slice(0, 10)).toBe('2026-03-12');
  });

  it('week: starts on Monday and spans 7 days', () => {
    const { start, end } = getViewRange('week', WEDNESDAY);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(end.toISOString().slice(0, 10)).toBe('2026-03-16');
  });

  it('month: starts on the 1st and spans to the 1st of the next month', () => {
    const { start, end } = getViewRange('month', WEDNESDAY);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(2); // March (0-indexed)
    expect(end.getMonth()).toBe(3); // April
    expect(end.getDate()).toBe(1);
  });
});

describe('shiftReferenceDate', () => {
  it('day: moves by one day', () => {
    const next = shiftReferenceDate('day', WEDNESDAY, 1);
    expect(next.toISOString().slice(0, 10)).toBe('2026-03-12');
  });

  it('week: moves by seven days', () => {
    const prev = shiftReferenceDate('week', WEDNESDAY, -1);
    expect(prev.toISOString().slice(0, 10)).toBe('2026-03-04');
  });

  it('month: moves by one calendar month', () => {
    const next = shiftReferenceDate('month', WEDNESDAY, 1);
    expect(next.getMonth()).toBe(3); // April
  });
});

describe('isWithinView', () => {
  it('returns true for a date inside the current week, false for one outside it', () => {
    expect(isWithinView('2026-03-12T08:00:00', 'week', WEDNESDAY)).toBe(true);
    expect(isWithinView('2026-03-17T08:00:00', 'week', WEDNESDAY)).toBe(false);
  });

  it('treats the range as half-open at the end boundary', () => {
    expect(isWithinView('2026-03-12T00:00:00', 'day', new Date('2026-03-12T09:00:00'))).toBe(true);
    expect(isWithinView('2026-03-13T00:00:00', 'day', new Date('2026-03-12T09:00:00'))).toBe(false);
  });
});

describe('formatViewRangeLabel', () => {
  it('day: includes the weekday and full date', () => {
    expect(formatViewRangeLabel('day', WEDNESDAY)).toContain('2026');
  });

  it('month: includes the month name and year', () => {
    const label = formatViewRangeLabel('month', WEDNESDAY);
    expect(label.toLowerCase()).toContain('mars');
    expect(label).toContain('2026');
  });
});
