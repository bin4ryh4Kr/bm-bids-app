import { ADD_ONS, DEFAULT_RATES, FREQ, SPACE_TYPES, TIER_MAX_BEDS, TIER_NAMES, type Rates } from './rates';

export type Costs = {
  wage: number; burden: number; mileRate: number; supplies: number; overhead: number; profit: number;
  restroomMin: number; kitchenMin: number; minimum: number; round: number;
  speedStd: number; speedDeep: number; speedMove: number; minHours: number;
  trashMin: number; glassMin: number; stairsMin: number; elevatorMin: number; doorMin: number;
  floorCarpet: number; floorTile: number; floorWood: number; floorConcrete: number;
};
export const DEFAULT_COSTS: Costs = {
  wage: 0, burden: 0, mileRate: 0, supplies: 0, overhead: 0, profit: 0,
  restroomMin: 0, kitchenMin: 0, minimum: 0, round: 0, speedStd: 0, speedDeep: 0, speedMove: 0, minHours: 0,
  trashMin: 0, glassMin: 0, stairsMin: 0, elevatorMin: 0, doorMin: 0, floorCarpet: 0, floorTile: 0, floorWood: 0, floorConcrete: 0,
};

export const priceFor = (direct: number, profitPct: number, overheadPct: number, minimum: number, roundTo: number) => {
  const share = 1 - (overheadPct + profitPct) / 100;
  const p = Math.max(share > 0.05 ? direct / share : direct * 20, minimum);
  return Math.ceil(p / roundTo) * roundTo;
};

export type Floor = '' | 'carpet' | 'tile' | 'wood' | 'concrete';
export const FLOORS: { id: Floor; name: string }[] = [{ id: '', name: 'Same as the space' }, { id: 'carpet', name: 'Carpet' }, { id: 'tile', name: 'Tile / VCT' }, { id: 'wood', name: 'Hardwood' }, { id: 'concrete', name: 'Concrete' }];
export type Room = { name: string; sqft: number; floor: Floor };
export type Extra = { name: string; price: number; perYear: number };
export type ComBid = {
  client: string; space: number; sqft: number; visits: number; restrooms: number; kitchens: number; drive: number; miles: number;
  rooms: Room[]; traffic: number; trash: number; glass: number; stairs: number; elevators: number; doors: number; crew: number;
  suppliesVisit: number; taxPct: number; hoursOverride: number; sqftPrice: number; extras: Extra[]; leadId: string; bidId: string;
};
export const DEFAULT_COM: ComBid = {
  client: '', space: 0, sqft: 0, visits: 0, restrooms: 0, kitchens: 0, drive: 0, miles: 0, rooms: [], traffic: 0, trash: 0, glass: 0, stairs: 0, elevators: 0, doors: 0, crew: 0,
  suppliesVisit: 0, taxPct: 0, hoursOverride: 0, sqftPrice: 0, extras: [], leadId: '', bidId: '',
};
export const TRAFFIC = [{ pct: -10, name: 'Light: 10% faster' }, { pct: 0, name: 'Normal' }, { pct: 15, name: 'Busy: 15% slower' }, { pct: 25, name: 'Very busy: 25% slower' }];
export const VISIT_PLANS = [{ name: '5x a week', visits: 5 }, { name: '3x a week', visits: 3 }, { name: '2x a week', visits: 2 }, { name: 'Weekly', visits: 1 }, { name: 'Every 2 weeks', visits: 0.5 }, { name: 'Monthly', visits: 12 / 52 }];

