// Starting numbers for a new install, from published industry ranges (midpoints, rounded).
// They're a place to begin, not anyone's real costs, so the app says so and every one can be changed.
import { DEFAULT_COSTS, type Costs } from './calc';
import { DEFAULT_RATES, type Rates } from './rates';

export const INDUSTRY_COSTS = (): Costs => ({
  ...DEFAULT_COSTS, wage: 17.71, burden: 15, mileRate: 0.76, supplies: 5, overhead: 15, profit: 15,
  restroomMin: 15, kitchenMin: 10, minimum: 75, round: 5, speedStd: 500, speedDeep: 250, speedMove: 200, minHours: 2,
  trashMin: 1, glassMin: 1, stairsMin: 3, elevatorMin: 3, doorMin: 2, floorCarpet: 3000, floorTile: 2500, floorWood: 2500, floorConcrete: 3500,
});
export const INDUSTRY_RATES = (): Rates => ({
  ...DEFAULT_RATES(),
  tiers: [[1000, 140, 225, 250], [1500, 175, 280, 335], [2000, 205, 330, 415], [2500, 235, 375, 495], [3000, 265, 425, 575]],
  bathFull: { standard: 30, deep: 50, move: 50 }, bathHalf: { standard: 15, deep: 25, move: 25 },
  hourly: 50, hourlyMin: 2, depositPct: 25, off: { weekly: 20, biweekly: 15, monthly: 10 }, rush: 20, sunday: 25, carpetMin: 80,
  addOns: { oven: 40, fridge: 40, cabinets: 40, baseboards: 30, walls: 35, pet: 30, garage: 50, porch: 40, windows: 6, blinds: 6, laundry: 30, carpet: 40, stairs: 40 },
});
export const INDUSTRY_MILE_RATE = 0.76;
export const INDUSTRY_PAY = 17.71;

// Keeps every number already entered and only fills what's still blank.
const fill = <T,>(mine: T, base: T): T => {
  if (Array.isArray(mine)) return mine.map((x, i) => fill(x, (base as unknown[])[i])) as T;
  if (mine && typeof mine === 'object') return Object.fromEntries(Object.keys(base as object).map(k => [k, fill((mine as Record<string, unknown>)[k], (base as Record<string, unknown>)[k])])) as T;
  return (mine ? mine : base) as T;
};
export const fillBlanks = <D extends { costs: Costs; rates: Rates; mileRate: number; marketPay: number }>(d: D): D => ({
  ...d, costs: fill(d.costs, INDUSTRY_COSTS()), rates: fill(d.rates, INDUSTRY_RATES()), mileRate: d.mileRate || INDUSTRY_MILE_RATE, marketPay: d.marketPay || INDUSTRY_PAY,
});
export const allIndustry = <D extends { costs: Costs; rates: Rates; mileRate: number; marketPay: number }>(d: D): D => ({
  ...d, costs: INDUSTRY_COSTS(), rates: INDUSTRY_RATES(), mileRate: INDUSTRY_MILE_RATE, marketPay: INDUSTRY_PAY,
});
export const usingIndustry = (r: Rates) => JSON.stringify(r.tiers) === JSON.stringify(INDUSTRY_RATES().tiers);
