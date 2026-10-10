interface SpendingAnswerData {
  periodLabel: string;
  debitTotalPaise: number;
  creditTotalPaise: number;
  netSpendPaise: number;
  debitCount: number;
  creditCount: number;
  debitCategories: Array<{name: string; amountPaise: number; count: number}>;
}

function formatAnswerAmount(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const fraction = String(paise % 100).padStart(2, '0');
  return `₹${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(rupees)}.${fraction}`;
}

export function answerSpendingQuestion(
  question: string,
  transactionCount: number,
  summary?: SpendingAnswerData,
): string {
  if (!question.trim()) {
    return 'Ask about your spending, a merchant, or a category.';
  }

  if (transactionCount === 0) {
    return `There are no confirmed imported transactions for ${summary?.periodLabel ?? 'this month'} yet. Import matching history from USER to get an on-device summary.`;
  }

  const normalizedQuestion = question.toLocaleLowerCase('en-IN');
  const periodLabel = summary?.periodLabel ?? 'this month';
  if (summary && /\b(?:credit|income|received)\b/.test(normalizedQuestion)) {
    return `In ${periodLabel}, you have ${formatAnswerAmount(summary.creditTotalPaise)} across ${summary.creditCount} confirmed credit${summary.creditCount === 1 ? '' : 's'}.`;
  }
  if (summary && /\b(?:category|categories|where|top)\b/.test(normalizedQuestion)) {
    const topCategory = summary.debitCategories[0];
    return topCategory
      ? `${topCategory.name} is your top debit category in ${periodLabel} at ${formatAnswerAmount(topCategory.amountPaise)} across ${topCategory.count} transaction${topCategory.count === 1 ? '' : 's'}.`
      : `There are no confirmed debit categories for ${periodLabel} yet.`;
  }
  if (summary && /\b(?:debit|spent|spend|expense|expenses)\b/.test(normalizedQuestion)) {
    return `In ${periodLabel}, your confirmed net spend is ${formatAnswerAmount(summary.netSpendPaise)} from ${summary.debitCount} debit${summary.debitCount === 1 ? '' : 's'}, after refunds.`;
  }

  return 'I can only answer from transactions stored on this device. This query is not supported yet.';
}
