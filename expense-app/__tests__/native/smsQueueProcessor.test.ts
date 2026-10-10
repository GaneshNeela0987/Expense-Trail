import {
  acknowledgeQueuedSms,
  getPendingSms,
  saveStoredSmsTransactions,
} from '../../src/native/sms';
import {processPendingSmsQueue} from '../../src/native/smsQueueProcessor';

jest.mock('../../src/native/sms', () => ({
  acknowledgeQueuedSms: jest.fn().mockResolvedValue(true),
  getPendingSms: jest.fn(),
  saveStoredSmsTransactions: jest.fn().mockResolvedValue(0),
}));

const mockGetPendingSms = jest.mocked(getPendingSms);
const mockAcknowledgeQueuedSms = jest.mocked(acknowledgeQueuedSms);
const mockSaveStoredSmsTransactions = jest.mocked(saveStoredSmsTransactions);

describe('processPendingSmsQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveStoredSmsTransactions.mockResolvedValue(0);
    mockAcknowledgeQueuedSms.mockResolvedValue(true);
  });

  it('stores only clearly classified transactions then acknowledges all queued bodies', async () => {
    mockGetPendingSms.mockResolvedValue([
      {
        id: 'inbox:fingerprint-1',
        sender: 'BANK_TEST',
        timestamp: 100,
        body: 'INR 500 spent at STORE.',
      },
      {
        id: 'inbox:fingerprint-2',
        sender: 'BANK_TEST',
        timestamp: 200,
        body: 'Account activity needs attention.',
      },
    ]);
    mockSaveStoredSmsTransactions.mockResolvedValue(1);

    await expect(processPendingSmsQueue()).resolves.toEqual({
      processedMessages: 2,
      savedTransactions: 1,
      excludedMessages: 1,
    });
    expect(mockSaveStoredSmsTransactions).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'inbox:fingerprint-1',
        classification: 'expense',
        amountPaise: 50000,
        confirmed: true,
      }),
    ]);
    expect(mockAcknowledgeQueuedSms).toHaveBeenNthCalledWith(
      1,
      'inbox:fingerprint-1',
    );
    expect(mockAcknowledgeQueuedSms).toHaveBeenNthCalledWith(
      2,
      'inbox:fingerprint-2',
    );
  });

  it('leaves queued messages unacknowledged when transaction storage fails', async () => {
    mockGetPendingSms.mockResolvedValue([
      {
        id: 'inbox:fingerprint-1',
        sender: 'BANK_TEST',
        timestamp: 100,
        body: 'INR 500 spent at STORE.',
      },
    ]);
    mockSaveStoredSmsTransactions.mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(processPendingSmsQueue()).rejects.toThrow(
      'storage unavailable',
    );
    expect(mockAcknowledgeQueuedSms).not.toHaveBeenCalled();
  });
});
