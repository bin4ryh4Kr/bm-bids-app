// Every price is blank until the business enters its own in Settings.
export type Rates = {
  tiers: number[][]; bathFull: { standard: number; deep: number; move: number }; bathHalf: { standard: number; deep: number; move: number };
  hourly: number; hourlyMin: number; depositPct: number; off: { weekly: number; biweekly: number; monthly: number }; rush: number; sunday: number; carpetMin: number; addOns: Record<string, number>;
};
export const TIER_NAMES = ['Up to 1,000 sq ft (1-2 bed)', '1,001 - 1,500 sq ft (2-3 bed)', '1,501 - 2,000 sq ft (3 bed)', '2,001 - 2,500 sq ft (3-4 bed)', '2,501 - 3,000 sq ft (4+ bed)'];
export const TIER_MAX_BEDS = [2, 3, 3, 4, Infinity];
export const NAMES = { standard: 'Standard Clean', deep: 'Deep Clean', move: 'Move-In / Move-Out Clean', hourly: 'Hourly / custom work' };
export const FREQ = {
  weekly: { name: 'Weekly', perMonth: 52 / 12, firstMonth: 4 },
  biweekly: { name: 'Every 2 weeks', perMonth: 26 / 12, firstMonth: 2 },
  monthly: { name: 'Monthly', perMonth: 1, firstMonth: 1 },
};

export type AddOn = { id: string; name: string; unit?: string; qty?: boolean; in: string[] };
export const ADD_ONS: AddOn[] = [
  { id: 'oven', name: 'Inside oven', in: ['move'] },
  { id: 'fridge', name: 'Inside refrigerator', in: ['move'] },
  { id: 'cabinets', name: 'Inside cabinets & drawers (empty)', in: ['move'] },
  { id: 'baseboards', name: 'Baseboards hand-wiped', in: ['deep', 'move'] },
  { id: 'walls', name: 'Wall spot-cleaning', in: ['move'] },
  { id: 'pet', name: 'Heavy pet hair', in: [] },
  { id: 'garage', name: 'Garage sweep-out', in: [] },
  { id: 'porch', name: 'Screened porch or patio', in: [] },
  { id: 'windows', name: 'Interior windows, sills & tracks', unit: 'window', qty: true, in: ['move'] },
  { id: 'blinds', name: 'Blinds, detailed wipe', unit: 'blind', qty: true, in: ['move'] },
  { id: 'laundry', name: 'Laundry, wash, dry & fold', unit: 'load', qty: true, in: [] },
  { id: 'carpet', name: 'Carpet extraction', unit: 'room', qty: true, in: [] },
  { id: 'stairs', name: 'Carpeted stairs', unit: 'staircase', qty: true, in: [] },
];

export const DEFAULT_RATES = (): Rates => ({
  tiers: [1000, 1500, 2000, 2500, 3000].map(size => [size, 0, 0, 0]),
  bathFull: { standard: 0, deep: 0, move: 0 }, bathHalf: { standard: 0, deep: 0, move: 0 },
  hourly: 0, hourlyMin: 0, depositPct: 0, off: { weekly: 0, biweekly: 0, monthly: 0 }, rush: 0, sunday: 0, carpetMin: 0,
  addOns: Object.fromEntries(ADD_ONS.map(a => [a.id, 0])),
});

export const SPACE_TYPES = [
  { rate: 3000, name: 'General office' }, { rate: 2200, name: 'Medical / dental' }, { rate: 1800, name: 'Vet clinic' },
  { rate: 2500, name: 'Gym / studio / salon' }, { rate: 3500, name: 'Retail / showroom' },
  { rate: 4000, name: 'Church / community hall' }, { rate: 3500, name: 'Apartment / HOA common areas' },
];

export type Company = { name: string; phone: string; email: string; web: string; city: string; logo: string; pay: string; tagline: string; bio: string };
export const emptyCompany = (): Company => ({ name: '', phone: '', email: '', web: '', city: '', logo: '', pay: '', tagline: '', bio: '' });
export const EXAMPLE_ESTIMATE_TERMS = 'Example: your date is held once we receive this signed estimate and the deposit.';
export const EXAMPLE_INVOICE_TERMS = 'Example: please include the invoice number with your payment.';
export const MAKER = { name: 'Beauty & Muscle', url: 'https://www.beautyandmusclepm.com/?utm_source=bm-bids-app&utm_medium=app', site: 'beautyandmusclepm.com' };
