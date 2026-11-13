import { computePilotage } from './pilotage';

describe('computePilotage', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const req = (o: Record<string, unknown>) => ({ created_at: '2026-11-12T08:00:00Z', status: 'NEW', author_id: 'u', confidentiality: 'PRIVATE', ...o });

  it('measures how the requests are carried', () => {
    const p = computePilotage(
      7,
      now,
      [
        req({}),
        req({ status: 'ASSIGNED', assigned_to: 'i', assigned_at: '2026-11-12T10:00:00Z' }),
        req({ status: 'IN_PROGRESS', assigned_to: 'i', assigned_at: '2026-11-12T12:00:00Z', promoted_slot_id: 's' }),
        req({ status: 'ANSWERED', assigned_to: 'i', assigned_at: '2026-11-12T14:00:00Z', author_id: null, confidentiality: 'ANONYMOUS' }),
      ],
      [{ status: 'PUBLISHED' }, { status: 'DRAFT' }],
      { prayers: 9, mobilizations: 1, faithActs: 2 },
    );
    expect(p.rates).toEqual({ assigned: 0.75, inCare: 0.5, answered: 0.25, carriedInRoom: 0.25, testimoniesPublished: 0.5 });
    expect(p.medianHoursToAssign).toBe(4);
    expect(p.sources).toEqual([
      { key: 'MEMBER', count: 3 },
      { key: 'PUBLIC', count: 0 },
      { key: 'ANONYMOUS', count: 1 },
    ]);
    expect(p.series).toHaveLength(7);
    expect(p.series.find((s) => s.day === '2026-11-12')).toEqual({ day: '2026-11-12', requests: 4, answered: 1 });
    expect(p.totals).toMatchObject({ requests: 4, testimonies: 2, prayers: 9 });
  });

  it('says nothing rather than 0 % when there is nothing to measure', () => {
    const p = computePilotage(30, now, [], [], { prayers: 0, mobilizations: 0, faithActs: 0 });
    expect(p.rates.answered).toBeNull();
    expect(p.medianHoursToAssign).toBeNull();
    expect(p.series).toHaveLength(30);
  });
});