export function commercial(b: ComBid, c: Costs) {
  const rate = Math.max(SPACE_TYPES[b.space]?.rate ?? 3000, 1);
  // A floor can slow a room down, but never makes a dental office clean faster than a dental office.
  const slower = (v: number) => v ? Math.min(v, rate) : rate;
  const floorRate = { '': rate, carpet: slower(c.floorCarpet), tile: slower(c.floorTile), wood: slower(c.floorWood), concrete: slower(c.floorConcrete) };
  const rooms = b.rooms.filter(r => r.sqft > 0);
  const sqft = rooms.length ? rooms.reduce((s, r) => s + r.sqft, 0) : b.sqft;
  const area = rooms.length ? rooms.reduce((s, r) => s + r.sqft / floorRate[r.floor], 0) : b.sqft / rate;
  const tasks = (b.restrooms * c.restroomMin + b.kitchens * c.kitchenMin + b.trash * c.trashMin + b.glass * c.glassMin + b.stairs * c.stairsMin + b.elevators * c.elevatorMin + b.doors * c.doorMin) / 60;
  const hours = b.hoursOverride > 0 ? b.hoursOverride : area * (1 + b.traffic / 100) + tasks;
  const crew = Math.max(Math.floor(b.crew), 1);
  const loaded = c.wage * (1 + c.burden / 100);
  const labor = hours * loaded;
  const drive = crew * b.drive / 60 * loaded + b.miles * c.mileRate;
  const supplies = labor * c.supplies / 100 + b.suppliesVisit;
  const direct = labor + drive + supplies;
  const roundTo = Math.max(c.round, 1);
  const price = b.sqftPrice > 0 ? Math.round(sqft * b.sqftPrice * 100) / 100 : priceFor(direct, c.profit, c.overhead, c.minimum, roundTo);
  const overhead = price * c.overhead / 100;
  const profit = price - direct - overhead;
  const visitsMo = Math.max(b.visits, 0) * 52 / 12;
  const extrasMonth = b.extras.reduce((s, x) => s + x.price * x.perYear / 12, 0);
  return {
    price, hours, loaded, labor, drive, supplies, direct, overhead, profit, visitsMo, sqft, crew, onsite: hours / crew, extrasMonth,
    monthly: price * visitsMo, yearly: price * visitsMo * 12, taxVisit: price * b.taxPct / 100,
    costMonth: direct * visitsMo, laborMonth: labor * visitsMo, suppliesMonth: supplies * visitsMo, hoursMonth: hours * visitsMo,
    perHour: hours > 0 ? price / hours : 0, laborPct: price > 0 ? labor / price * 100 : 0, margin: price > 0 ? profit / price * 100 : 0,
    priceSqft: sqft > 0 ? price / sqft : 0, costSqft: sqft > 0 ? direct / sqft : 0,
    floor: priceFor(direct, 10, c.overhead, c.minimum, roundTo), high: priceFor(direct, 30, c.overhead, c.minimum, roundTo),
  };
}
export const comparePlans = (b: ComBid, c: Costs) => VISIT_PLANS.map(p => {
  const r = commercial({ ...b, visits: p.visits }, c);
  return { name: p.name, visits: p.visits, perVisit: r.price, monthly: r.monthly, yearly: r.yearly, profitMonth: r.profit * r.visitsMo };
});

export type Job = 'standard' | 'deep' | 'move' | 'weekly' | 'biweekly' | 'monthly' | 'hourly';
export type ResBid = {
  client: string; job: Job; hours: number; sqft: number; beds: number; full: number; half: number; cond: number; crew: number;
  drive: number; miles: number; rush: boolean; sunday: boolean; extras: number; repeat: boolean; addOns: Record<string, number>; leadId: string; bidId: string;
};
export const DEFAULT_RES: ResBid = {
  client: '', job: 'standard', hours: 0, sqft: 0, beds: 0, full: 0, half: 0, cond: 0, crew: 0, drive: 0, miles: 0,
  rush: false, sunday: false, extras: 0, repeat: false, addOns: {}, leadId: '', bidId: '',
};

type Kind = 'standard' | 'deep' | 'move' | 'hourly';

// List price before extra baths. Over 3,000 sq ft the sheet says "Quoted", so scale the top tier as a starting number.
export function basePrice(kind: Exclude<Kind, 'hourly'>, sqft: number, R: Rates) {
  const col = { standard: 1, deep: 2, move: 3 }[kind];
  const tier = R.tiers.find(t => sqft <= t[0]);
  const top = R.tiers[R.tiers.length - 1];
  return tier ? tier[col] : Math.ceil(top[col] * sqft / top[0] / 5) * 5;
}

export function addOnsFor(kind: Kind, b: ResBid, R: Rates) {
  let total = 0;
  const lines: string[] = [];
  for (const a of ADD_ONS) {
    if (a.in.includes(kind)) continue;
    const n = Math.floor(b.addOns[a.id] || 0);
    if (!n) continue;
    const price = R.addOns[a.id] ?? 0;
    total += a.qty ? Math.max(n * price, a.id === 'carpet' ? R.carpetMin : 0) : price;
    lines.push(a.qty ? `${a.name} (${n} ${a.unit}${n > 1 ? 's' : ''})` : a.name);
  }
  if (b.extras > 0) { total += b.extras; lines.push('Quoted extras'); }
  return { total, lines };
}

