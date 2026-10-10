import {
  classifySms,
  shouldIgnoreSms,
  type SmsClassification,
} from '../../src/domain/smsClassification';

describe('classifySms', () => {
  const examples: Array<[string, SmsClassification]> = [
    ['Your OTP is 392814. Do not share it.', 'otp'],
    ['INR 499 spent at SWIGGY on your card ending 1234.', 'expense'],
    ['INR 500 refunded to your account by SHOP.', 'refund'],
    ['Salary credited to your account: INR 65,000.', 'income'],
    [
      'Payment of INR 2,500 has been received towards your Example Bank Credit Card XX0000.',
      'transfer',
    ],
    ['INR 10,000 transferred to your own account.', 'transfer'],
    ['Your card transaction was declined.', 'failed'],
    ['The transaction was reversed to your account.', 'reversed'],
    ['Special offer! Shop now to get a discount.', 'promotional'],
    ['Available balance in account ending 1234 is INR 4,000.', 'balance'],
  ];

  it.each(examples)(
    'classifies synthetic message as %s',
    (message, expected: SmsClassification) => {
      expect(classifySms(message).classification).toBe(expected);
    },
  );

  it('classifies explicit account credits and leaves unsupported messages unknown', () => {
    expect(
      classifySms('INR 1,000 credited to your account').classification,
    ).toBe('income');
    expect(classifySms('Your account ending 1234 was updated').classification).toBe(
      'unknown',
    );
  });

  it('ignores OTP, promotional, and balance-only messages', () => {
    for (const message of [
      'Your OTP is 123456.',
      'Special offer: get a discount today.',
      'Available balance: INR 1,000.',
    ]) {
      expect(shouldIgnoreSms(classifySms(message))).toBe(true);
    }
  });

  it('does not silently choose between similarly strong conflicting intents', () => {
    const result = classifySms(
      'Payment failed; INR 500 refunded to your account.',
    );

    expect(result.classification).toBe('unknown');
    expect(result.requiresReview).toBe(true);
  });

  it('classifies a transaction even when its alert also includes an available balance', () => {
    expect(
      classifySms(
        'INR 499 spent at SWIGGY. Available balance INR 4,000.',
      ).classification,
    ).toBe('expense');
  });

  it('treats sent amounts and digital gold receipts as debits', () => {
    expect(classifySms('INR 500 sent to STORE').classification).toBe(
      'expense',
    );
    expect(
      classifySms('Digital gold received for INR 500').classification,
    ).toBe('expense');
  });

  it('classifies general received and debited transaction wording', () => {
    expect(classifySms('INR 1,000 received in your account').classification).toBe(
      'income',
    );
    expect(classifySms('Debit of INR 1,000 at STORE').classification).toBe(
      'expense',
    );
  });

  it('recognizes credit-card payment receipts as repayments, not spending', () => {
    expect(
      classifySms(
        'Payment of INR 2,500 has been received towards your Example Bank Credit Card XX0000.',
      ),
    ).toMatchObject({
      classification: 'transfer',
      requiresReview: false,
    });
  });
});
