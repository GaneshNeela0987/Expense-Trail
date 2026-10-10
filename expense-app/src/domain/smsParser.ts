import {
  classifySms,
  shouldIgnoreSms,
  type SmsClassification,
} from './smsClassification';
import {parseInrAmount, type Paise} from './money';
import {normalizeMerchant} from './merchantNormalization';

export interface ParsedSmsCandidate {
  classification: SmsClassification;
  confidence: number;
  amountPaise: Paise | null;
  merchant: string | null;
  category: string;
  confirmed: boolean;
  requiresReview: boolean;
  reviewReason: string;
}

const CURRENCY_AMOUNT_PATTERN =
  /(?:₹|\bINR\b|\bRs\.?|\bRupees?\b)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\bINR\b|\bRs\.?|\bRupees?\b)/gi;
const MERCHANT_PATTERNS = [
  /\b(?:merchant|payee|at|to|towards)\s*[:=-]?\s*([A-Z0-9][A-Z0-9 .&'@_-]{1,48}?)(?=\s+\b(?:on|using|via|for|ref(?:erence)?|txn|transaction|available|avl|bal(?:ance)?|upi|vpa|rrn|auth(?:orization)?)\b|[.,;|/]|$)/i,
  /\b(?:UPI|VPA)\s*[-:/ ]+\s*([A-Z][A-Z0-9 .&'-]{1,40}?)(?=\s*(?:\/|@|\b(?:ref|rrn|txn|transaction|on|from|to)\b|[.,;]|$))/i,
];
const DIGITAL_GOLD_MERCHANT_PATTERN =
  /\b((?:digital\s*gold|e[-\s]?gold)(?:\s+[A-Z][A-Z&.'-]*){0,4})\s+(?:has\s+)?(?:received|bought|purchased|purchase|buy|accumulated|credited)\b/i;

const CATEGORY_RULES: ReadonlyArray<{category: string; pattern: RegExp}> = [
  {
    category: 'Food',
    pattern: /\b(?:restaurant|food|cafe|coffee|swiggy|zomato|dining)\b/i,
  },
  {
    category: 'Groceries',
    pattern: /\b(?:grocery|groceries|supermarket|bigbasket|zepto|blinkit)\b/i,
  },
  {
    category: 'Transport',
    pattern: /\b(?:fuel|petrol|diesel|uber|ola|rapido|metro|toll|parking)\b/i,
  },
  {
    category: 'Utilities',
    pattern:
      /\b(?:electricity|utility|water bill|gas bill|broadband|recharge)\b/i,
  },
  {
    category: 'Healthcare',
    pattern: /\b(?:pharmacy|medicine|medical|hospital|clinic|healthcare)\b/i,
  },
  {
    category: 'Housing',
    pattern: /\b(?:rent|landlord|housing|maintenance)\b/i,
  },
  {
    category: 'Entertainment',
    pattern: /\b(?:movie|cinema|subscription|netflix|spotify|entertainment)\b/i,
  },
  {
    category: 'Shopping',
    pattern: /\b(?:shopping|e-?commerce|amazon|flipkart|purchase)\b/i,
  },
  {
    category: 'Bills',
    pattern: /\b(?:bill payment|credit card bill|loan emi|emi payment)\b/i,
  },
];

function inferCategory(
  body: string,
  merchant: string | null,
  classification: SmsClassification,
): string {
  if (/\bsalary\b/i.test(body)) {
    return 'Salary';
  }
  if (/\b(?:digital\s*|e[-\s]?)gold\b/i.test(body)) {
    return 'Digital Gold';
  }
  const merchantCategory = merchant
    ? normalizeMerchant(merchant).suggestedCategory
    : 'Other';
  if (merchantCategory !== 'Other') {
    return merchantCategory;
  }
  const matchedCategory = CATEGORY_RULES.find(rule =>
    rule.pattern.test(body),
  )?.category;
  if (matchedCategory) {
    return matchedCategory;
  }
  return classification === 'income' ? 'Income' : 'Other';
}

export function parseSmsCandidate(body: string): ParsedSmsCandidate | null {
  const result = classifySms(body);
  if (shouldIgnoreSms(result)) {
    return null;
  }

  const amounts = Array.from(body.matchAll(CURRENCY_AMOUNT_PATTERN))
    .map(match => ({
      amount: match[1] ?? match[2],
      index: match.index ?? 0,
      text: match[0],
    }))
    .filter(
      (match): match is {amount: string; index: number; text: string} =>
        match.amount !== undefined,
    );
  const transactionAmounts = amounts.filter(match => {
    const preceding = body.slice(Math.max(0, match.index - 35), match.index);
    const following = body.slice(
      match.index + match.text.length,
      match.index + match.text.length + 20,
    );
    return (
      !/\b(?:available|current|account|ledger)\s+balance|(?:avl\.?\s*bal|credit\s+limit|total\s+due|minimum\s+due|outstanding)\s*$|\b(?:bal|balance)\s*:?\s*$/i.test(
        preceding,
      ) &&
      !/^\s*(?:available|current|account|ledger)\s+balance\b/i.test(following)
    );
  });
  const amountPaise =
    transactionAmounts.length === 1
      ? parseInrAmount(transactionAmounts[0]?.amount ?? '')
      : null;

  const digitalGoldMerchantMatch = DIGITAL_GOLD_MERCHANT_PATTERN.exec(body);
  const merchantMatch = MERCHANT_PATTERNS.map(pattern =>
    pattern.exec(body),
  ).find(match => match?.[1]);
  const rawMerchant = (digitalGoldMerchantMatch?.[1] ?? merchantMatch?.[1])
    ?.replace(/@[A-Z0-9._-]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const merchant = rawMerchant &&
    !/^(?:your|my|the)?\s*(?:account|card|bank|wallet|a\/c)(?:\s+.*)?$/i.test(
      rawMerchant,
    )
    ? normalizeMerchant(rawMerchant).name
    : null;

  const category = inferCategory(body, merchant, result.classification);
  const canAutoConfirm =
    (result.classification === 'expense' ||
      result.classification === 'income' ||
      result.classification === 'refund') &&
    !result.requiresReview &&
    amountPaise !== null;
  const reasons = [
    result.classification === 'unknown'
      ? 'Message type is not recognized.'
      : null,
    transactionAmounts.length === 0
      ? 'No transaction INR amount was found.'
      : null,
    transactionAmounts.length > 1
      ? 'Multiple transaction INR amounts need checking.'
      : null,
    amountPaise === null && transactionAmounts.length === 1
      ? 'The amount could not be parsed safely.'
      : null,
    merchant === null ? 'Merchant could not be identified confidently.' : null,
  ].filter((reason): reason is string => reason !== null);

  return {
    classification: result.classification,
    confidence: result.confidence,
    amountPaise,
    merchant,
    category,
    confirmed: canAutoConfirm,
    requiresReview: !canAutoConfirm,
    reviewReason: reasons.join(' ') || 'Confirm the imported details.',
  };
}
