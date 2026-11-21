import { ADD_ONS } from '../rates';
import { CATEGORIES } from '../expenses';
import type { ResBid } from '../calc';
import { askJSON } from './client';
import type { AiConfig } from './config';

const whole = (v: unknown) => { const n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export type HomeGuess = { sqft: number; beds: number; full: number; half: number; cond: number; addOns: string[]; notes: string };
export async function readHome(c: AiConfig, images: string[], notes: string): Promise<HomeGuess> {
  const r = await askJSON(c, {
    system: 'You help a house cleaning company at a walkthrough. Judge only what the photos and notes show. Use 0 for anything you cannot tell. You never set prices.',
    prompt: `Walkthrough notes: ${notes || 'none'}\nFill in the home details. cond is the extra work for condition: 0 normal, 25 heavy, 35 heavier, 50 neglected or cluttered. When the notes give a number, use the number from the notes. addOns lists only extra services the home clearly needs, each at most once, and is empty when unsure. notes is one or two plain sentences on what stood out.`,
    images,
    schema: obj({ sqft: { type: 'integer' }, beds: { type: 'integer' }, full: { type: 'integer' }, half: { type: 'integer' }, cond: { type: 'integer', enum: [0, 25, 35, 50] }, addOns: { type: 'array', items: { type: 'string', enum: ADD_ONS.map(a => a.id) } }, notes: { type: 'string' } }),
  }) as Partial<HomeGuess>;
  const ids = ADD_ONS.map(a => a.id);
  return {
    sqft: whole(r.sqft), beds: whole(r.beds), full: whole(r.full), half: whole(r.half), cond: [25, 35, 50].includes(Number(r.cond)) ? Number(r.cond) : 0,
    addOns: Array.isArray(r.addOns) ? r.addOns.filter(x => ids.includes(x)) : [], notes: String(r.notes || '').slice(0, 400),
  };
}

// Only details the AI could judge replace what's in the form. The price still comes from the rate sheet.
export function applyHome(b: ResBid, g: HomeGuess): Partial<ResBid> {
  const flat = Object.fromEntries(g.addOns.filter(id => !ADD_ONS.find(a => a.id === id)?.qty).map(id => [id, 1]));
  return { sqft: g.sqft || b.sqft, beds: g.beds || b.beds, full: g.full || b.full, half: g.half, cond: g.cond, addOns: { ...b.addOns, ...flat } };
}

export type ReceiptGuess = { merchant: string; date: string; total: number; category: string };
export async function readReceiptAI(c: AiConfig, image: string): Promise<ReceiptGuess> {
  const r = await askJSON(c, {
    system: 'You read store receipts for a cleaning business. Copy only what is printed. Use an empty string or 0 for anything unreadable.',
    prompt: 'Read this receipt. merchant is the store name printed at the top. date is the purchase date printed on the receipt, written as YYYY-MM-DD. total is the final amount paid. category is what was bought: cleaning products, chemicals, cloths, mops, gloves and trash liners are Supplies; machines and tools are Equipment & tools; gas is Fuel; car repairs and parts are Vehicle; food and drinks are Meals; use Other when unsure.',
    images: [image], detail: 'high',
    schema: obj({ merchant: { type: 'string' }, date: { type: 'string', format: 'date' }, total: { type: 'number' }, category: { type: 'string', enum: CATEGORIES } }),
  }) as Partial<ReceiptGuess>;
  return { merchant: String(r.merchant || '').slice(0, 60), date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? String(r.date) : '', total: Math.max(0, Number(r.total) || 0), category: CATEGORIES.includes(String(r.category)) ? String(r.category) : 'Other' };
}

export async function writeScope(c: AiConfig, notes: string, service: string): Promise<string> {
  const r = await askJSON(c, {
    system: 'You write short, plain scope descriptions for a cleaning estimate. Include only work the notes mention. Never add prices, promises or legal terms.',
    prompt: `Service: ${service || 'cleaning'}\nNotes: ${notes}\nWrite the description of work in under 60 words. Leave out anything the notes say is not included.`,
    schema: obj({ description: { type: 'string' } }),
  }) as { description?: string };
  return String(r.description || '').slice(0, 600);
}
