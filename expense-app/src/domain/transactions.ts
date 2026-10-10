import {addPaise, type Paise} from './money';

export type TransactionKind =
  | 'expense'
  | 'refund'
  | 'income'
  | 'transfer'
  | 'failed'
  | 'reversed';

export type TransactionRelationship =
  | 'refund'
  | 'reversal'
  | 'transfer'
  | 'credit-card-payment'
  | 'duplicate';

export interface LedgerTransaction {
  id: string;
  amountPaise: Paise;
  kind: TransactionKind;
}

export interface TransactionLink {
  sourceTransactionId: string;
  targetTransactionId: string;
  relationship: TransactionRelationship;
}

const EXCLUDE_BOTH_ENDPOINTS = new Set<TransactionRelationship>([
  'reversal',
  'transfer',
  'credit-card-payment',
]);

export function calculateNetSpendPaise(
  transactions: readonly LedgerTransaction[],
  links: readonly TransactionLink[] = [],
): Paise {
  const excludedIds = new Set<string>();

  for (const link of links) {
    if (EXCLUDE_BOTH_ENDPOINTS.has(link.relationship)) {
      excludedIds.add(link.sourceTransactionId);
      excludedIds.add(link.targetTransactionId);
    } else if (link.relationship === 'duplicate') {
      excludedIds.add(link.targetTransactionId);
    }
  }

  let total = 0;

  for (const transaction of transactions) {
    if (
      !Number.isSafeInteger(transaction.amountPaise) ||
      transaction.amountPaise < 0
    ) {
      throw new RangeError(
        `Transaction ${transaction.id} must have a non-negative safe-integer amount in paise.`,
      );
    }

    if (excludedIds.has(transaction.id)) {
      continue;
    }

    switch (transaction.kind) {
      case 'expense':
        total = addPaise(total, transaction.amountPaise);
        break;
      case 'refund':
        total = addPaise(total, -transaction.amountPaise);
        break;
      case 'income':
      case 'transfer':
      case 'failed':
      case 'reversed':
        break;
    }
  }

  return total;
}
