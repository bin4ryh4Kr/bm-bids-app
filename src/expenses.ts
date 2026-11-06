import { Directory, Filesystem } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { today, uid } from './docs';

export const CATEGORIES = ['Supplies', 'Equipment & tools', 'Fuel', 'Vehicle', 'Meals', 'Insurance', 'Software', 'Marketing', 'Other'];
export type Receipt = { id: string; merchant: string; date: string; total: number; category: string; notes: string; photo: boolean };
export type Trip = { id: string; date: string; from: string; to: string; purpose: string; miles: number; rate: number };

export const blankReceipt = (): Receipt => ({ id: uid(), merchant: '', date: today(), total: 0, category: 'Supplies', notes: '', photo: false });
export const blankTrip = (rate: number): Trip => ({ id: uid(), date: today(), from: '', to: '', purpose: '', miles: 0, rate });

const AMOUNT = /\$?\s*(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})(?!\d)/g;
const amounts = (s: string) => [...s.matchAll(AMOUNT)].map(m => parseFloat(m[1].replace(/,/g, '') + '.' + m[2]));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

// Pulls the merchant, date and total out of scanned text. The person always checks the result.
export function parseReceipt(text: string): { merchant: string; date: string; total: number } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const merchant = lines.find(l => (l.match(/[A-Za-z]/g) || []).length >= 3 && !/receipt|welcome|thank/i.test(l)) || '';
  let date = '';
  const num = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
  if (num) {
    const y = num[3].length === 2 ? 2000 + +num[3] : +num[3];
    if (+num[1] >= 1 && +num[1] <= 12 && +num[2] >= 1 && +num[2] <= 31) date = `${y}-${pad(+num[1])}-${pad(+num[2])}`;
  } else {
    const word = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (word) date = `${word[3]}-${pad(MONTHS.indexOf(word[1].toLowerCase()) + 1)}-${pad(+word[2])}`;
  }
  const totals = lines.filter(l => /total|amount due|balance due/i.test(l) && !/sub\s*-?\s*total|tax|items?\b|savings/i.test(l)).flatMap(amounts);
  const total = totals.length ? totals[totals.length - 1] : Math.max(0, ...lines.flatMap(amounts));
  return { merchant: merchant.slice(0, 60), date, total };
}

export async function readReceipt(image: string) {
  const { createWorker } = await import('tesseract.js');
  const base = new URL('ocr/', document.baseURI).href;
  const dir = base.replace(/\/$/, '');
  // The language file ships unzipped: Android's build strips .gz names, so a .gz request would never be found.
  const read = async () => {
    const worker = await createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: dir, langPath: dir, gzip: false, cacheMethod: 'none', workerBlobURL: false });
    try { return parseReceipt((await worker.recognize(image)).data.text); } finally { await worker.terminate(); }
  };
  const limit = new Promise<never>((_, no) => setTimeout(() => no(new Error('Reading took too long')), 90000));
  return Promise.race([read(), limit]);
}

const photoPath = (id: string) => `receipts/${id}.jpg`;
export const savePhoto = (id: string, dataUrl: string) => Filesystem.writeFile({ path: photoPath(id), data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
export const loadPhoto = async (id: string) => 'data:image/jpeg;base64,' + (await Filesystem.readFile({ path: photoPath(id), directory: Directory.Data })).data;
export const deletePhoto = (id: string) => Filesystem.deleteFile({ path: photoPath(id), directory: Directory.Data }).catch(() => {});

export const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};

// One trip at a time, kept outside the screens so it keeps counting when you change tabs.
export const tracker = {
  watch: '' as string, miles: 0, startedAt: 0, fixes: 0, problem: '', last: null as { lat: number; lng: number } | null, onChange: (() => {}) as () => void,
  get active() { return !!this.watch; },
  async start() {
    const perm = await Geolocation.requestPermissions().catch(() => null); // the web version has no permission step
    if (perm && perm.location !== 'granted' && perm.coarseLocation !== 'granted') throw new Error('Location is off');
    this.miles = 0; this.last = null; this.startedAt = Date.now(); this.fixes = 0; this.problem = '';
    this.watch = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000, minimumUpdateInterval: 3000 }, (pos, err) => {
      if (err || !pos) { this.problem = String(err?.message || err || 'no position'); this.onChange(); return; }
      this.fixes++; this.problem = '';
      if (pos.coords.accuracy > 50) { this.onChange(); return; }
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (this.last) {
        const d = milesBetween(this.last, p);
        if (d < 0.01) { this.onChange(); return; } // ignore GPS drift while parked
        this.miles += d;
      }
      this.last = p;
      this.onChange();
    });
    this.onChange();
  },
  async stop() {
    if (this.watch) await Geolocation.clearWatch({ id: this.watch });
    this.watch = '';
    this.onChange();
    return Math.round(this.miles * 10) / 10;
  },
};

export const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
export const inPeriod = (date: string, period: string) => date.startsWith(period);
export const periods = (dates: string[]) => {
  const now = today();
  const months = [...new Set([now.slice(0, 7), ...dates.map(d => d.slice(0, 7))])].sort().reverse();
  const years = [...new Set([now.slice(0, 4), ...dates.map(d => d.slice(0, 4))])].sort().reverse();
  return [...months, ...years];
};
export const periodName = (p: string) => p.length === 4 ? `All of ${p}` : new Date(p + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
