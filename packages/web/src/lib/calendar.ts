export type CalendarView = 'day' | 'week' | 'month';

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Monday-start week, matching the ISO week convention used elsewhere in the app's date handling. */
function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function startOfMonth(date: Date): Date {
  const start = startOfDay(date);
  start.setDate(1);
  return start;
}

/** Half-open [start, end) range covering the given view around referenceDate. */
export function getViewRange(view: CalendarView, referenceDate: Date): { start: Date; end: Date } {
  if (view === 'day') {
    const start = startOfDay(referenceDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (view === 'week') {
    const start = startOfWeek(referenceDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  const start = startOfMonth(referenceDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export function shiftReferenceDate(view: CalendarView, referenceDate: Date, direction: 1 | -1): Date {
  const next = new Date(referenceDate);
  if (view === 'day') next.setDate(next.getDate() + direction);
  else if (view === 'week') next.setDate(next.getDate() + 7 * direction);
  else next.setMonth(next.getMonth() + direction);
  return next;
}

export function isWithinView(isoDate: string, view: CalendarView, referenceDate: Date): boolean {
  const { start, end } = getViewRange(view, referenceDate);
  const t = new Date(isoDate).getTime();
  return t >= start.getTime() && t < end.getTime();
}

export function formatViewRangeLabel(view: CalendarView, referenceDate: Date): string {
  const { start, end } = getViewRange(view, referenceDate);
  if (view === 'day') {
    return start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (view === 'week') {
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    const sameMonth = start.getMonth() === lastDay.getMonth();
    const startLabel = start.toLocaleDateString('fr-FR', { day: 'numeric', month: sameMonth ? undefined : 'short' });
    const endLabel = lastDay.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  }
  return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
