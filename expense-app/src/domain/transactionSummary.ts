export interface LocalTransaction {
  id: string;
  sender?: string;
  timestamp: number;
  classification: string;
  amountPaise: number | null;
  merchant: string | null;
  category: string;
  confirmed: boolean;
}

export interface TransactionSummary {
  debitTotalPaise: number;
  creditTotalPaise: number;
  refundTotalPaise: number;
  incomeTotalPaise: number;
  netSpendPaise: number;
  debitCount: number;
  creditCount: number;
  debitCategories: Array<{name: string; amountPaise: number; count: number}>;
  creditCategories: Array<{name: string; amountPaise: number; count: number}>;
  debits: LocalTransaction[];
  credits: LocalTransaction[];
}

function groupCategories(
  transactions: readonly LocalTransaction[],
): Array<{name: string; amountPaise: number; count: number}> {
  const categories = new Map<
    string,
    {name: string; amountPaise: number; count: number}
  >();
  for (const transaction of transactions) {
    if (transaction.amountPaise === null) continue;
    const name = transaction.category || 'Other';
    const category = categories.get(name) ?? {
      name,
      amountPaise: 0,
      count: 0,
    };
    category.amountPaise += transaction.amountPaise;
    category.count += 1;
    categories.set(name, category);
  }
  return [...categories.values()].sort(
    (left, right) => right.amountPaise - left.amountPaise,
  );
}

export function summarizeDateRange(
  transactions: readonly LocalTransaction[],
  startInclusive: number,
  endExclusive: number,
): TransactionSummary {
  const confirmed = transactions.filter(
    transaction =>
      transaction.confirmed &&
      transaction.amountPaise !== null &&
      Number.isSafeInteger(transaction.amountPaise) &&
      transaction.amountPaise >= 0 &&
      transaction.timestamp >= startInclusive &&
      transaction.timestamp < endExclusive,
  );
  const debits = confirmed.filter(
    transaction => transaction.classification === 'expense',
  );
  const refunds = confirmed.filter(
    transaction => transaction.classification === 'refund',
  );
  const income = confirmed.filter(
    transaction => transaction.classification === 'income',
  );
  const sum = (items: readonly LocalTransaction[]) =>
    items.reduce((total, item) => total + (item.amountPaise ?? 0), 0);

  return {
    debitTotalPaise: sum(debits),
    creditTotalPaise: sum([...income, ...refunds]),
    refundTotalPaise: sum(refunds),
    incomeTotalPaise: sum(income),
    netSpendPaise: sum(debits) - sum(refunds),
    debitCount: debits.length,
    creditCount: income.length + refunds.length,
    debitCategories: groupCategories(debits),
    creditCategories: groupCategories([...income, ...refunds]),
    debits: [...debits].sort((left, right) => right.timestamp - left.timestamp),
    credits: [...income, ...refunds].sort(
      (left, right) => right.timestamp - left.timestamp,
    ),
  };
}

export function summarizeMonth(
  transactions: readonly LocalTransaction[],
  now = new Date(),
): TransactionSummary {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return summarizeDateRange(transactions, start.getTime(), end.getTime());
}
