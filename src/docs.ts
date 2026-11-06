import { commercial, comparePlans, residential, type ComBid, type Costs, type ResBid } from './calc';
import { NAMES, SPACE_TYPES, type Rates } from './rates';

export type Item = { name: string; desc: string; qty: number; price: number };
export type Client = { name: string; phone: string; email: string; street: string; city: string };
export type Kind = 'residential' | 'commercial';
export type Estimate = {
  id: string; number: string; date: string; validUntil: string; kind: Kind; recurring: boolean; client: Client; items: Item[];
  discount: number; tax: number; deposit: number; depositPaid: boolean; recurringRate: string; duration: string; notes: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
  taxPct?: number; scope?: string; options?: Plan[]; leadId?: string; monthly?: number; perVisit?: number; job?: { hours: number; labor: number; supplies: number };
};
export type Plan = { name: string; perVisit: number; monthly: number };
export type Invoice = {
  id: string; number: string; date: string; dueDate: string; terms: string; jobRef: string; client: Client; items: Item[];
  discount: number; tax: number; credit: number; notes: string; status: 'Unpaid' | 'Paid'; paidDate: string; paidMethod: string; taxPct?: number;
};

export const emptyClient = (): Client => ({ name: '', phone: '', email: '', street: '', city: '' });
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const niceDate = (iso: string) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
export const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
export const money2 = (v: number) => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const subtotal = (d: { items: Item[] }) => d.items.reduce((s, i) => s + i.qty * i.price, 0);
type Priced = { items: Item[]; discount: number; tax: number; taxPct?: number };
export const taxOf = (d: Priced) => d.taxPct ? Math.round((subtotal(d) - d.discount) * d.taxPct) / 100 : d.tax;
export const total = (d: Priced) => subtotal(d) - d.discount + taxOf(d);
export const balance = (i: Invoice) => total(i) - i.credit;

