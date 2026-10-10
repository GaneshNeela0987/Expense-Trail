import {parseSmsCandidate} from '../../src/domain/smsParser';

describe('parseSmsCandidate', () => {
  it('extracts a debit amount without mistaking the balance for a second amount', () => {
    expect(
      parseSmsCandidate(
        'INR 499 spent at SWIGGY on 09-Oct-2026. Available balance INR 4,000.',
      ),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: 49900,
      merchant: 'Swiggy',
      category: 'Food',
      confirmed: true,
      requiresReview: false,
    });
  });

  it('returns an amount only when one INR amount is present', () => {
    expect(
      parseSmsCandidate('INR 499 spent at SWIGGY.'),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: 49900,
      merchant: 'Swiggy',
      category: 'Food',
      confirmed: true,
      requiresReview: false,
    });
  });

  it('does not auto-confirm when multiple transaction amounts are present', () => {
    expect(
      parseSmsCandidate('INR 499 spent at SHOP for INR 599.'),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: null,
      confirmed: false,
      requiresReview: true,
    });
  });

  it('classifies a clear refund as a confirmed credit', () => {
    expect(
      parseSmsCandidate('Refund of INR 200 credited by BANK.'),
    ).toMatchObject({
      classification: 'refund',
      amountPaise: 20000,
      confirmed: true,
      requiresReview: false,
    });
  });

  it.each([
    [
      'A/c XX1234 debited by Rs. 250.00 on 09-10-2026. Info: UPI/CAFE COFFEE/12345. Avl Bal: Rs. 5,000.00',
      'expense',
      25000,
      'Food',
    ],
    [
      'INR 1,250.50 paid to AMAZON using UPI',
      'expense',
      125050,
      'Shopping',
    ],
    [
      'INR 699 spent at Uber on your card. Available balance INR 4,000.',
      'expense',
      69900,
      'Transport',
    ],
    [
      'INR 2,000 credited to your account by salary',
      'income',
      200000,
      'Salary',
    ],
  ] as const)(
    'parses common bank/UPI format and infers a category: %s',
    (message, classification, amountPaise, category) => {
      expect(parseSmsCandidate(message)).toMatchObject({
        classification,
        amountPaise,
        category,
        confirmed: true,
      });
    },
  );

  it('does not mistake account balances for the transaction amount', () => {
    expect(
      parseSmsCandidate(
        'Your account was debited. Available balance is INR 4,000.',
      ),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: null,
      confirmed: false,
    });
  });

  it('handles income messages using credited-with wording', () => {
    expect(
      parseSmsCandidate('Your account is credited with INR 5,000.00.'),
    ).toMatchObject({
      classification: 'income',
      amountPaise: 500000,
      category: 'Income',
      confirmed: true,
    });
  });

  it('categorizes salary credits as confirmed income in the Salary category', () => {
    expect(
      parseSmsCandidate(
        'INR 42,000.00 credited to A/c no. XX0000 on 31-08-26. Info - BRN-SALARY PAYMENT-Aug-2026. Example Bank',
      ),
    ).toMatchObject({
      classification: 'income',
      amountPaise: 4200000,
      category: 'Salary',
      confirmed: true,
      requiresReview: false,
    });
  });

  it('does not classify a credit-card bill repayment as income or spending', () => {
    expect(
      parseSmsCandidate(
        'Payment of INR 2,500 has been received towards your Example Bank Credit Card XX0000 on 14-05-25.',
      ),
    ).toMatchObject({
      classification: 'transfer',
      amountPaise: 250000,
      confirmed: false,
      requiresReview: true,
    });
  });

  it('parses debited UPI alerts with an unpunctuated balance field', () => {
    expect(
      parseSmsCandidate(
        'Debited Rs 20.00 from a/c X0000 on 01Jan26 21:26 via UPI to MERCHANT NAME. Ref 123456789012. Bal Rs 656.61. Not you? Call 18000000000 -Federal Bank',
      ),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: 2000,
      merchant: 'Merchant Name',
      category: 'Other',
      confirmed: true,
      requiresReview: false,
    });
  });

  it('categorizes received digital gold as a debit', () => {
    expect(
      parseSmsCandidate('Digital gold received for INR 500.00'),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: 50000,
      category: 'Digital Gold',
      confirmed: true,
    });
  });

  it('parses digital-gold provider receipts as a Digital Gold debit', () => {
    expect(
      parseSmsCandidate(
        'Digital Gold India Private Limited has received Rs 10.00 from your A/c 0000 via NEFT on 01-Oct-2026. Ref no. TEST123456 - Example Bank',
      ),
    ).toMatchObject({
      classification: 'expense',
      amountPaise: 1000,
      merchant: 'Digital Gold',
      category: 'Digital Gold',
      confirmed: true,
      requiresReview: false,
    });
  });

  it.each([
    'Your OTP is 123456. Do not share it.',
    'Special offer! Shop now to get a discount.',
    'Available balance: INR 1,000.',
  ])('ignores non-transaction message: %s', message => {
    expect(parseSmsCandidate(message)).toBeNull();
  });

  it('keeps unknown sender-approved content as a review candidate', () => {
    expect(
      parseSmsCandidate('Please review your account activity.'),
    ).toMatchObject({
      classification: 'unknown',
      amountPaise: null,
      merchant: null,
      requiresReview: true,
    });
  });
});
