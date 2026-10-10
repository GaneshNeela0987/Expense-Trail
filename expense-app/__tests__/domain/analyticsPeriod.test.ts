import {
  getAnalyticsDateRange,
  shiftAnalyticsAnchor,
} from '../../src/domain/analyticsPeriod';

describe('analytics date ranges', () => {
  const currentDate = new Date(2026, 9, 10, 15, 30);

  it('returns the selected calendar month', () => {
    const range = getAnalyticsDateRange(
      'month',
      new Date(2026, 8, 15),
      currentDate,
    );

    expect(range.start).toEqual(new Date(2026, 8, 1));
    expect(range.endExclusive).toEqual(new Date(2026, 9, 1));
    expect(range.label).toBe('September 2026');
  });

  it('returns a Monday-based week capped at today', () => {
    const range = getAnalyticsDateRange(
      'week',
      new Date(2026, 9, 10),
      currentDate,
    );

    expect(range.start).toEqual(new Date(2026, 9, 5));
    expect(range.endExclusive).toEqual(new Date(2026, 9, 11));
    expect(range.label).toBe('5 Oct – 10 Oct');
  });

  it('returns a single calendar day', () => {
    const range = getAnalyticsDateRange(
      'day',
      new Date(2026, 9, 10),
      currentDate,
    );

    expect(range.start).toEqual(new Date(2026, 9, 10));
    expect(range.endExclusive).toEqual(new Date(2026, 9, 11));
  });

  it('prevents navigating into future dates', () => {
    expect(
      shiftAnalyticsAnchor('day', currentDate, 1, currentDate),
    ).toBeNull();
    expect(
      shiftAnalyticsAnchor('week', currentDate, 1, currentDate),
    ).toBeNull();
    expect(
      shiftAnalyticsAnchor('month', new Date(2026, 9, 1), 1, currentDate),
    ).toBeNull();
  });
});
