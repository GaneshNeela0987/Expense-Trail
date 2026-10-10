export function getAvailableMonthOptions(
  timestamps: readonly number[],
  currentDate = new Date(),
): Date[] {
  const currentMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  );
  const validTimestamps = timestamps.filter(
    timestamp => Number.isFinite(timestamp) && timestamp >= 0,
  );
  const fallbackFirstMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 60,
    1,
  );
  const earliestTimestamp =
    validTimestamps.length > 0 ? Math.min(...validTimestamps) : null;
  const earliestDate =
    earliestTimestamp === null ? fallbackFirstMonth : new Date(earliestTimestamp);
  const transactionFirstMonth = new Date(
    earliestDate.getFullYear(),
    earliestDate.getMonth(),
    1,
  );
  const firstMonth =
    earliestTimestamp === null
      ? fallbackFirstMonth
      : transactionFirstMonth.getTime() > currentMonth.getTime()
        ? currentMonth
        : transactionFirstMonth;
  const months: Date[] = [];

  for (
    let month = currentMonth;
    month.getTime() >= firstMonth.getTime();
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  ) {
    months.push(month);
  }

  return months;
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
