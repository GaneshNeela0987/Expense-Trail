import {
  calculateNetSpendPaise,
  type LedgerTransaction,
  type TransactionLink,
} from '../../src/domain/transactions';

const transactions: LedgerTransaction[] = [
  {id: 'purchase', amountPaise: 200000, kind: 'expense'},
  {id: 'partial-refund', amountPaise: 50000, kind: 'refund'},
  {id: 'salary', amountPaise: 5000000, kind: 'income'},
  {id: 'bank-transfer-out', amountPaise: 100000, kind: 'expense'},
  {id: 'card-payment-in', amountPaise: 100000, kind: 'income'},
  {id: 'duplicate-purchase', amountPaise: 200000, kind: 'expense'},
  {id: 'failed-purchase', amountPaise: 90000, kind: 'failed'},
  {id: 'reversed-purchase', amountPaise: 70000, kind: 'reversed'},
];

const links: TransactionLink[] = [
  {
    sourceTransactionId: 'bank-transfer-out',
    targetTransactionId: 'card-payment-in',
    relationship: 'credit-card-payment',
  },
  {
    sourceTransactionId: 'purchase',
    targetTransactionId: 'duplicate-purchase',
    relationship: 'duplicate',
  },
  {
    sourceTransactionId: 'failed-purchase',
    targetTransactionId: 'reversed-purchase',
    relationship: 'reversal',
  },
];

describe('calculateNetSpendPaise', () => {
  it('excludes income, transfers, duplicates, failed and reversed transactions and subtracts refunds', () => {
    expect(calculateNetSpendPaise(transactions, links)).toBe(150000);
  });

  it('allows a refund to be represented even when its purchase is outside the selected period', () => {
    expect(
      calculateNetSpendPaise([
        {id: 'late-refund', amountPaise: 2500, kind: 'refund'},
      ]),
    ).toBe(-2500);
  });

  it('rejects invalid persisted amounts instead of silently excluding them', () => {
    expect(() =>
      calculateNetSpendPaise([
        {id: 'invalid', amountPaise: -1, kind: 'expense'},
      ]),
    ).toThrow(RangeError);
  });

  it('rejects unsafe totals', () => {
    expect(() =>
      calculateNetSpendPaise([
        {id: 'first', amountPaise: Number.MAX_SAFE_INTEGER, kind: 'expense'},
        {id: 'second', amountPaise: 1, kind: 'expense'},
      ]),
    ).toThrow(RangeError);
  });
});
