// The business side of the app: pipeline, contracts, renewals, schedule, timesheets, prospecting.
// Pure logic only, so all of it can be tested. Nothing here holds a built-in price or wage.
import { addDays, balance, today, total, uid, type Client, type Estimate, type Invoice } from './docs';
import type { Receipt, Trip } from './expenses';

export const STAGES = ['Prospect', 'Contacted', 'Quoted', 'Won', 'Lost'] as const;
export type Stage = typeof STAGES[number];
export type Lead = {
  id: string; name: string; contact: string; phone: string; email: string; street: string; city: string; web: string;
  kind: 'commercial' | 'residential'; sqft: number; monthly: number; cost: number; stage: Stage; next: string; notes: string; estimateId: string; added: string;
};
export const blankLead = (o: Partial<Lead> = {}): Lead => ({
  id: uid(), name: '', contact: '', phone: '', email: '', street: '', city: '', web: '', kind: 'commercial', sqft: 0, monthly: 0, cost: 0,
  stage: 'Prospect', next: '', notes: '', estimateId: '', added: today(), ...o,
});

export function pipelineStats(leads: Lead[], on = today()) {
  const sum = (l: Lead[]) => l.reduce((s, x) => s + x.monthly, 0);
  const won = leads.filter(l => l.stage === 'Won'), lost = leads.filter(l => l.stage === 'Lost');
  const open = leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost');
  const priced = leads.filter(l => l.stage !== 'Lost' && l.monthly > 0 && l.cost > 0);
  const revenue = sum(priced);
  return {
    open: sum(open), active: sum(won), openCount: open.length, wonCount: won.length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) * 100 : 0,
    margin: revenue ? (revenue - priced.reduce((s, x) => s + x.cost, 0)) / revenue * 100 : 0,
    due: open.filter(l => l.next && l.next <= on).length,
  };
}
export const stageFor = (status: Estimate['status'], now: Stage): Stage =>
  status === 'Accepted' ? 'Won' : status === 'Declined' ? 'Lost' : status === 'Sent' && (now === 'Prospect' || now === 'Contacted') ? 'Quoted' : now;

type Kind = 'commercial' | 'residential';
export type Contract = {
  id: string; number: string; date: string; end: string; months: number; autoRenew: boolean; client: Client; contact: string; title: string;
  service: string; monthly: number; payTerms: string; clauses: string; status: 'Draft' | 'Sent' | 'Signed';
  ourName: string; ourSign: string; theirName: string; theirSign: string; signedOn: string;
  kind?: Kind; visit?: number; frequency?: string; deposit?: number; title_?: string; intro?: string; afterSign?: string; days?: string; window?: string; attach?: Estimate;
  signToken?: string; sentOn?: string; signedAt?: string; signIp?: string; signDevice?: string; pdfSha?: string;
  hours: number; labor: number; supplies: number; actHours: number; actLabor: number; actSupplies: number; addHours: number; target: number;
};
export const addMonths = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
export function blankContract(existing: { number: string }[], o: Partial<Contract> = {}): Contract {
  const date = today(), year = date.slice(0, 4);
  const used = existing.filter(c => c.number.startsWith(`SA-${year}-`)).map(c => parseInt(c.number.slice(8), 10) || 0);
  return {
    id: uid(), number: `SA-${year}-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`, date, end: addMonths(date, 12), months: 12, autoRenew: false,
    client: { name: '', phone: '', email: '', street: '', city: '' }, contact: '', title: '', service: '', monthly: 0, payTerms: 'Net 15', clauses: COMMERCIAL_TERMS, status: 'Draft', kind: 'commercial', visit: 0, frequency: '', deposit: 0,
    ourName: '', ourSign: '', theirName: '', theirSign: '', signedOn: '', hours: 0, labor: 0, supplies: 0, actHours: 0, actLabor: 0, actSupplies: 0, addHours: 0, target: 0, ...o,
  };
}
export function contractFromEstimate(e: Estimate, existing: { number: string }[], target: number, words?: Wordings): Contract {
  const w = wordingFor(e.kind, words);
  const service = e.scope || e.items.map(i => [i.name, i.desc].filter(Boolean).join(': ')).join('\n');
  const home = e.kind === 'residential';
  return blankContract(existing, {
    client: { ...e.client }, service, monthly: e.monthly ?? 0, hours: e.job?.hours ?? 0, labor: e.job?.labor ?? 0, supplies: e.job?.supplies ?? 0, target,
    kind: e.kind, attach: e, clauses: w.terms, title_: w.title, intro: w.intro, afterSign: w.after, months: home ? 0 : 12, visit: e.perVisit ?? total(e), frequency: e.recurringRate.split(':')[0], deposit: home ? e.deposit : 0, payTerms: home ? 'Due on completion' : 'Net 15',
  });
}
export type Wording = { title: string; intro: string; terms: string; after: string };
export type Wordings = Partial<Record<Kind, Wording>>;
// A business can load its own full agreement. Without one, the standard wording below is used.
export const wordingFor = (k: Kind, w?: Wordings): Wording => w?.[k]?.terms ? w[k]! : { title: contractTitle(k), intro: '', terms: termsFor(k), after: '' };

