import {normalizeMerchant} from '../../src/domain/merchantNormalization';

describe('normalizeMerchant', () => {
  it.each([
    ['SWIGGY*ORDER123', 'Swiggy', 'Food'],
    ['Swiggy Payments', 'Swiggy', 'Food'],
    ['ZOMATO ORDER 1', 'Zomato', 'Food'],
    ['BIGBASKET.COM', 'BigBasket', 'Groceries'],
    ['UBER INDIA', 'Uber', 'Transport'],
    ['NETFLIX.COM', 'Netflix', 'Entertainment'],
  ])('normalizes %s', (raw, name, category) => {
    expect(normalizeMerchant(raw)).toEqual({
      name,
      suggestedCategory: category,
    });
  });

  it('prefers user rules over built-in rules', () => {
    expect(
      normalizeMerchant('SWIGGY*ORDER123', [
        {
          pattern: /\bswiggy\b/i,
          normalizedName: 'My Meal Service',
          category: 'Others',
        },
      ]),
    ).toEqual({
      name: 'My Meal Service',
      suggestedCategory: 'Others',
    });
  });

  it('returns a safe fallback for missing merchant names', () => {
    expect(normalizeMerchant('   ')).toEqual({
      name: 'Unknown merchant',
      suggestedCategory: 'Other',
    });
  });

  it('cleans common payment suffixes from unrecognized merchants', () => {
    expect(normalizeMerchant('LOCAL CAFE PAYMENTS')).toEqual({
      name: 'Local Cafe',
      suggestedCategory: 'Other',
    });
  });

  it('preserves the final word in a multi-word merchant name', () => {
    expect(normalizeMerchant('SYED SALMAN')).toEqual({
      name: 'Syed Salman',
      suggestedCategory: 'Other',
    });
  });

  it('removes delimited bank reference suffixes without truncating merchant names', () => {
    expect(normalizeMerchant('LOCAL CAFE/REF12345')).toEqual({
      name: 'Local Cafe',
      suggestedCategory: 'Other',
    });
  });
});
