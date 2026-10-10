import {addPaise, formatInrAmount, parseInrAmount} from '../../src/domain/money';

describe('parseInrAmount', () => {
  it.each([
    ['₹1,234.56', 123456],
    ['INR 1,234.5', 123450],
    ['Rs. 1,23,456.78', 12345678],
    ['12.05', 1205],
    ['0.5', 50],
    ['1,234', 123400],
  ])('parses %s into paise', (value, expected) => {
    expect(parseInrAmount(value)).toBe(expected);
  });

  it.each([
    '',
    '₹',
    '1,23',
    '1,234.567',
    '-12.00',
    '12 INR',
    '1e3',
    '₹1,234.56 spent',
  ])('rejects invalid amount %s', value => {
    expect(parseInrAmount(value)).toBeNull();
  });

  it('rejects amounts outside the safe integer range', () => {
    expect(parseInrAmount('90071992547409.92')).toBeNull();
  });
});

describe('formatInrAmount', () => {
  it.each([
    [0, '₹0.00'],
    [123456, '₹1,234.56'],
    [-50, '-₹0.50'],
  ])('formats %i paise', (amount, expected) => {
    expect(formatInrAmount(amount)).toBe(expected);
  });
});

describe('addPaise', () => {
  it('rejects unsafe arithmetic', () => {
    expect(() => addPaise(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});