export const contractTitle = (k: Kind) => k === 'residential' ? 'Residential Cleaning Services Agreement' : 'Commercial Cleaning Services Agreement';

// Standard wording that uses defined terms, so sections 1 to 3 can be written from the contract's own fields.
// A starting form to edit, not legal advice.
export const COMMERCIAL_TERMS = `4. Invoicing and Late Payment. Provider will invoice Client each month. Any amount not paid when due accrues interest at 1.5% per month or the highest rate allowed by law, whichever is lower. If an account is more than 15 days past due, Provider may suspend the Services after written notice until the account is current. Client will pay reasonable costs of collecting past-due amounts.

5. Changes in Scope. Additional services, added square footage, or changes to the service schedule must be agreed in writing, including any change to the fees, before the work begins.

6. Client Responsibilities. Client will give Provider safe and timely access to the Service Location, including keys, access cards and alarm codes, and will provide water, electricity and a safe working environment. Client will tell Provider about any known hazard at the Service Location. Client is responsible for securing cash, valuables and confidential materials.

7. Supplies and Equipment. Provider will furnish the labor, cleaning chemicals and equipment needed for the Services. Unless otherwise agreed in writing, Client will furnish restroom paper products, hand soap and trash liners.

8. Independent Contractor. Provider is an independent contractor and not an employee, partner or agent of Client. Provider is solely responsible for its personnel, including their supervision, wages, payroll taxes, and workers' compensation coverage as required by law.

9. Insurance. Provider will maintain commercial general liability insurance during the term of this Agreement and will give Client a certificate of insurance on request.

10. Service Concerns. Client will report any concern about the quality of the Services to Provider in writing within two (2) business days after the Services are performed. Provider will correct any confirmed deficiency at no additional charge, which is Client's exclusive remedy for service quality concerns.

11. Damage and Limitation of Liability. Provider is responsible for physical damage to the Service Location caused by the negligence of its personnel, if Client reports the damage in writing within two (2) business days after it is discovered. Neither party is liable to the other for indirect, incidental, special or consequential damages, including lost profits. Except for amounts paid by Provider's insurance and any liability that cannot be limited by law, Provider's total liability under this Agreement will not exceed the fees paid by Client during the three (3) months before the claim arose.

12. Indemnification. Each party will indemnify and hold harmless the other from third-party claims for bodily injury or property damage to the extent caused by the negligence or willful misconduct of the indemnifying party or its personnel.

13. Non-Solicitation. During the term of this Agreement and for twelve (12) months after it ends, Client will not directly or indirectly hire or engage any Provider personnel who performed Services at the Service Location, except with Provider's written consent.

14. Confidentiality. Each party will keep confidential any non-public information it learns about the other party's business and will use it only to perform this Agreement.

15. Termination. Either party may terminate this Agreement without cause by giving thirty (30) days' written notice. Either party may terminate for material breach if the other party fails to cure the breach within ten (10) days after written notice. Client will pay for all Services performed through the termination date.

16. Force Majeure. Neither party is liable for a delay or failure to perform, other than a payment obligation, caused by events beyond its reasonable control, including severe weather, natural disasters, power failures, and government orders.

17. Notices. Notices under this Agreement must be in writing and delivered by hand, by mail, or by email with confirmation of receipt, to the addresses the parties have given each other.

18. Governing Law and Disputes. This Agreement is governed by the laws of the state where the Service Location is located. The parties will first try in good faith to resolve any dispute by direct discussion.

19. General. This Agreement is the entire agreement between the parties on its subject and replaces all earlier discussions. It may be changed only in a writing signed by both parties. Neither party may assign it without the other's written consent, which will not be unreasonably withheld. If any provision is held unenforceable, the rest remains in effect. A failure to enforce a provision is not a waiver of it. This Agreement may be signed in counterparts and by electronic signature, each of which is treated as an original.`;

