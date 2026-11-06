import { expect, it } from 'vitest';
import { milesBetween, parseReceipt } from './expenses';

it('reads a store receipt', () => {
  const r = parseReceipt(`HARBOR HARDWARE\n418 Main St\n10/03/2026 07:42 AM\nMOP HEADS 2 18.40\nSUBTOTAL 238.11\nTAX 7.00% 16.67\nTOTAL $254.78\nCARD 254.78\nTHANK YOU`);
  expect(r).toEqual({ merchant: 'HARBOR HARDWARE', date: '2026-10-03', total: 254.78 });
});
it('handles short years, word dates and no total line', () => {
  expect(parseReceipt('Gas Stop\n11-05-26\nPUMP 3 41.10').date).toBe('2026-11-05');
  expect(parseReceipt('Gas Stop\n11-05-26\nPUMP 3 41.10').total).toBe(41.1);
  expect(parseReceipt('Office Place\nNov 5, 2026\nAmount Due 1,204.55').date).toBe('2026-11-05');
  expect(parseReceipt('Office Place\nNov 5, 2026\nAmount Due 1,204.55').total).toBe(1204.55);
});
it('never guesses from an empty scan', () => {
  expect(parseReceipt('')).toEqual({ merchant: '', date: '', total: 0 });
});
it('measures distance', () => {
  expect(milesBetween({ lat: 34.2257, lng: -77.9447 }, { lat: 34.4522, lng: -77.9847 })).toBeGreaterThan(15);
  expect(milesBetween({ lat: 34.2257, lng: -77.9447 }, { lat: 34.4522, lng: -77.9847 })).toBeLessThan(17);
});
