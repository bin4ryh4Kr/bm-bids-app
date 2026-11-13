import { expect, it } from 'vitest';
import { atPrice } from './calc';

// Made-up job: 4 labor hours, $100 labor, $130 direct cost, 12% overhead.
const base = { hours: 4, labor: 100, direct: 130 };

it('works out earnings at a chosen price', () => {
  const s = atPrice(base, 12, 200);
  expect(s.perHour).toBe(50);
  expect(s.laborPct).toBe(50);
  expect(s.profit).toBeCloseTo(200 - 130 - 24, 6);
  expect(atPrice(base, 12, 200, 4).profitMonth).toBeCloseTo(s.profit * 4, 6);
});

it('a higher price earns more per hour, with less of it going to labor', () => {
  const lo = atPrice(base, 12, 160), hi = atPrice(base, 12, 240);
  expect(hi.perHour).toBeGreaterThan(lo.perHour);
  expect(hi.laborPct).toBeLessThan(lo.laborPct);
  expect(hi.profit).toBeGreaterThan(lo.profit);
});