export const RESIDENTIAL_TERMS = `4. Scheduling and Access. Provider will give Client an arrival window for each visit. Client will give Provider access to the home at the scheduled time by being home or by providing a key, door code or other entry method. If Provider's crew arrives and cannot enter, Client may be charged up to the full price of the visit.

5. Cancellations and Rescheduling. Client will give at least forty-eight (48) hours' notice to cancel or reschedule a visit. A cancellation with less notice may be charged up to fifty percent (50%) of the price of the visit.

6. Late and Returned Payments. Any amount not paid when due accrues interest at 1.5% per month or the highest rate allowed by law, whichever is lower. Client will pay any bank fee caused by a returned payment. Provider may pause service until the account is current.

7. Condition of the Home. Pricing assumes the condition described when the home was quoted, with running water and electricity. Client will pick up clutter, dishes and personal items so that surfaces can be reached. If the home's condition differs materially from what was quoted, Provider may adjust the price or the work with Client's approval before continuing.

8. Pets. Client will secure any pet that may be aggressive, anxious, or able to get out of the home during a visit, and will tell Provider about pets before the first visit.

9. Valuables and Fragile Items. Client will put away or secure cash, jewelry, medications, firearms, and irreplaceable, fragile or high-value items. Provider's crew will not be asked to move or clean those items.

10. Work Not Included. Unless agreed in writing, the Services do not include moving heavy furniture, climbing above a two-step ladder, exterior windows, or cleaning biohazards, mold, pest waste or hazardous materials. Provider's crew may decline any task it reasonably considers unsafe.

11. Supplies and Equipment. Provider will bring its own cleaning supplies and equipment unless Client asks Provider in writing to use specific products supplied by Client.

12. Satisfaction. Client will report any concern about a visit to Provider within twenty-four (24) hours after the visit. Provider will return to re-clean any confirmed missed area at no additional charge, which is Client's exclusive remedy for service quality concerns.

13. Damage and Limitation of Liability. Provider is responsible for physical damage caused by the negligence of its crew, if Client reports the damage within twenty-four (24) hours after the visit. Provider may repair, replace, or pay the reasonable value of the damaged item. Provider is not responsible for normal wear, pre-existing damage, or damage caused by an item's improper installation or condition. Neither party is liable for indirect or consequential damages. Except for amounts paid by Provider's insurance and any liability that cannot be limited by law, Provider's total liability will not exceed the amount Client paid for the visit in question.

14. Insurance and Personnel. Provider will maintain general liability insurance during the term of this Agreement. Provider is an independent contractor and is responsible for its crew, including their supervision and pay.

15. Non-Solicitation. During the term of this Agreement and for twelve (12) months after it ends, Client will not directly hire any crew member introduced by Provider for cleaning services, except with Provider's written consent.

16. Termination. Either party may end recurring service by giving fourteen (14) days' written notice. Client will pay for all visits performed through the end date. Provider may end service immediately if its crew's safety is at risk.

17. Governing Law. This Agreement is governed by the laws of the state where the home is located. The parties will first try in good faith to resolve any dispute by direct discussion.

18. General. This Agreement is the entire agreement between the parties on its subject and may be changed only in writing. If any provision is held unenforceable, the rest remains in effect. This Agreement may be signed in counterparts and by electronic signature, each of which is treated as an original.`;
export const termsFor = (k: Kind) => k === 'residential' ? RESIDENTIAL_TERMS : COMMERCIAL_TERMS;

