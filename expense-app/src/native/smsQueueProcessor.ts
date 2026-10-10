import {parseSmsCandidate} from '../domain/smsParser';
import {
  acknowledgeQueuedSms,
  getPendingSms,
  saveStoredSmsTransactions,
  type StoredSmsTransaction,
} from './sms';

export interface SmsQueueProcessingResult {
  processedMessages: number;
  savedTransactions: number;
  excludedMessages: number;
}

let activeProcessing: Promise<SmsQueueProcessingResult> | null = null;

async function processQueue(): Promise<SmsQueueProcessingResult> {
  const pending = await getPendingSms();
  let savedTransactions = 0;
  let excludedMessages = 0;
  const confirmed: StoredSmsTransaction[] = [];
  const acknowledgements: string[] = [];

  for (const message of pending) {
    const parsed = parseSmsCandidate(message.body);
    acknowledgements.push(message.id);
    if (!parsed || !parsed.confirmed || parsed.amountPaise === null) {
      excludedMessages += 1;
      continue;
    }
    confirmed.push({
      id: message.id,
      sender: message.sender,
      timestamp: message.timestamp,
      classification: parsed.classification,
      confidence: parsed.confidence,
      amountPaise: parsed.amountPaise,
      merchant: parsed.merchant,
      category: parsed.category,
      confirmed: true,
    });
  }

  for (let index = 0; index < confirmed.length; index += 100) {
    savedTransactions += await saveStoredSmsTransactions(
      confirmed.slice(index, index + 100),
    );
  }

  for (const id of acknowledgements) {
    await acknowledgeQueuedSms(id);
  }

  return {
    processedMessages: pending.length,
    savedTransactions,
    excludedMessages,
  };
}

export function processPendingSmsQueue(): Promise<SmsQueueProcessingResult> {
  if (activeProcessing) {
    return activeProcessing;
  }
  activeProcessing = processQueue().finally(() => {
    activeProcessing = null;
  });
  return activeProcessing;
}
