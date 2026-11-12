import { describe, expect, it } from 'vitest';
import { schemaToGrammar } from './grammar';

const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

describe('schemaToGrammar', () => {
  const g = schemaToGrammar(obj({ sqft: { type: 'integer' }, cond: { type: 'integer', enum: [0, 25] }, addOns: { type: 'array', maxItems: 3, items: { type: 'string', enum: ['oven', 'fridge'] } }, total: { type: 'number' }, ok: { type: 'boolean' }, notes: { type: 'string' } }));
  const rules = Object.fromEntries(g.split('\n').map(l => { const i = l.indexOf(' ::= '); return [l.slice(0, i), l.slice(i + 5)]; }));

  it('defines every rule it refers to', () => {
    const used = new Set(Object.values(rules).flatMap(b => b.replace(/"(?:[^"\\]|\\.)*"/g, '').replace(/\[[^\]]*\]/g, '').match(/[a-zA-Z][a-zA-Z0-9-]*/g) || []));
    for (const name of used) expect(rules, name).toHaveProperty(name);
  });
  it('keeps the keys in the schema order', () => {
    const root = rules[rules.root];
    const order = ['sqft', 'cond', 'addOns', 'total', 'ok', 'notes'].map(k => root.indexOf(`\\"${k}\\"`));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('only lets a date be YYYY-MM-DD or empty', () => {
    const d = schemaToGrammar(obj({ date: { type: 'string', format: 'date' } }));
    expect(d).toContain('[12] [0-9]{3} "-" [01] [0-9] "-" [0-3] [0-9]');
    expect(d).toContain('"\\"\\"" |');
  });
  it('limits lists and fixed choices', () => {
    expect(g).toContain('{0,2})?');                 // at most 3 add-ons
    expect(g).toContain('"0" | "25"');              // only the allowed conditions
    expect(g).toContain('"\\"oven\\"" | "\\"fridge\\""');
  });
});
