import { hourTheme, periodOfHour } from './day-period';

describe('day periods', () => {
  it('names night, midnight and the vigil by the hour', () => {
    expect(periodOfHour(22)).toBe('NIGHT');
    expect(periodOfHour(0)).toBe('MIDNIGHT');
    expect(periodOfHour(2)).toBe('MIDNIGHT');
    expect(periodOfHour(3)).toBe('VIGIL');
    expect(periodOfHour(4)).toBe('VIGIL');
    expect(periodOfHour(5)).toBe('DAWN');
    expect(periodOfHour(13)).toBe('MIDDAY');
    expect(periodOfHour(19)).toBe('EVENING');
  });

  it('uses the hour of the room time zone', () => {
    const at = new Date('2026-11-18T23:30:00Z');
    expect(hourTheme(at, 'Africa/Lome').key).toBe('NIGHT');
    expect(hourTheme(at, 'Europe/Paris').key).toBe('MIDNIGHT'); // 00:30 in Paris
    expect(hourTheme(new Date('2026-11-18T00:10:00Z'), 'Africa/Lome').verse.reference).toBe('Psaume 119:62');
  });
});
