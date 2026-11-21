import type { AiConfig } from './config';

// detail 'high' keeps photos large enough to read small print (receipts); the default suits rooms and is faster on a phone.
export type Ask = { system: string; prompt: string; images?: string[]; schema: Record<string, unknown>; detail?: 'high' };

export function extractJSON(text: string): unknown {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The AI did not send back usable data. Try again.');
  try { return JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('The AI did not send back usable data. Try again.'); }
}

// Everything is answered by the model on this phone. Nothing is sent anywhere.
export async function askJSON(_c: AiConfig, a: Ask): Promise<unknown> {
  return (await import('./device')).askDevice(a);
}
