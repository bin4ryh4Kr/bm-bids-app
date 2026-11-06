export type Look = { mode: 'auto' | 'light' | 'dark'; accent: string };
export const DEFAULT_LOOK: Look = { mode: 'auto', accent: '#0d878a' };
export const COLORS = [
  { name: 'Teal', hex: '#0d878a' }, { name: 'Ocean', hex: '#1565c0' }, { name: 'Forest', hex: '#2e7d32' }, { name: 'Grape', hex: '#6a3fb5' },
  { name: 'Rose', hex: '#c2185b' }, { name: 'Sunset', hex: '#e8590c' }, { name: 'Gold', hex: '#f2b705' }, { name: 'Graphite', hex: '#475569' },
];

const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const hex = (c: number[]) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Moves a color toward black or white until it can be read on the background.
export function readable(color: string, bg: string, ratio = 4.5) {
  const to = lum(bg) > 0.4 ? '#000000' : '#ffffff';
  let c = color;
  for (let t = 0.05; contrast(c, bg) < ratio && t <= 1; t += 0.05) c = mix(color, to, t);
  return c;
}

const DARK_INK = '#0b1415';
export function palette(accent: string, dark: boolean) {
  const surface = dark ? '#142122' : '#ffffff', bg = dark ? '#0b1415' : '#f2f7f7';
  const on = contrast('#ffffff', accent) >= contrast(DARK_INK, accent) ? '#ffffff' : DARK_INK;
  return {
    bg, surface, ink: dark ? '#e6efef' : '#0f1a1c', muted: dark ? '#9db2b1' : '#50605f',
    line: mix(surface, accent, dark ? 0.28 : 0.2), accent, on, deep: readable(accent, surface), soft: mix(surface, accent, dark ? 0.18 : 0.12),
    price2: mix(accent, on === '#ffffff' ? '#000000' : '#ffffff', 0.25),
  };
}

export function applyLook(look: Look) {
  const dark = look.mode === 'dark' || (look.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  Object.entries(palette(look.accent, dark)).forEach(([k, v]) => root.style.setProperty('--' + k, v));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1415' : look.accent);
}
