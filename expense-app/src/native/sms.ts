import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

export interface ImportedSms {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
}

export interface StoredSmsTransaction {
  id: string;
  sender: string;
  timestamp: number;
  classification: string;
  confidence: number;
  amountPaise: number | null;
  merchant: string | null;
  category: string;
  confirmed: boolean;
}

export interface QueuedSms extends ImportedSms {
  id: string;
}

export interface HistoryImportPage {
  messages: ImportedSms[];
  nextOffset: number;
  hasMore: boolean;
}

export interface ImportedDataReplacement {
  savedTransactions: number;
  clearedPendingMessages: number;
}

interface ExpenseSmsNativeModule {
  getRecognizedSenders(): Promise<string[]>;
  setRecognizedSenders(senders: string[]): Promise<string[]>;
  hasCompletedInitialHistoryImport(): Promise<boolean>;
  markInitialHistoryImportComplete(): Promise<boolean>;
  countMatchingInboxSms(): Promise<number>;
  getTransactions(): Promise<StoredSmsTransaction[]>;
  saveTransactions(transactions: StoredSmsTransaction[]): Promise<number>;
  replaceImportedData(
    transactions: StoredSmsTransaction[],
  ): Promise<ImportedDataReplacement>;
  getPendingCount(): Promise<number>;
  getPendingSms(): Promise<QueuedSms[]>;
  acknowledgeQueuedSms(id: string): Promise<boolean>;
  importHistory(
    sinceTimestamp: number,
    offset: number,
    limit: number,
  ): Promise<HistoryImportPage>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface QueuedSmsNotification {
  id: string;
}

const EVENT_NEW_SMS = 'ExpenseSmsNewMessage';
const nativeModule = NativeModules.ExpenseSms as
  | ExpenseSmsNativeModule
  | undefined;

function requireNativeModule(): ExpenseSmsNativeModule {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('The Android SMS module is unavailable on this platform.');
  }
  return nativeModule;
}

export function isSmsNativeModuleAvailable(): boolean {
  return Platform.OS === 'android' && nativeModule !== undefined;
}

export function getRecognizedSenders(): Promise<string[]> {
  return requireNativeModule().getRecognizedSenders();
}

export function setRecognizedSenders(
  senders: string[],
): Promise<string[]> {
  return requireNativeModule().setRecognizedSenders(senders);
}

export function hasCompletedInitialHistoryImport(): Promise<boolean> {
  return requireNativeModule().hasCompletedInitialHistoryImport();
}

export function markInitialHistoryImportComplete(): Promise<boolean> {
  return requireNativeModule().markInitialHistoryImportComplete();
}

export function countMatchingInboxSms(): Promise<number> {
  return requireNativeModule().countMatchingInboxSms();
}

export function getStoredSmsTransactions(): Promise<StoredSmsTransaction[]> {
  return requireNativeModule().getTransactions();
}

export function saveStoredSmsTransactions(
  transactions: StoredSmsTransaction[],
): Promise<number> {
  return requireNativeModule().saveTransactions(transactions);
}

export function replaceImportedSmsData(
  transactions: StoredSmsTransaction[],
): Promise<ImportedDataReplacement> {
  return requireNativeModule().replaceImportedData(transactions);
}

export function getPendingSmsCount(): Promise<number> {
  return requireNativeModule().getPendingCount();
}

export function getPendingSms(): Promise<QueuedSms[]> {
  return requireNativeModule().getPendingSms();
}

export function acknowledgeQueuedSms(id: string): Promise<boolean> {
  return requireNativeModule().acknowledgeQueuedSms(id);
}

export function importRecognizedSmsHistory(
  sinceTimestamp: number,
  offset = 0,
  limit = 200,
): Promise<HistoryImportPage> {
  return requireNativeModule().importHistory(sinceTimestamp, offset, limit);
}

export function subscribeToNewSms(
  listener: (notification: QueuedSmsNotification) => void,
): {remove: () => void} {
  const module = requireNativeModule();
  const emitter = new NativeEventEmitter(module as never);
  return emitter.addListener(EVENT_NEW_SMS, event => {
    if (
      typeof event === 'object' &&
      event !== null &&
      'id' in event &&
      typeof event.id === 'string'
    ) {
      listener({id: event.id});
    }
  });
}