// Job number: 2026-SMITH-01. The last word of the client's name, counted per client.
export function jobNumber(name: string, date: string, existing: { number: string }[]) {
  const word = (name.trim().split(/\s+/).pop() || 'CLIENT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CLIENT';
  const prefix = `${date.slice(0, 4)}-${word}-`;
  const used = existing.filter(e => e.number.startsWith(prefix)).map(e => parseInt(e.number.slice(prefix.length), 10) || 0);
  return prefix + String(Math.max(0, ...used) + 1).padStart(2, '0');
}

export function blankEstimate(existing: Estimate[], kind: Kind = 'residential'): Estimate {
  const date = today();
  return {
    id: uid(), number: jobNumber('', date, existing), date, validUntil: addDays(date, 30), kind, recurring: false, client: emptyClient(),
    items: [{ name: '', desc: '', qty: 1, price: 0 }], discount: 0, tax: 0, deposit: 0, depositPaid: false,
    recurringRate: '', duration: '', notes: '', status: 'Draft',
  };
}

// `price` is set when one of the three quote boxes was picked instead of the list price.
export function estimateFromResidential(b: ResBid, c: Costs, R: Rates, existing: Estimate[], price?: number): Estimate {
  const r0 = residential(b, c, R);
  const visitPrice = price ?? r0.main.price;
  const r = { ...r0, main: { ...r0.main, price: visitPrice }, monthly: r0.rec ? visitPrice * r0.rec.perMonth : 0 };
  const e = blankEstimate(existing, 'residential');
  e.perVisit = visitPrice;
  e.client.name = b.client;
  e.number = jobNumber(b.client, e.date, existing);
  const home = r.hourly ? '' : `${b.sqft.toLocaleString('en-US')} sq ft, ${Math.floor(b.beds)} bed, ${Math.floor(b.full)} full / ${Math.floor(b.half)} half bath`;
  const hrs = (h: number) => `${(Math.round(h / r.crew * 10) / 10)} hrs`;
  if (r.rec && r.first) {
    const adds = r.first.add.lines.length ? `. Add-ons: ${r.first.add.lines.join(', ')}` : '';
    e.recurring = true;
    e.items = [{ name: 'First visit, Deep Clean', desc: home + adds, qty: 1, price: r.first.price }];
    e.recurringRate = `${r.rec.name}: ${money2(r.main.price)} per visit`;
    e.duration = `Approx. ${hrs(r.main.hours)} per visit, ${r.crew} cleaner${r.crew > 1 ? 's' : ''}`;
    e.deposit = Math.round(r.first.price * R.depositPct) / 100;
    e.monthly = Math.round(r.monthly);
    e.job = { hours: r.main.hours * r.rec.perMonth, labor: r.labor * r.rec.perMonth, supplies: r.supplies * r.rec.perMonth };
  } else {
    const adds = r.main.add.lines.length ? `. Add-ons: ${r.main.add.lines.join(', ')}` : '';
    e.items = [{ name: NAMES[r.firstKind], desc: r.hourly ? `${r.main.hours} cleaner-hours${adds}` : home + adds, qty: 1, price: r.main.price }];
    e.duration = `Approx. ${hrs(r.main.hours)}, ${r.crew} cleaner${r.crew > 1 ? 's' : ''}`;
    e.deposit = Math.round(r.main.price * R.depositPct) / 100;
  }
  return e;
}

const VISIT_NAME = (v: number) => v === 0.5 ? 'every 2 weeks' : Math.abs(v - 12 / 52) < 0.001 ? 'monthly' : `${v} visit(s) per week`;

export function estimateFromCommercial(b: ComBid, c: Costs, existing: Estimate[], price?: number): Estimate {
  const r0 = commercial(b, c);
  const visitPrice = price ?? r0.price;
  const r = { ...r0, price: visitPrice, monthly: visitPrice * r0.visitsMo };
  const e = blankEstimate(existing, 'commercial');
  e.perVisit = visitPrice;
  e.client.name = b.client;
  e.number = jobNumber(b.client, e.date, existing);
  e.recurring = true;
  const plan = VISIT_NAME(b.visits);
  e.items = [{ name: `Janitorial service: ${SPACE_TYPES[b.space]?.name ?? ''}`, desc: `${r.sqft.toLocaleString('en-US')} sq ft, ${b.restrooms} restroom(s), ${b.kitchens} break room(s), ${plan}. Price is per visit.`, qty: 1, price: r.price }];
  e.recurringRate = `${plan}: about ${money(r.monthly)} per month`;
  e.duration = `Approx. ${r.hours.toFixed(1)} labor hrs per visit`;
  e.deposit = Math.round(r.monthly * 100) / 100; // first month's charge
  e.taxPct = b.taxPct;
  e.monthly = Math.round(r.monthly);
  e.job = { hours: r.hoursMonth, labor: r.laborMonth, supplies: r.suppliesMonth };
  e.options = comparePlans(b, c).filter(p => p.perVisit > 0).map(({ name, perVisit, monthly }) => ({ name, perVisit, monthly }));
  const rooms = b.rooms.filter(x => x.sqft > 0).map(x => `${x.name || 'Room'} (${x.sqft.toLocaleString('en-US')} sq ft)`);
  if (rooms.length) e.scope = 'Areas: ' + rooms.join(', ');
  const extras = b.extras.filter(x => x.name || x.price);
  if (extras.length) e.notes = 'Scheduled extras: ' + extras.map(x => `${x.name || 'Extra service'}, ${money2(x.price)}, ${x.perYear} time(s) a year`).join('; ') + '.';
  return e;
}

export function invoiceFromEstimate(e: Estimate, nextNumber: number): Invoice {
  const date = today();
  const commercialJob = e.kind === 'commercial';
  return {
    id: uid(), number: `INV-${nextNumber}`, date, dueDate: commercialJob ? addDays(date, 15) : date,
    terms: commercialJob ? 'Net 15' : e.recurring ? 'Due on completion' : 'Due on crew arrival',
    jobRef: e.number, client: { ...e.client }, items: e.items.map(i => ({ ...i })), discount: e.discount, tax: e.tax, taxPct: e.taxPct,
    credit: e.depositPaid ? e.deposit : 0, notes: '', status: 'Unpaid', paidDate: '', paidMethod: '',
  };
}

export function blankInvoice(nextNumber: number): Invoice {
  const date = today();
  return {
    id: uid(), number: `INV-${nextNumber}`, date, dueDate: date, terms: 'Due on completion', jobRef: '', client: emptyClient(),
    items: [{ name: '', desc: '', qty: 1, price: 0 }], discount: 0, tax: 0, credit: 0, notes: '', status: 'Unpaid', paidDate: '', paidMethod: '',
  };
}

// The next visit on a recurring job: same client and work, new number and date, no deposit credit.
export function repeatInvoice(i: Invoice, nextNumber: number): Invoice {
  const date = today();
  const net = parseInt(i.terms.replace('Net ', ''), 10) || 0;
  return { ...i, id: uid(), number: `INV-${nextNumber}`, date, dueDate: addDays(date, net), client: { ...i.client }, items: i.items.map(x => ({ ...x })), credit: 0, status: 'Unpaid', paidDate: '', paidMethod: '' };
}
