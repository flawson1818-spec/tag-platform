import { addDays, zonedToUtc } from './zoned-time';

describe('zonedToUtc', () => {
  it('Lomé is UTC all year', () => {
    expect(zonedToUtc('2026-11-05', '12:00', 'Africa/Lome').toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });
  it('applies the zone offset, summer and winter', () => {
    expect(zonedToUtc('2026-01-15', '12:00', 'Europe/Paris').toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(zonedToUtc('2026-07-15', '12:00', 'Europe/Paris').toISOString()).toBe('2026-07-15T10:00:00.000Z');
    expect(zonedToUtc('2026-11-05', '07:30', 'America/Sao_Paulo').toISOString()).toBe('2026-11-05T10:30:00.000Z');
  });
  it('rejects nonsense', () => {
    expect(() => zonedToUtc('05/11/2026', '12:00')).toThrow();
    expect(() => zonedToUtc('2026-11-05', '25:00')).toThrow();
  });
  it('adds days across months', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});
