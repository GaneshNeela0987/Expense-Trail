import {formatMonthLabel} from './monthOptions';

export type AnalyticsPeriod = 'month' | 'week' | 'day';

export interface AnalyticsDateRange {
  start: Date;
  endExclusive: Date;
  label: string;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function tomorrowStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export function getAnalyticsDateRange(
  period: AnalyticsPeriod,
  anchorDate: Date,
  currentDate = new Date(),
): AnalyticsDateRange {
  const tomorrow = tomorrowStart(currentDate);
  let start: Date;
  let endExclusive: Date;

  if (period === 'month') {
    start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    endExclusive = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
  } else if (period === 'week') {
    start = startOfDay(anchorDate);
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    endExclusive = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  } else {
    start = startOfDay(anchorDate);
    endExclusive = tomorrowStart(start);
  }

  if (endExclusive.getTime() > tomorrow.getTime()) {
    endExclusive = tomorrow;
  }

  const lastIncludedDay = new Date(endExclusive.getTime() - 1);
  const dateLabel = (date: Date) =>
    date.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
  const label =
    period === 'month'
      ? formatMonthLabel(start)
      : period === 'day'
        ? start.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : `${dateLabel(start)} – ${dateLabel(lastIncludedDay)}`;

  return {start, endExclusive, label};
}

export function shiftAnalyticsAnchor(
  period: AnalyticsPeriod,
  anchorDate: Date,
  direction: -1 | 1,
  currentDate = new Date(),
): Date | null {
  const shifted = new Date(anchorDate);
  if (period === 'month') {
    shifted.setDate(1);
    shifted.setMonth(shifted.getMonth() + direction);
  } else {
    shifted.setDate(shifted.getDate() + direction * (period === 'week' ? 7 : 1));
  }

  if (startOfDay(shifted).getTime() > startOfDay(currentDate).getTime()) {
    return null;
  }
  return shifted;
}
