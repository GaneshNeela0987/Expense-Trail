export interface MerchantRule {
  pattern: RegExp;
  normalizedName: string;
  category: string;
}

export interface NormalizedMerchant {
  name: string;
  suggestedCategory: string;
}

const DEFAULT_RULES: readonly MerchantRule[] = [
  {pattern: /\bswiggy\b/i, normalizedName: 'Swiggy', category: 'Food'},
  {pattern: /\bzomato\b/i, normalizedName: 'Zomato', category: 'Food'},
  {
    pattern: /\bbigbasket\b|\bbig basket\b/i,
    normalizedName: 'BigBasket',
    category: 'Groceries',
  },
  {
    pattern: /\buber\b/i,
    normalizedName: 'Uber',
    category: 'Transport',
  },
  {
    pattern: /\bnetflix\b/i,
    normalizedName: 'Netflix',
    category: 'Entertainment',
  },
  {
    pattern: /\bamazon\b/i,
    normalizedName: 'Amazon',
    category: 'Shopping',
  },
  {
    pattern: /\b(?:digital\s*gold|e[-\s]?gold)\b/i,
    normalizedName: 'Digital Gold',
    category: 'Digital Gold',
  },
  {
    pattern: /\b(?:ola|rapido|irctc|uber|metro|railway|flight|airlines?)\b/i,
    normalizedName: 'Transport',
    category: 'Transport',
  },
  {
    pattern: /\b(?:zepto|blinkit|instamart|grocery|groceries|dmart)\b/i,
    normalizedName: 'Groceries',
    category: 'Groceries',
  },
  {
    pattern: /\b(?:electricity|water bill|gas bill|broadband|mobile recharge)\b/i,
    normalizedName: 'Utilities',
    category: 'Utilities',
  },
  {
    pattern: /\b(?:pharmacy|medical|hospital|clinic|apollo pharmacy)\b/i,
    normalizedName: 'Healthcare',
    category: 'Healthcare',
  },
  {
    pattern: /\b(?:rent|landlord|housing society|maintenance)\b/i,
    normalizedName: 'Housing',
    category: 'Housing',
  },
];

const DECORATION_PATTERN = /(?:\*|#|\/|\\|_)(?:ORDER|TXN|REF)?[\w-]*$/i;
const PAYMENT_SUFFIX_PATTERN =
  /\s*(?:PAYMENTS?|ONLINE|INDIA|IN|PVT\.?\s*LTD\.?|PRIVATE LIMITED)\s*$/i;

export function normalizeMerchant(
  rawName: string,
  userRules: readonly MerchantRule[] = [],
): NormalizedMerchant {
  const candidate = rawName
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

  if (!candidate) {
    return {name: 'Unknown merchant', suggestedCategory: 'Other'};
  }

  const applicableRule = [...userRules, ...DEFAULT_RULES].find(rule =>
    rule.pattern.test(candidate),
  );

  if (applicableRule) {
    return {
      name: applicableRule.normalizedName,
      suggestedCategory: applicableRule.category,
    };
  }

  const cleaned = candidate
    .replace(DECORATION_PATTERN, '')
    .replace(PAYMENT_SUFFIX_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {name: 'Unknown merchant', suggestedCategory: 'Other'};
  }

  return {
    name: cleaned
      .toLocaleLowerCase('en-IN')
      .replace(/(^|[\s'-])\p{L}/gu, letter => letter.toLocaleUpperCase('en-IN')),
    suggestedCategory: 'Other',
  };
}
