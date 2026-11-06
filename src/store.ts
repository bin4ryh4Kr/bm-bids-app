import { Preferences } from '@capacitor/preferences';
import { DEFAULT_COM, DEFAULT_RES, type ComBid, type Costs, type ResBid } from './calc';
import { INDUSTRY_COSTS, INDUSTRY_MILE_RATE, INDUSTRY_PAY, INDUSTRY_RATES } from './industry';
import type { Estimate, Invoice } from './docs';
import type { Receipt, Trip } from './expenses';
import { emptyCompany, type Company, type Rates } from './rates';
import { DEFAULT_LOOK, type Look } from './theme';
import type { Contract, Lead, Punch, Shift, Wordings, Worker } from './tools';

export type SavedBid = { id: string; name: string; mode: 'res' | 'com'; date: string; price: number; com?: ComBid; res?: ResBid };
export type DB = { costs: Costs; com: ComBid; res: ResBid; estimates: Estimate[]; invoices: Invoice[]; nextInvoice: number; preparedBy: string; company: Company; rates: Rates; estimateTerms: string; invoiceTerms: string; receipts: Receipt[]; trips: Trip[]; mileRate: number; look: Look; leads: Lead[]; contracts: Contract[]; workers: Worker[]; shifts: Shift[]; punches: Punch[]; marketPay: number; bids: SavedBid[]; contractWording: Wordings; mySign: string; mySignName: string };
export const freshDB = (): DB => ({ costs: INDUSTRY_COSTS(), com: { ...DEFAULT_COM }, res: { ...DEFAULT_RES, addOns: {} }, estimates: [], invoices: [], nextInvoice: 1001, preparedBy: '', company: emptyCompany(), rates: INDUSTRY_RATES(), estimateTerms: '', invoiceTerms: '', receipts: [], trips: [], mileRate: INDUSTRY_MILE_RATE, look: { ...DEFAULT_LOOK }, leads: [], contracts: [], workers: [], shifts: [], punches: [], marketPay: INDUSTRY_PAY, bids: [], contractWording: {}, mySign: '', mySignName: '' });

const KEY = 'bm-bids-db-v1';
export function parseDB(text: string): DB {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.estimates) || !Array.isArray(d.invoices)) throw new Error('Not a B&M Bids backup');
  const f = freshDB();
  return { ...f, ...d, costs: { ...f.costs, ...d.costs }, com: { ...f.com, ...d.com }, res: { ...f.res, ...d.res }, company: { ...f.company, ...d.company }, rates: { ...f.rates, ...d.rates }, look: { ...f.look, ...d.look } };
}
export async function loadDB(): Promise<DB> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return freshDB();
  try { return parseDB(value); } catch { return freshDB(); }
}
export const saveDB = (db: DB) => Preferences.set({ key: KEY, value: JSON.stringify(db) });
