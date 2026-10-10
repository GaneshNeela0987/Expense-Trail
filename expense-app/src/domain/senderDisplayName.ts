const BANK_NAMES: ReadonlyArray<{tokens: readonly string[]; name: string}> = [
  {tokens: ['KOTAK'], name: 'Kotak Mahindra Bank'},
  {tokens: ['AXIS'], name: 'Axis Bank'},
  {tokens: ['HDFC'], name: 'HDFC Bank'},
  {tokens: ['ICICI'], name: 'ICICI Bank'},
  {tokens: ['SBI', 'SBIN'], name: 'State Bank of India'},
  {tokens: ['PNB'], name: 'Punjab National Bank'},
  {tokens: ['IDFC'], name: 'IDFC FIRST Bank'},
  {tokens: ['YESBANK', 'YESB'], name: 'YES Bank'},
  {tokens: ['INDUS'], name: 'IndusInd Bank'},
  {tokens: ['FEDERAL'], name: 'Federal Bank'},
  {tokens: ['JUPITER'], name: 'Jupiter'},
  {tokens: ['AU BANK', 'AUBANK'], name: 'AU Small Finance Bank'},
];

export function getSenderDisplayName(sender: string): string {
  const normalizedSender = sender.trim().toUpperCase();
  const bank = BANK_NAMES.find(({tokens}) =>
    tokens.some(token => normalizedSender.includes(token)),
  );

  if (bank) {
    return bank.name;
  }

  return normalizedSender ? `Bank · ${normalizedSender}` : 'Bank';
}