const usd = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '________';
// The opening paragraph and sections 1 to 3, written from the contract's fields.
export function contractOpening(c: Contract, provider: string, providerCity: string) {
  const kind = c.kind ?? 'commercial', home = kind === 'residential', title = c.title_ || contractTitle(kind);
  const place = [c.client.street, c.client.city].filter(Boolean).join(', ') || '________';
  const opening = c.intro ? c.intro.replace('{date}', longDate(c.date)).replace('{client}', c.client.name || '________').replace('{premises}', place) : `This ${title} (this "Agreement") is made as of ${longDate(c.date)} (the "Effective Date") between ${provider || '________'}${providerCity ? ' of ' + providerCity : ''} ("Provider") and ${c.client.name || '________'} ("Client"), for cleaning services at ${place} (the "Service Location").`;
  const renew = c.autoRenew ? `It then renews for successive terms of the same length unless either party gives written notice of non-renewal at least thirty (30) days before the current term ends.` : `It ends at that time unless the parties renew it in writing.`;
  const term = c.months > 0 ? `This Agreement begins on the Effective Date and continues for ${c.months} month${c.months === 1 ? '' : 's'}, through ${longDate(c.end)}. ${renew}` : `This Agreement begins on the Effective Date and continues until it is ended under its termination section${home ? ' or the agreed visit is complete' : ''}.`;
  const fee = home
    ? `Client will pay Provider ${usd(c.visit ?? 0)} per visit${c.frequency ? ` (${c.frequency})` : ''}.${c.deposit ? ` A deposit of ${usd(c.deposit)} is due to reserve the first visit and is credited to that visit.` : ''} Payment terms: ${c.payTerms}. Sales tax is added where required by law.`
    : `Client will pay Provider ${usd(c.monthly)} per month (the "Monthly Fee")${c.frequency ? `, for service at this frequency: ${c.frequency}` : ''}. Payment terms: ${c.payTerms}. Sales tax is added where required by law.`;
  const sections = `1. Services. Provider will perform the following services at the Service Location (the "Services"): ${c.service || '________'}\n\n2. Term. ${term}\n\n3. Fees and Payment. ${fee}`;
  if (!c.intro) return { opening, sections };
  // A full agreement has its own numbered sections, so these become lettered key terms in its own defined words.
  return { opening, sections: sections.replace(/^1\. /m, 'A. ').replace(/^2\. /m, 'B. ').replace(/^3\. /m, 'C. ').replace(/\bProvider\b/g, 'Service Provider').replace(/Service Location/g, 'Premises').replace(/the Effective Date/g, 'the date first written above') };
}

// Fills the blanks a full agreement leaves for the schedule and price.
export function fillTerms(c: Contract) {
  const put = (label: string, v: string) => (t: string) => v ? t.replace(new RegExp(`^(${label}): _+$`, 'm'), (_, l) => `${l}: ${v}`) : t;
  const steps = [put('Frequency', c.frequency ?? ''), put('Visits per Week / Month', c.frequency ?? ''), put('Start Date', longDate(c.date)), put('Service Days', c.days ?? ''), put('Approximate (?:Arrival|Service) Window', c.window ?? ''), put('Other Pricing Terms', 'None'),
    put('Company / Organization Name', c.client.name), put('Contact Name', [c.contact, c.title].filter(Boolean).join(', ')), put('Notice Address', [c.client.street, c.client.city].filter(Boolean).join(', ')), put('Email for Notices', c.client.email), put('Notice Phone', c.client.phone), put('Monthly Service Fee \\(\\$ per month\\)', c.monthly ? usd(c.monthly) : ''),
    put('Per-Visit Fee, if applicable \\(\\$ per visit\\)', c.visit ? usd(c.visit) : ''), put('Price per Visit \\(\\$\\)', c.visit ? usd(c.visit) : '')];
  const term = c.months === 0 ? 'Month-to-Month' : `${c.months} Months`;
  const t = steps.reduce((x, f) => f(x), c.clauses).replace(`[ ] ${term}`, `[X] ${term}`);
  const service = c.kind === 'residential' ? (c.frequency ? 'Recurring' : 'One-Time') : c.frequency ? 'Recurring Janitorial' : 'One-Time Project';
  return (c.attach ? t.replace('[ ] Estimate (BM-C-04)', '[X] Estimate (BM-C-04)') : t).replace(`[ ] ${service}`, `[X] ${service}`);
}

