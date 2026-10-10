import {answerSpendingQuestion} from '../../src/domain/offlineChat';

describe('answerSpendingQuestion', () => {
  it('prompts for a question when the input is empty', () => {
    expect(answerSpendingQuestion('   ', 0)).toContain('Ask about your spending');
  });

  it('does not invent financial answers without local transactions', () => {
    expect(answerSpendingQuestion('How much did I spend on food?', 0)).toContain(
      'There are no confirmed imported transactions',
    );
  });

  it('states the limitation when local history exists but query parsing is unavailable', () => {
    expect(answerSpendingQuestion('What about food?', 10)).toContain(
      'This query is not supported yet.',
    );
  });

  it('answers spending and category questions from a supplied local summary', () => {
    const summary = {
      periodLabel: 'September 2026',
      debitTotalPaise: 49900,
      creditTotalPaise: 10000,
      netSpendPaise: 39900,
      debitCount: 2,
      creditCount: 1,
      debitCategories: [{name: 'Food', amountPaise: 49900, count: 2}],
    };

    expect(answerSpendingQuestion('How much did I spend?', 3, summary)).toContain(
      '₹399.00',
    );
    expect(
      answerSpendingQuestion('What is my top category?', 3, summary),
    ).toContain('Food');
  });
});
