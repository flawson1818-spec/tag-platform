/**
 * Pilotage (cahier des charges unifié §5.10): how the requests are carried, over 7 to 90 days.
 * Pure computation over the rows of the period, so it is tested without a database.
 */

export interface RequestRow {
  created_at: string;
  status: string;
  author_id: string | null;
  confidentiality: string;
  assigned_to?: string | null;
  assigned_at?: string | null;
  promoted_slot_id?: string | null;
}

export interface Pilotage {
  days: number;
  totals: { requests: number; testimonies: number; prayers: number; mobilizations: number; faithActs: number };
  /** Shares of the period's requests, 0 to 1 (null when there is no request). */
  rates: {
    assigned: number | null;
    inCare: number | null;
    answered: number | null;
    carriedInRoom: number | null;
    testimoniesPublished: number | null;
  };
  /** Median hours from a request to its intercessor (null when none assigned). */
  medianHoursToAssign: number | null;
  sources: { key: 'MEMBER' | 'ANONYMOUS' | 'PUBLIC'; count: number }[];
  series: { day: string; requests: number; answered: number }[];
}

const ASSIGNED = new Set(['ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED']);
const IN_CARE = new Set(['IN_PROGRESS', 'WAITING', 'ANSWERED']);

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function computePilotage(
  days: number,
  now: Date,
  requests: RequestRow[],
  testimonies: { status: string }[],
  counts: { prayers: number; mobilizations: number; faithActs: number },
): Pilotage {
  const assigned = requests.filter((r) => r.assigned_to || ASSIGNED.has(r.status)).length;
  const delays = requests
    .filter((r) => r.assigned_at)
    .map((r) => (Date.parse(r.assigned_at as string) - Date.parse(r.created_at)) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const median = delays.length
    ? delays.length % 2
      ? delays[(delays.length - 1) / 2]
      : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2
    : null;

  const series: Pilotage['series'] = [];
  const byDay = new Map<string, { requests: number; answered: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const entry = { requests: 0, answered: 0 };
    byDay.set(day, entry);
    series.push({ day, ...entry });
  }
  for (const r of requests) {
    const entry = byDay.get(r.created_at.slice(0, 10));
    if (!entry) continue;
    entry.requests += 1;
    if (r.status === 'ANSWERED') entry.answered += 1;
  }

  return {
    days,
    totals: { requests: requests.length, testimonies: testimonies.length, ...counts },
    rates: {
      assigned: share(assigned, requests.length),
      inCare: share(requests.filter((r) => IN_CARE.has(r.status)).length, requests.length),
      answered: share(requests.filter((r) => r.status === 'ANSWERED').length, requests.length),
      carriedInRoom: share(requests.filter((r) => r.promoted_slot_id).length, requests.length),
      testimoniesPublished: share(testimonies.filter((t) => t.status === 'PUBLISHED').length, testimonies.length),
    },
    medianHoursToAssign: median === null ? null : Math.round(median * 10) / 10,
    sources: [
      { key: 'MEMBER', count: requests.filter((r) => r.author_id && r.confidentiality !== 'PUBLIC').length },
      { key: 'PUBLIC', count: requests.filter((r) => r.author_id && r.confidentiality === 'PUBLIC').length },
      { key: 'ANONYMOUS', count: requests.filter((r) => !r.author_id).length },
    ],
    series: series.map((s) => ({ day: s.day, ...byDay.get(s.day)! })),
  };
}