export function renewal(c: Pick<Contract, 'monthly' | 'hours' | 'labor' | 'supplies' | 'actHours' | 'actLabor' | 'actSupplies' | 'addHours' | 'target'>) {
  const pct = (rev: number, cost: number) => rev > 0 ? (rev - cost) / rev * 100 : 0;
  const hourly = c.actHours > 0 ? c.actLabor / c.actHours : c.hours > 0 ? c.labor / c.hours : 0;
  const addCost = c.addHours * hourly;
  const cost = c.actLabor + c.actSupplies + addCost;
  const share = 1 - c.target / 100;
  const needed = share > 0.05 ? Math.ceil(cost / share) : 0;
  const rate = Math.max(needed, c.monthly);
  const creep = c.actHours - c.hours + c.addHours;
  return {
    original: pct(c.monthly, c.labor + c.supplies), actual: pct(c.monthly, c.actLabor + c.actSupplies), addCost, cost, rate, creep,
    change: c.monthly > 0 ? (rate - c.monthly) / c.monthly * 100 : 0, raise: rate > c.monthly,
  };
}
export const renewalNote = (client: string, c: Contract, r: ReturnType<typeof renewal>) => r.raise
  ? `${client ? client + ': ' : ''}we looked back at the work on your location. It now takes about ${(c.actHours + c.addHours).toFixed(1)} hours a month, compared with ${c.hours.toFixed(1)} when we first priced it. To keep the same level of service, your new monthly rate would be $${r.rate.toLocaleString('en-US')}, up from $${c.monthly.toLocaleString('en-US')}. We're glad to walk through the numbers with you.`
  : `${client ? client + ': ' : ''}we looked back at the work on your location, and your monthly rate of $${c.monthly.toLocaleString('en-US')} stays the same for the next term.`;

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export type Worker = { id: string; name: string; pay: number; week: number };
export type Shift = { id: string; day: number; client: string; start: string; hours: number; workers: string[] };
export const blankWorker = (): Worker => ({ id: uid(), name: '', pay: 0, week: 0 });
export const blankShift = (day = 0): Shift => ({ id: uid(), day, client: '', start: '', hours: 0, workers: [] });
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function capacity(workers: Worker[], shifts: Shift[], burden: number) {
  const rows = workers.map(w => {
    const booked = shifts.filter(s => s.workers.includes(w.id)).reduce((s, x) => s + x.hours, 0);
    return { ...w, booked, open: w.week - booked, over: w.week > 0 && booked > w.week, cost: booked * w.pay * (1 + burden / 100) };
  });
  const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    rows, booked: sum(r => r.booked), available: sum(r => r.week), open: sum(r => Math.max(r.open, 0)), weekCost: sum(r => r.cost),
    unassigned: shifts.filter(s => !s.workers.length).length,
  };
}
export function clashes(shifts: Shift[]) {
  const out = new Set<string>();
  shifts.forEach((a, i) => shifts.slice(i + 1).forEach(b => {
    if (a.day !== b.day || !a.start || !b.start || !a.workers.some(w => b.workers.includes(w))) return;
    if (mins(a.start) < mins(b.start) + b.hours * 60 && mins(b.start) < mins(a.start) + a.hours * 60) { out.add(a.id); out.add(b.id); }
  }));
  return out;
}

export type Punch = { id: string; worker: string; date: string; in: string; out: string; breakMin: number; client: string };
export const punchHours = (p: Punch) => {
  if (!p.in || !p.out) return 0;
  let m = mins(p.out) - mins(p.in);
  if (m < 0) m += 1440; // crossed midnight
  return Math.max(m - p.breakMin, 0) / 60;
};
export const mondayOf = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); };
export function payroll(punches: Punch[], workers: Worker[], monday: string) {
  const end = addDays(monday, 6);
  const rows = workers.map(w => {
    const hours = punches.filter(p => p.worker === w.id && p.date >= monday && p.date <= end).reduce((s, p) => s + punchHours(p), 0);
    const regular = Math.min(hours, 40), ot = Math.max(hours - 40, 0);
    return { id: w.id, name: w.name, pay: w.pay, hours, regular, ot, gross: regular * w.pay + ot * w.pay * 1.5 };
  }).filter(r => r.hours > 0);
  return { rows, hours: rows.reduce((s, r) => s + r.hours, 0), gross: rows.reduce((s, r) => s + r.gross, 0) };
}
export function punchesFromSchedule(shifts: Shift[], monday: string, have: Punch[]) {
  const out: Punch[] = [];
  for (const s of shifts) for (const w of s.workers) {
    const date = addDays(monday, s.day);
    if (have.some(p => p.worker === w && p.date === date && p.client === s.client)) continue;
    const end = mins(s.start) + s.hours * 60;
    out.push({ id: uid(), worker: w, date, in: s.start, out: s.start ? `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(Math.round(end % 60)).padStart(2, '0')}` : '', breakMin: 0, client: s.client });
  }
  return out;
}

