import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

// Kept apart from the app's data so a backup can't carry a lock onto another phone, or remove one.
export type LockCfg = { asked: boolean; salt: string; hash: string; bio: boolean; grace: number; fails: number; until: number };
const KEY = 'bm-bids-lock-v1';
const blank = (): LockCfg => ({ asked: false, salt: '', hash: '', bio: false, grace: 60, fails: 0, until: 0 });

export async function loadLock(): Promise<LockCfg> {
  const { value } = await Preferences.get({ key: KEY });
  try { return { ...blank(), ...(value ? JSON.parse(value) : {}) }; } catch { return blank(); }
}
export const saveLock = (c: LockCfg) => Preferences.set({ key: KEY, value: JSON.stringify(c) });

const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));

async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: 150000 }, key, 256));
}

export async function setPin(c: LockCfg, pin: string): Promise<LockCfg> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const n = { ...c, asked: true, salt, hash: await hashPin(pin, salt), fails: 0, until: 0 };
  await saveLock(n);
  return n;
}

// Wrong PINs slow down after 5 tries: 30 seconds, then doubling.
export async function checkPin(c: LockCfg, pin: string): Promise<{ ok: boolean; cfg: LockCfg }> {
  const ok = (await hashPin(pin, c.salt)) === c.hash;
  const fails = ok ? 0 : c.fails + 1;
  const n = { ...c, fails, until: fails >= 5 ? Date.now() + 30000 * 2 ** Math.min(fails - 5, 6) : 0 };
  await saveLock(n);
  return { ok, cfg: n };
}

export async function bioAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try { return (await BiometricAuth.checkBiometry()).isAvailable; } catch { return false; }
}
export async function bioUnlock() {
  try { await BiometricAuth.authenticate({ reason: 'Unlock B&M Bids', cancelTitle: 'Use PIN', androidTitle: 'Unlock B&M Bids', allowDeviceCredential: false }); return true; } catch { return false; }
}

export async function eraseEverything() {
  await Filesystem.rmdir({ path: 'receipts', directory: Directory.Data, recursive: true }).catch(() => {});
  await Preferences.clear();
  location.reload();
}
