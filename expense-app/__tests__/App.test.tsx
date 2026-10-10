/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Alert, PermissionsAndroid} from 'react-native';
import App from '../App';
import {formatMonthLabel} from '../src/domain/monthOptions';
import {
  countMatchingInboxSms,
  markInitialHistoryImportComplete,
  replaceImportedSmsData,
} from '../src/native/sms';

const mockPreviousMonthTimestamp = new Date(
  new Date().getFullYear(),
  new Date().getMonth() - 1,
  15,
).getTime();
const mockTransactions: Array<{
  id: string;
  sender: string;
  timestamp: number;
  classification: string;
  confidence: number;
  amountPaise: number;
  merchant: string | null;
  category: string;
  confirmed: boolean;
}> = [];
let mockInitialHistoryImportComplete = true;

jest.mock('../src/native/sms', () => ({
  countMatchingInboxSms: jest.fn().mockResolvedValue(2),
  getStoredSmsTransactions: jest.fn(() =>
    Promise.resolve([...mockTransactions]),
  ),
  getPendingSmsCount: jest.fn().mockResolvedValue(0),
  getPendingSms: jest.fn().mockResolvedValue([]),
  acknowledgeQueuedSms: jest.fn().mockResolvedValue(true),
  getRecognizedSenders: jest.fn().mockResolvedValue(['KOTAK_TEST']),
  hasCompletedInitialHistoryImport: jest.fn(() =>
    Promise.resolve(mockInitialHistoryImportComplete),
  ),
  isSmsNativeModuleAvailable: jest.fn(() => true),
  importRecognizedSmsHistory: jest.fn().mockResolvedValue({
    messages: [
      {
        id: '1',
        sender: 'KOTAK_TEST',
        body: 'INR 499 spent at SWIGGY.',
        timestamp: mockPreviousMonthTimestamp,
      },
      {
        id: '2',
        sender: 'KOTAK_TEST',
        body: 'Transaction update INR 123.45 requires more context.',
        timestamp: mockPreviousMonthTimestamp,
      },
    ],
    nextOffset: 1,
    hasMore: false,
  }),
  saveStoredSmsTransactions: jest.fn(
    (transactions: (typeof mockTransactions)[number][]) => {
      const knownIds = new Set(mockTransactions.map(record => record.id));
      const newRecords = transactions.filter(record => !knownIds.has(record.id));
      mockTransactions.push(...newRecords);
      return Promise.resolve(newRecords.length);
    },
  ),
  replaceImportedSmsData: jest.fn(
    (transactions: (typeof mockTransactions)[number][]) => {
      const uniqueRecords = [
        ...new Map(transactions.map(record => [record.id, record])).values(),
      ];
      mockTransactions.splice(0, mockTransactions.length, ...uniqueRecords);
      return Promise.resolve({
        savedTransactions: uniqueRecords.length,
        clearedPendingMessages: 2,
      });
    },
  ),
  markInitialHistoryImportComplete: jest.fn(() => {
    mockInitialHistoryImportComplete = true;
    return Promise.resolve(true);
  }),
  setRecognizedSenders: jest.fn((senders: string[]) =>
    Promise.resolve(senders),
  ),
  subscribeToNewSms: jest.fn(() => ({remove: jest.fn()})),
}));

jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native');
  return {
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

afterEach(() => {
  mockInitialHistoryImportComplete = true;
});

test('renders dashboard, profile settings, analytics, and chat', async () => {
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

  let app: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    app = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  if (!app) {
    throw new Error('App did not render.');
  }

  const renderedApp = JSON.stringify(app.toJSON());
  expect(renderedApp).toContain('Your finances, at a glance');
  expect(renderedApp).toContain('Debits');
  expect(
    app.root.findByProps({accessibilityLabel: 'Debits transactions'}).props
      .accessibilityState.selected,
  ).toBe(true);
  expect(renderedApp).toContain('USER');
  expect(renderedApp).not.toContain('Allow bank SMS access');

  const profileButton = app.root.findByProps({
    accessibilityLabel: 'Open USER profile',
  });
  await ReactTestRenderer.act(async () => {
    profileButton.props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('SMS capture setup');
  expect(JSON.stringify(app.toJSON())).toContain('Permissions');
  expect(JSON.stringify(app.toJSON())).toContain('USER');
  expect(JSON.stringify(app.toJSON())).toContain('Allowed sender IDs');
  expect(JSON.stringify(app.toJSON())).toContain('KOTAK_TEST');
  expect(JSON.stringify(app.toJSON())).not.toContain('No sender IDs added');

  const senderInput = app.root.findByProps({
    accessibilityLabel: 'New bank SMS sender ID',
  });
  await ReactTestRenderer.act(async () => {
    senderInput.props.onChangeText('AX-KOTAKB-S');
  });
  await ReactTestRenderer.act(async () => {
    await app?.root
      .findByProps({accessibilityLabel: 'Add sender ID'})
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('AX-KOTAKB-S');

  await ReactTestRenderer.act(async () => {
    await app?.root
      .findByProps({accessibilityLabel: 'Remove sender ID AX-KOTAKB-S'})
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).not.toContain('AX-KOTAKB-S');

  const backButton = app.root.findByProps({
    accessibilityLabel: 'Back to dashboard',
  });
  await ReactTestRenderer.act(async () => {
    backButton.props.onPress();
  });
  const tabs = ['Home', 'Analytics', 'Chat'].map(label =>
    app!.root.findAllByProps({accessibilityLabel: label}).find(node => {
      const accessibilityRole = node.props.accessibilityRole;
      return accessibilityRole === 'tab';
    }),
  );
  expect(tabs.every(Boolean)).toBe(true);

  await ReactTestRenderer.act(async () => {
    app?.root.findByProps({accessibilityLabel: 'Analytics'}).props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('SPENDING OVERVIEW');

  const updatedTabs = app.root.findByProps({accessibilityLabel: 'Chat'});
  await ReactTestRenderer.act(async () => {
    updatedTabs.props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('ON-DEVICE ASSISTANT');

  await ReactTestRenderer.act(async () => {
    app?.root.findByProps({accessibilityLabel: 'Home'}).props.onPress();
  });
  expect(
    app.root.findByProps({accessibilityLabel: 'Home'}).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(
    app.root.findByProps({accessibilityLabel: 'Chat'}).props.accessibilityState
      .selected,
  ).toBe(false);
  const homeProfileButton = app.root.findByProps({
    accessibilityLabel: 'Open USER profile',
  });
  await ReactTestRenderer.act(async () => {
    homeProfileButton.props.onPress();
  });
  const countHistoryButton = app.root.findByProps({
    accessibilityLabel: 'Count matching historical SMS',
  });
  await ReactTestRenderer.act(async () => {
    await countHistoryButton.props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain(
    'Found 2 inbox messages from allowed sender IDs. Message contents were not read.',
  );

  await ReactTestRenderer.act(async () => {
    await app?.root
      .findByProps({accessibilityLabel: 'Import matching historical SMS'})
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain(
    'Import complete. Scanned 2 allowed-sender messages: 1 transaction saved, 0 duplicates ignored, 1 unclear message excluded, and 0 non-transaction messages skipped. Raw SMS text was not retained.',
  );
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({accessibilityLabel: 'Review unclear SMS samples'})
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain(
    'Transaction update INR 123.45 requires more context.',
  );
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({accessibilityLabel: 'Done and clear SMS samples'})
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).not.toContain(
    'Transaction update INR 123.45 requires more context.',
  );
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({
        accessibilityLabel: 'Rebuild imported transactions and re-import SMS',
      })
      .props.onPress();
  });
  expect(
    JSON.stringify(alertSpy.mock.calls[0]?.slice(0, 2)),
  ).toContain('Your Android SMS inbox');
  expect(
    JSON.stringify(app.toJSON()),
  ).toContain('Rebuild & re-import transactions');
  expect(replaceImportedSmsData).not.toHaveBeenCalled();
  const confirmRebuild = alertSpy.mock.calls[0]?.[2]?.find(
    action => action.text === 'Rebuild and re-import',
  );
  expect(confirmRebuild).toBeDefined();
  await ReactTestRenderer.act(async () => {
    await confirmRebuild?.onPress?.();
  });
  expect(JSON.stringify(app.toJSON())).toContain(
    'Rebuild complete. Scanned 2 allowed-sender messages: 1 transaction saved, 0 duplicates ignored, 1 unclear message excluded, and 0 non-transaction messages skipped. The encrypted pending queue was cleared; the inbox and sender settings were preserved. Raw SMS text was not retained.',
  );
  expect(replaceImportedSmsData).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
  const returnToHome = app.root.findByProps({
    accessibilityLabel: 'Back to dashboard',
  });
  await ReactTestRenderer.act(async () => {
    returnToHome.props.onPress();
  });
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const previousMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 1,
    1,
  );
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({
        accessibilityLabel: `Select transaction month, ${formatMonthLabel(currentMonth)}`,
      })
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('Choose a month');
  const monthOptionLabels = app.root
    .findAll(node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Month option '),
    )
    .map(node => node.props.accessibilityLabel as string);
  expect(monthOptionLabels).toContain(
    `Month option ${formatMonthLabel(previousMonth)}`,
  );
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({
        accessibilityLabel: `Month option ${formatMonthLabel(previousMonth)}`,
      })
      .props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain(formatMonthLabel(previousMonth));
  expect(
    app.root.findByProps({
      accessibilityLabel: `Select transaction month, ${formatMonthLabel(previousMonth)}`,
    }),
  ).toBeDefined();
  await ReactTestRenderer.act(async () => {
    app?.root.findByProps({accessibilityLabel: 'Credits transactions'}).props.onPress();
  });
  expect(
    app.root.findByProps({accessibilityLabel: 'Credits transactions'}).props
      .accessibilityState.selected,
  ).toBe(true);
  await ReactTestRenderer.act(async () => {
    app?.root.findByProps({accessibilityLabel: 'Analytics'}).props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('Daily debits');
  expect(JSON.stringify(app.toJSON())).toContain('Debit categories');
  expect(
    app.root.findByProps({accessibilityLabel: 'Analytics period Month'}).props
      .accessibilityState.selected,
  ).toBe(true);
  expect(JSON.stringify(app.toJSON())).toContain(
    formatMonthLabel(previousMonth),
  );
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({accessibilityLabel: 'Analytics period Week'})
      .props.onPress();
  });
  expect(
    app.root.findByProps({accessibilityLabel: 'Analytics period Week'}).props
      .accessibilityState.selected,
  ).toBe(true);
  expect(
    app.root.findByProps({accessibilityLabel: 'Analytics period Month'}).props
      .accessibilityState.selected,
  ).toBe(false);
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({accessibilityLabel: 'Analytics period Day'})
      .props.onPress();
  });
  expect(
    app.root.findByProps({accessibilityLabel: 'Analytics period Day'}).props
      .accessibilityState.selected,
  ).toBe(true);
  await ReactTestRenderer.act(async () => {
    app?.root
      .findByProps({accessibilityLabel: 'Previous analytics period'})
      .props.onPress();
  });
  const previousDayLabel = new Date(
    previousMonth.getFullYear(),
    previousMonth.getMonth() + 1,
    0,
  );
  previousDayLabel.setDate(previousDayLabel.getDate() - 1);
  expect(JSON.stringify(app.toJSON())).toContain(
    previousDayLabel.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  expect(
    app.root.findByProps({accessibilityLabel: 'Next analytics period'}).props
      .accessibilityState.disabled,
  ).toBe(false);
  await ReactTestRenderer.act(async () => {
    app?.unmount();
  });
});

test('automatically imports configured inbox history once on startup', async () => {
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  mockInitialHistoryImportComplete = false;
  mockTransactions.splice(0, mockTransactions.length);
  jest.mocked(countMatchingInboxSms).mockClear();
  jest.mocked(markInitialHistoryImportComplete).mockClear();

  let startupApp: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    startupApp = ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(resolve, 50));
  });

  if (!startupApp) {
    throw new Error('App did not render.');
  }

  expect(countMatchingInboxSms).toHaveBeenCalledTimes(1);
  expect(markInitialHistoryImportComplete).toHaveBeenCalledTimes(1);
  expect(mockInitialHistoryImportComplete).toBe(true);
  expect(mockTransactions).toHaveLength(1);
  await ReactTestRenderer.act(async () => {
    startupApp?.unmount();
  });
});
