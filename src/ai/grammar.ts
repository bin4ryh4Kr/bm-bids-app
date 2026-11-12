// Turns one of this app's small JSON schemas into a llama.cpp grammar (GBNF). With a grammar the on-phone model
// cannot write anything except valid JSON in exactly the asked shape, which matters a lot for small models.
// Covers what src/ai/tasks.ts uses: objects, strings, integers, numbers, booleans, fixed choices and short lists.
type Schema = { type?: string; format?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; maxItems?: number; maxLength?: number };

const lit = (v: unknown) => JSON.stringify(JSON.stringify(v)); // a JSON value, quoted as a grammar literal

export function schemaToGrammar(schema: object): string {
  const rules = new Map<string, string>();
  const add = (name: string, body: string) => { rules.set(name, body); return name; };
  let n = 0;

  const rule = (s: Schema, hint: string): string => {
    if (s.enum) return add(`${hint}-${n++}`, s.enum.map(lit).join(' | '));
    switch (s.type) {
      case 'object': {
        const keys = Object.keys(s.properties || {});
        const parts = keys.map((k, i) => `${i ? '"," ws ' : ''}${lit(k)} ws ":" ws ${rule(s.properties![k], k.replace(/[^a-zA-Z0-9]/g, '') || 'v')}`);
        return add(`${hint}-${n++}`, `"{" ws ${parts.join(' ws ')} ws "}"`);
      }
      case 'array': {
        const item = rule(s.items || { type: 'string' }, `${hint}-item`);
        const max = Math.max(1, s.maxItems ?? 6);
        return add(`${hint}-${n++}`, `"[" ws (${item} ("," ws ${item}){0,${max - 1}})? ws "]"`);
      }
      case 'integer': return 'integer';
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      default: {
        // A date is YYYY-MM-DD or empty (unreadable); nothing else can be written.
        if (s.format === 'date') return add(`${hint}-${n++}`, '"\\"\\"" | "\\"" [12] [0-9]{3} "-" [01] [0-9] "-" [0-3] [0-9] "\\""');
        const max = s.maxLength ?? 600;
        return add(`${hint}-${n++}`, `"\\"" char{0,${max}} "\\""`);
      }
    }
  };

  const root = rule(schema as Schema, 'root');
  const out = [`root ::= ${root}`];
  for (const [name, body] of rules) out.push(`${name} ::= ${body}`);
  out.push(
    'ws ::= [ \\t\\n]{0,4}',
    'integer ::= "-"? ("0" | [1-9] [0-9]{0,8})',
    'number ::= integer ("." [0-9]{1,4})?',
    'boolean ::= "true" | "false"',
    'char ::= [^"\\\\\\x7F\\x00-\\x1F] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F]{4})',
  );
  return out.join('\n');
}
