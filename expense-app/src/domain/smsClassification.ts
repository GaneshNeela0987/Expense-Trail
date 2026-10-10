export type SmsClassification =
  | 'expense'
  | 'refund'
  | 'income'
  | 'transfer'
  | 'failed'
  | 'reversed'
  | 'otp'
  | 'promotional'
  | 'balance'
  | 'unknown';

export interface ClassificationResult {
  classification: SmsClassification;
  confidence: number;
  requiresReview: boolean;
}

const RULES: ReadonlyArray<{
  classification: SmsClassification;
  pattern: RegExp;
  confidence: number;
}> = [
  {
    classification: 'otp',
    pattern: /\b(?:otp|one[- ]time password|verification code)\b/i,
    confidence: 0.99,
  },
  {
    classification: 'reversed',
    pattern: /\b(?:reversed|reversal|chargeback|voided)\b/i,
    confidence: 0.98,
  },
  {
    classification: 'failed',
    pattern:
      /\b(?:failed|declined|unsuccessful|not completed|could not be processed)\b/i,
    confidence: 0.97,
  },
  {
    classification: 'refund',
    pattern:
      /\b(?:refund(?:ed)?|cashback credited|reimbursed|reimbursement)\b/i,
    confidence: 0.96,
  },
  {
    classification: 'transfer',
    pattern:
      /\b(?:transferred to|transfer(?:red)? (?:to|from)|fund transfer|self transfer|credit card bill payment|sent (?:to|from)|upi transfer|imps transfer|neft transfer)\b/i,
    confidence: 0.94,
  },
  {
    classification: 'income',
    pattern:
      /\b(?:salary|pension|interest|dividend|cashback|benefit|reimbursement)\s+(?:has been\s+)?credited\b|\b(?:salary|pension|interest|dividend)\s+received\b|\bcredited to your account\b/i,
    confidence: 0.84,
  },
  {
    classification: 'expense',
    pattern:
      /\b(?:spent|debited|debit(?:ed)?(?:\s+of)?|deducted|charged|purchase(?:d)?|paid to|payment of|txn of|transaction of|withdrawn|cash withdrawal|atm withdrawal|pos transaction|e-?com(?:merce)? transaction|autopay(?:ment)?|mandate executed|used at)\b|(?:₹|INR\b|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?\s+sent\b|\bsent\s+(?:₹|INR\b|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?/i,
    confidence: 0.9,
  },
  {
    classification: 'income',
    pattern:
      /\b(?:credited to|credited with|credit received|deposit(?:ed)?|money received|received (?:INR|Rs\.?|₹|payment|amount))\b/i,
    confidence: 0.84,
  },
  {
    classification: 'income',
    pattern: /\b(?:credited|received)\b/i,
    confidence: 0.82,
  },
  {
    classification: 'balance',
    pattern:
      /\b(?:available balance|current balance|account balance|avl\.?\s*bal|ledger balance|bal:|balance is)\b/i,
    confidence: 0.85,
  },
  {
    classification: 'promotional',
    pattern:
      /\b(?:offer|discount|shop now|apply now|pre[- ]?approved|win(?:ner)?|limited period|cashback up to|earn reward points|exclusive deal)\b/i,
    confidence: 0.85,
  },
];

export function classifySms(message: string): ClassificationResult {
  const isCreditCardRepayment =
    /\bpayment\b.*\b(?:received|credited)\b.*\b(?:towards|for)\b.*\bcredit\s+card\b/i.test(
      message,
    );
  if (isCreditCardRepayment) {
    return {
      classification: 'transfer',
      confidence: 0.97,
      requiresReview: false,
    };
  }

  const isMoneySentToPayee =
    /(?:₹|INR\b|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?\s+sent\s+(?:to|for)\b|\bsent\s+(?:₹|INR\b|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?\s+(?:to|for)\b/i.test(
      message,
    );
  if (
    isMoneySentToPayee &&
    !/\b(?:own account|self transfer|between my accounts)\b/i.test(message)
  ) {
    return {
      classification: 'expense',
      confidence: 0.9,
      requiresReview: false,
    };
  }

  const isDigitalGoldReceipt =
    /\b(?:digital\s*|e[-\s]?)gold\b/i.test(message) &&
    /\b(?:received|bought|purchased|purchase|buy|bought|accumulated|credited)\b/i.test(
      message,
    ) &&
    !/\b(?:refund(?:ed)?|reversed|failed|declined|otp|offer)\b/i.test(message);
  if (isDigitalGoldReceipt) {
    return {
      classification: 'expense',
      confidence: 0.96,
      requiresReview: false,
    };
  }

  const matchedRules = RULES.filter(rule => rule.pattern.test(message));
  const hasTransactionIntent = matchedRules.some(rule =>
    [
      'expense',
      'refund',
      'income',
      'transfer',
      'failed',
      'reversed',
    ].includes(rule.classification),
  );
  const matchingRules = matchedRules.filter(
    rule =>
      !(hasTransactionIntent && rule.classification === 'balance'),
  );

  if (matchingRules.length === 0) {
    return {
      classification: 'unknown',
      confidence: 0,
      requiresReview: true,
    };
  }

  const topConfidence = Math.max(...matchingRules.map(rule => rule.confidence));
  const strongestRules = matchingRules.filter(
    rule => rule.confidence === topConfidence,
  );

  const strongestClassifications = new Set(
    strongestRules.map(rule => rule.classification),
  );
  if (strongestClassifications.size !== 1) {
    return {
      classification: 'unknown',
      confidence: 0.4,
      requiresReview: true,
    };
  }

  const selected = strongestRules[0];
  const competingIntent = matchingRules.some(
    rule =>
      rule.classification !== selected.classification &&
      rule.confidence >= selected.confidence - 0.12,
  );

  return {
    classification: competingIntent ? 'unknown' : selected.classification,
    confidence: competingIntent ? 0.4 : selected.confidence,
    requiresReview:
      competingIntent ||
      selected.confidence < 0.8 ||
      selected.classification === 'unknown',
  };
}

export function shouldIgnoreSms(result: ClassificationResult): boolean {
  return (
    result.classification === 'otp' ||
    result.classification === 'promotional' ||
    result.classification === 'balance'
  );
}
