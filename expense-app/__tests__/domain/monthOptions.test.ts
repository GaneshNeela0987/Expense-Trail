import {
  formatMonthLabel,
  getAvailableMonthOptions,
} from '../../src/domain/monthOptions';

describe('getAvailableMonthOptions', () => {
  it('lists months from earliest transaction through current, newest first', () => {
    const current = new Date(2026, 9, 9);
    const options = getAvailableMonthOptions(
      [new Date(2026, 7, 31).getTime(), new Date(2026, 8, 1).getTime()],
      current,
    );

    expect(options).toEqual([
      new Date(2026, 9, 1),
      new Date(2026, 8, 1),
      new Date(2026, 7, 1),
    ]);
  });

  it('does not offer a future month', () => {
    const options = getAvailableMonthOptions(
      [new Date(2026, 9, 1).getTime(), new Date(2026, 11, 1).getTime()],
      new Date(2026, 9, 9),
    );

    expect(options).toEqual([new Date(2026, 9, 1)]);
  });

  it('offers previous months when there are no transactions', () => {
    const options = getAvailableMonthOptions([], new Date(2026, 9, 9));

    expect(options[0]).toEqual(new Date(2026, 9, 1));
    expect(options[1]).toEqual(new Date(2026, 8, 1));
  });

  it('formats month labels for the selector', () => {
    expect(formatMonthLabel(new Date(2026, 9, 1))).toBe('October 2026');
  });
});