// Pay check: what it costs in a year to bring your average pay up to the market number you looked up.
export function payGap(workers: Worker[], booked: number, market: number, burden: number) {
  const paid = workers.filter(w => w.pay > 0);
  const avg = paid.length ? paid.reduce((s, w) => s + w.pay, 0) / paid.length : 0;
  return { avg, gap: market && avg ? market - avg : 0, yearly: market && avg ? Math.max(market - avg, 0) * booked * 52 * (1 + burden / 100) : 0 };
}

// Finding businesses to call. Only this feature touches the internet, and only when tapped.
export const FIND_TYPES: { name: string; q: string[] }[] = [
  { name: 'Offices', q: ['["office"]'] },
  { name: 'Dentists', q: ['["amenity"="dentist"]'] },
  { name: 'Doctors and clinics', q: ['["amenity"="doctors"]', '["amenity"="clinic"]'] },
  { name: 'Vets', q: ['["amenity"="veterinary"]'] },
  { name: 'Gyms', q: ['["leisure"="fitness_centre"]'] },
  { name: 'Banks', q: ['["amenity"="bank"]'] },
  { name: 'Churches', q: ['["amenity"="place_of_worship"]'] },
  { name: 'Schools and daycares', q: ['["amenity"="school"]', '["amenity"="kindergarten"]'] },
  { name: 'Salons', q: ['["shop"="hairdresser"]', '["shop"="beauty"]'] },
  { name: 'Car dealers', q: ['["shop"="car"]'] },
  { name: 'Restaurants', q: ['["amenity"="restaurant"]'] },
];
export type Found = { id: string; name: string; phone: string; web: string; email: string; street: string; city: string };
type Osm = { id: number; tags?: Record<string, string> };
export function parseFound(elements: Osm[]): Found[] {
  const seen = new Set<string>();
  return elements.flatMap(e => {
    const t = e.tags || {}, name = t.name?.trim();
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [{
      id: String(e.id), name, phone: t.phone || t['contact:phone'] || '', web: t.website || t['contact:website'] || '', email: t.email || t['contact:email'] || '',
      street: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), city: [t['addr:city'], t['addr:state']].filter(Boolean).join(', '),
    }];
  }).sort((a, b) => Number(!!b.phone) - Number(!!a.phone) || a.name.localeCompare(b.name));
}
export async function findBusinesses(town: string, type: string, miles: number): Promise<Found[]> {
  const place = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(town)}`).then(r => { if (!r.ok) throw new Error('net'); return r.json(); });
  if (!place[0]) throw new Error('town');
  const around = `(around:${Math.round(miles * 1609)},${place[0].lat},${place[0].lon})`;
  const q = (FIND_TYPES.find(t => t.name === type) ?? FIND_TYPES[0]).q.map(x => `nwr${x}${around};`).join('');
  const body = new URLSearchParams({ data: `[out:json][timeout:25];(${q});out center tags 200;` });
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body });
  if (!res.ok) throw new Error('net');
  return parseFound((await res.json()).elements || []);
}

// One honest look at the whole business, from what is already in the app.
export function pulse(d: { invoices: Invoice[]; receipts: Receipt[]; trips: Trip[]; leads: Lead[]; contracts: Contract[] }, on = today()) {
  const year = on.slice(0, 4), month = on.slice(0, 7), soon = addDays(on, 60);
  const unpaid = d.invoices.filter(i => i.status === 'Unpaid');
  const collected = d.invoices.filter(i => i.status === 'Paid' && (i.paidDate || i.date).startsWith(year)).reduce((s, i) => s + balance(i) + i.credit, 0);
  const spent = d.receipts.filter(r => r.date.startsWith(year)).reduce((s, r) => s + r.total, 0);
  const miles = d.trips.filter(t => t.date.startsWith(year)).reduce((s, t) => s + t.miles * t.rate, 0);
  return {
    owed: unpaid.reduce((s, i) => s + balance(i), 0), late: unpaid.filter(i => i.dueDate < on).length, collected, spent, miles, left: collected - spent - miles,
    spentMonth: d.receipts.filter(r => r.date.startsWith(month)).reduce((s, r) => s + r.total, 0),
    ending: d.contracts.filter(c => c.status === 'Signed' && c.end && c.end >= on && c.end <= soon).length,
  };
}
