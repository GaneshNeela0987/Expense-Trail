export type Paise = number;

const AMOUNT_PATTERN =
  /^(?:(?:₹|INR\b|Rs\.?)\s*)?((?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3}))(?:\.(\d{1,2}))?$/i;

export function parseInrAmount(value: string): Paise | null {
  const match = AMOUNT_PATTERN.exec(value.trim());
  const amountText = match?.[1];

  if (!amountText) {
    return null;
  }

  const whole = Number(amountText.replaceAll(',', ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const paise = whole * 100 + fraction;

  return Number.isSafeInteger(paise) ? paise : null;
}

export function formatInrAmount(paise: Paise): string {
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError('Amount must be a safe integer number of paise.');
  }

  const sign = paise < 0 ? '-' : '';
  const absolutePaise = Math.abs(paise);
  const rupees = Math.floor(absolutePaise / 100);
  const fraction = String(absolutePaise % 100).padStart(2, '0');
  const formattedRupees = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(rupees);

  return `${sign}₹${formattedRupees}.${fraction}`;
}

export function addPaise(left: Paise, right: Paise): Paise {
  const result = left + right;

  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(result)) {
    throw new RangeError('Amount arithmetic exceeded the safe integer range.');
  }

  return result;
}
