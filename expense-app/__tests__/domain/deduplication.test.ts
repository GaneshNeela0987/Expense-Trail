import {
  DEFAULT_DUPLICATE_WINDOW_MS,
  isDuplicateTransaction,
  type DeduplicationCandidate,
} from '../../src/domain/deduplication';

const original: DeduplicationCandidate = {
  amountPaise: 125050,
  accountLast4: '1234',
  bankId: 'axis',
  normalizedMerchant: 'Swiggy',
  occurredAt: 1_760_000_000_000,
  paymentMode: 'UPI',
  referenceNumber: 'UTR12345',
  smsHash: 'hmac:abc123',
};

describe('isDuplicateTransaction', () => {
  it('matches identical message hashes without storing message content', () => {
    expect(
      isDuplicateTransaction(
        original,
        {...original, smsHash: ' HMAC:ABC123 '},
      ),
    ).toBe(true);
  });

  it('matches a repeated bank reference with the same bank and amount', () => {
    expect(
      isDuplicateTransaction(
        {...original, smsHash: null, occurredAt: original.occurredAt + 30_000},
        {...original, smsHash: null, referenceNumber: 'utr12345'},
      ),
    ).toBe(true);
  });

  it('matches merchant-based candidates inside the configured time window', () => {
    const candidate = {
      ...original,
      referenceNumber: null,
      smsHash: null,
      occurredAt: original.occurredAt + DEFAULT_DUPLICATE_WINDOW_MS,
      normalizedMerchant: ' SWIGGY ',
      paymentMode: 'upi',
    };
    const existing = {
      ...original,
      referenceNumber: null,
      smsHash: null,
    };

    expect(isDuplicateTransaction(candidate, existing)).toBe(true);
  });

  it('does not merge transactions outside the time window', () => {
    expect(
      isDuplicateTransaction(
        {
          ...original,
          referenceNumber: null,
          smsHash: null,
          occurredAt: original.occurredAt + DEFAULT_DUPLICATE_WINDOW_MS + 1,
        },
        {...original, referenceNumber: null, smsHash: null},
      ),
    ).toBe(false);
  });

  it('does not merge different amounts, accounts, banks, merchants, or references', () => {
    const noHashOriginal = {...original, smsHash: null};

    expect(
      isDuplicateTransaction(
        {...noHashOriginal, amountPaise: 125051},
        noHashOriginal,
      ),
    ).toBe(false);
    expect(
      isDuplicateTransaction(
        {...noHashOriginal, accountLast4: '9999'},
        noHashOriginal,
      ),
    ).toBe(false);
    expect(
      isDuplicateTransaction({...noHashOriginal, bankId: 'kotak'}, noHashOriginal),
    ).toBe(false);
    expect(
      isDuplicateTransaction(
        {...noHashOriginal, normalizedMerchant: 'Zomato', referenceNumber: null},
        {...noHashOriginal, referenceNumber: null},
      ),
    ).toBe(false);
    expect(
      isDuplicateTransaction(
        {
          ...noHashOriginal,
          referenceNumber: 'different-reference',
        },
        noHashOriginal,
      ),
    ).toBe(false);
  });

  it('rejects invalid amounts, timestamps, and time windows', () => {
    expect(() =>
      isDuplicateTransaction({...original, amountPaise: -1}, original),
    ).toThrow(RangeError);
    expect(() =>
      isDuplicateTransaction({...original, occurredAt: Number.NaN}, original),
    ).toThrow(RangeError);
    expect(() => isDuplicateTransaction(original, original, -1)).toThrow(
      RangeError,
    );
  });
});
