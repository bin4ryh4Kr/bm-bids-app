import { Preferences } from '@capacitor/preferences';

// This app has one kind of AI: a model that runs on the phone itself. No account, no key, no server, no bill.
export type Mode = 'device';
// deviceModel is the id of the on-phone model once its download has finished, '' until then.
export type AiConfig = { mode: Mode; deviceModel: string };
export const defaults = (): AiConfig => ({ mode: 'device', deviceModel: '' });

// Kept apart from the app's data so it never ends up in a backup file.
const KEY = 'bm-bids-ai-v1';
export async function loadAi(): Promise<AiConfig> {
  const { value } = await Preferences.get({ key: KEY });
  try { return { ...defaults(), deviceModel: String((value ? JSON.parse(value) : {}).deviceModel || '') }; } catch { return defaults(); }
}
export const saveAi = (c: AiConfig) => Preferences.set({ key: KEY, value: JSON.stringify(c) });
export const ready = (c: AiConfig) => !!c.deviceModel;
