import { placeCreneaux, repeatCreneaux } from './dated-creneaux';

describe('placeCreneaux', () => {
  it('places a créneau at its real hours in the community time zone', () => {
    const [a, b] = placeCreneaux(
      [{ date: '2026-11-05', segments: [{ start: '12:00', end: '12:03', title: 'Ouverture' }, { start: '12:03', end: '12:10', title: 'Adoration' }] }],
      'Africa/Lome',
    );
    expect(a.startAt.toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect(a.durationSeconds).toBe(180);
    expect(b.endAt.toISOString()).toBe('2026-11-05T12:10:00.000Z');
  });

  it('crosses midnight inside a créneau', () => {
    const placed = placeCreneaux(
      [{ date: '2026-11-05', segments: [{ start: '23:55', end: '00:05', title: 'Veille' }, { start: '00:05', end: '00:30', title: 'Prière 1' }] }],
      'Africa/Lome',
    );
    expect(placed[0].endAt.toISOString()).toBe('2026-11-06T00:05:00.000Z');
    expect(placed[1].startAt.toISOString()).toBe('2026-11-06T00:05:00.000Z');
  });

  it('refuses an impossible duration', () => {
    expect(() =>
      placeCreneaux([{ date: '2026-11-05', segments: [{ start: '12:00', end: '12:00', title: 'X' }] }], 'Africa/Lome'),
    ).toThrow();
  });
});

describe('repeatCreneaux', () => {
  const day = (date: string) => ({ date, segments: [{ start: '12:00', end: '13:00', title: 'Prière' }] });

  it('turns one day into every day of the period', () => {
    const out = repeatCreneaux([day('2026-11-12')], 7);
    expect(out.map((c) => c.date)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
  });

  it('repeats a pasted week week after week, stopping at the end of the period', () => {
    const week = ['2026-11-12', '2026-11-14', '2026-11-18'].map(day);
    const out = repeatCreneaux(week, 10);
    expect(out.map((c) => c.date)).toEqual(['2026-11-12', '2026-11-14', '2026-11-18', '2026-11-19', '2026-11-21']);
  });

  it('never goes beyond three months', () => {
    expect(repeatCreneaux([day('2026-11-12')], 400)).toHaveLength(92);
  });
});
