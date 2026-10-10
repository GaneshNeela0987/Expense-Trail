import type {Paise} from './money';

export interface DeduplicationCandidate {
  amountPaise: Paise;
  accountLast4: string | null;
  bankId: string;
  normalizedMerchant: string | null;
  occurredAt: number;
  paymentMode: string | null;
  referenceNumber: string | null;
  smsHash: string | null;
}

export const DEFAULT_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

function normalizedOptionalValue(value: string | null): string | null {
  const normalized = value?.trim().toLocaleLowerCase('en-IN');
  return normalized ? normalized : null;
}

export function isDuplicateTransaction(
  candidate: DeduplicationCandidate,
  existing: DeduplicationCandidate,
  windowMs = DEFAULT_DUPLICATE_WINDOW_MS,
): boolean {
  if (!Number.isSafeInteger(windowMs) || windowMs < 0) {
    throw new RangeError('Duplicate time window must be a non-negative integer.');
  }

  if (
    !Number.isSafeInteger(candidate.amountPaise) ||
    candidate.amountPaise < 0 ||
    !Number.isSafeInteger(existing.amountPaise) ||
    existing.amountPaise < 0
  ) {
    throw new RangeError('Transaction amounts must be non-negative safe integers.');
  }

  if (
    !Number.isFinite(candidate.occurredAt) ||
    !Number.isFinite(existing.occurredAt)
  ) {
    throw new RangeError('Transaction timestamps must be finite.');
  }

  const candidateHash = normalizedOptionalValue(candidate.smsHash);
  const existingHash = normalizedOptionalValue(existing.smsHash);

  if (candidateHash && candidateHash === existingHash) {
    return true;
  }

  if (
    candidate.amountPaise !== existing.amountPaise ||
    Math.abs(candidate.occurredAt - existing.occurredAt) > windowMs
  ) {
    return false;
  }

  const candidateBank = normalizedOptionalValue(candidate.bankId);
  const existingBank = normalizedOptionalValue(existing.bankId);

  if (
    !candidateBank ||
    !existingBank ||
    candidateBank !== existingBank
  ) {
    return false;
  }

  const candidateAccount = normalizedOptionalValue(candidate.accountLast4);
  const existingAccount = normalizedOptionalValue(existing.accountLast4);

  if (
    candidateAccount &&
    existingAccount &&
    candidateAccount !== existingAccount
  ) {
    return false;
  }

  const candidateReference = normalizedOptionalValue(candidate.referenceNumber);
  const existingReference = normalizedOptionalValue(existing.referenceNumber);

  if (candidateReference && existingReference) {
    return candidateReference === existingReference;
  }

  const candidateMerchant = normalizedOptionalValue(
    candidate.normalizedMerchant,
  );
  const existingMerchant = normalizedOptionalValue(existing.normalizedMerchant);

  if (
    !candidateMerchant ||
    !existingMerchant ||
    candidateMerchant !== existingMerchant
  ) {
    return false;
  }

  const candidateMode = normalizedOptionalValue(candidate.paymentMode);
  const existingMode = normalizedOptionalValue(existing.paymentMode);

  return !candidateMode || !existingMode || candidateMode === existingMode;
}