function visit(kind: Kind, b: ResBid, c: Costs, R: Rates, o: { off?: number; cond?: number; extra?: number; addOns: boolean }) {
  const add = o.addOns ? addOnsFor(kind, b, R) : { total: 0, lines: [] as string[] };
  let clean: number, hours: number;
  if (kind === 'hourly') {
    hours = Math.max(b.hours, R.hourlyMin);
    clean = hours * R.hourly;
  } else {
    const bath = Math.max(Math.floor(b.full) - 2, 0) * R.bathFull[kind] + Math.max(Math.floor(b.half) - 1, 0) * R.bathHalf[kind];
    const speed = { standard: c.speedStd, deep: c.speedDeep, move: c.speedMove }[kind];
    clean = (basePrice(kind, b.sqft, R) + bath) * (1 - (o.off || 0)) * (1 + (o.cond || 0));
    hours = (Math.max(speed ? b.sqft / speed : 0, c.minHours) + (R.hourly ? bath / R.hourly : 0)) * (1 + (o.cond || 0));
  }
  hours += R.hourly ? add.total / R.hourly : 0;
  return { price: Math.round((clean + add.total) * (1 + (o.extra || 0))), hours, add };
}

export function residential(b: ResBid, c: Costs, R: Rates = DEFAULT_RATES()) {
  const rec = b.job === 'weekly' || b.job === 'biweekly' || b.job === 'monthly' ? { ...FREQ[b.job], off: R.off[b.job] / 100 } : null;
  const hourly = b.job === 'hourly';
  const cond = hourly ? 0 : b.cond / 100;
  const rush = b.rush ? R.rush / 100 : 0, sun = b.sunday ? R.sunday / 100 : 0;
  const firstKind: Kind = rec ? 'deep' : (b.job as Kind);
  const overSheet = !hourly && b.sqft > R.tiers[R.tiers.length - 1][0];
  const first = rec ? visit('deep', b, c, R, { cond, extra: rush + sun, addOns: true }) : null;
  const main = rec
    ? visit('standard', b, c, R, { off: rec.off, extra: sun, addOns: b.repeat })
    : visit(firstKind, b, c, R, { cond, extra: rush + sun, addOns: true });
  const loaded = c.wage * (1 + c.burden / 100);
  const crew = Math.max(Math.floor(b.crew), 1);
  const labor = main.hours * loaded;
  const drive = crew * b.drive / 60 * loaded + b.miles * c.mileRate;
  const supplies = labor * c.supplies / 100;
  const direct = labor + drive + supplies;
  const overhead = main.price * c.overhead / 100;
  const profit = main.price - direct - overhead;
  const tierIndex = R.tiers.findIndex(t => b.sqft <= t[0]);
  return {
    rec, hourly, firstKind, overSheet, first, main, loaded, crew, labor, drive, supplies, direct, overhead, profit,
    onsite: main.hours / crew, perHour: main.hours > 0 ? main.price / main.hours : 0,
    laborPct: main.price > 0 ? labor / main.price * 100 : 0, profitPct: main.price > 0 ? profit / main.price * 100 : 0,
    floor: priceFor(direct, 10, c.overhead, 0, 1), target: priceFor(direct, c.profit, c.overhead, 0, 1), high: priceFor(direct, 30, c.overhead, 0, 1),
    deposit: rec ? 0 : main.price * R.depositPct / 100, balance: rec ? 0 : main.price * (1 - R.depositPct / 100),
    firstMonth: rec && first ? first.price + (rec.firstMonth - 1) * main.price : 0,
    monthly: rec ? main.price * rec.perMonth : 0, profitMonth: rec ? profit * rec.perMonth : profit,
    tierName: !b.sqft ? '' : overSheet ? 'Over 3,000 sq ft: custom quote, scaled from your top price' : `Price tier: ${TIER_NAMES[tierIndex]}`,
    manyBeds: !overSheet && !hourly && Math.floor(b.beds) > TIER_MAX_BEDS[tierIndex],
  };
}
