import {
  summarizeDateRange,
  summarizeMonth,
  type LocalTransaction,
} from '../../src/domain/transactionSummary';

describe('summarizeMonth', () => {
  const now = new Date(2026, 9, 9);
  const transactions: LocalTransaction[] = [
    {
      id: 'debit-1',
      timestamp: new Date(2026, 9, 3).getTime(),
      classification: 'expense',
      amountPaise: 49900,
      merchant: 'Swiggy',
      category: 'Food',
      confirmed: true,
    },
    {
      id: 'credit-1',
      timestamp: new Date(2026, 9, 4).getTime(),
      classification: 'income',
      amountPaise: 6500000,
      merchant: null,
      category: 'Salary',
      confirmed: true,
    },
    {
      id: 'card-repayment',
      timestamp: new Date(2026, 9, 5).getTime(),
      classification: 'transfer',
      amountPaise: 250000,
      merchant: 'Example Bank Credit Card',
      category: 'Bills',
      confirmed: true,
    },
    {
      id: 'review',
      timestamp: new Date(2026, 9, 5).getTime(),
      classification: 'expense',
      amountPaise: 50000,
      merchant: 'Unknown',
      category: 'Other',
      confirmed: false,
    },
    {
      id: 'prior-month',
      timestamp: new Date(2026, 8, 30).getTime(),
      classification: 'expense',
      amountPaise: 10000,
      merchant: 'Prior',
      category: 'Other',
      confirmed: true,
    },
  ];

  it('summarizes only confirmed transactions in the selected month', () => {
    const summary = summarizeMonth(transactions, now);
    expect(summary.debitTotalPaise).toBe(49900);
    expect(summary.creditTotalPaise).toBe(6500000);
    expect(summary.debitCount).toBe(1);
    expect(summary.creditCategories).toEqual([
      {name: 'Salary', amountPaise: 6500000, count: 1},
    ]);
    expect(summary.creditCount).toBe(1);
    expect(summary.debitCategories).toEqual([
      {name: 'Food', amountPaise: 49900, count: 1},
    ]);
  });

  it('counts refunds as credits and subtracts them from net spend', () => {
    const refund: LocalTransaction = {
      id: 'refund-1',
      timestamp: new Date(2026, 9, 6).getTime(),
      classification: 'refund',
      amountPaise: 9000,
      merchant: 'Swiggy',
      category: 'Food',
      confirmed: true,
    };
    const summary = summarizeMonth([...transactions, refund], now);

    expect(summary.refundTotalPaise).toBe(9000);
    expect(summary.creditTotalPaise).toBe(6509000);
    expect(summary.creditCount).toBe(2);
    expect(summary.netSpendPaise).toBe(40900);
  });

  it('summarizes confirmed activity inside an inclusive-start exclusive-end range', () => {
    const start = new Date(2026, 9, 3).getTime();
    const end = new Date(2026, 9, 4).getTime();
    const summary = summarizeDateRange(transactions, start, end);

    expect(summary.debitTotalPaise).toBe(49900);
    expect(summary.debitCount).toBe(1);
    expect(summary.creditTotalPaise).toBe(0);
  });
});
