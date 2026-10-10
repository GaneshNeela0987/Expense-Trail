import {getSenderDisplayName} from '../../src/domain/senderDisplayName';

describe('getSenderDisplayName', () => {
  it.each([
    ['AX-KOTAKB-S', 'Kotak Mahindra Bank'],
    ['AX-AXISBK-S', 'Axis Bank'],
    ['VM-HDFCBK-S', 'HDFC Bank'],
    ['CUSTOMBANK', 'Bank · CUSTOMBANK'],
    ['', 'Bank'],
  ])('maps %s to a readable source', (sender, expected) => {
    expect(getSenderDisplayName(sender)).toBe(expected);
  });
});
