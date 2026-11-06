import { useRef, useState } from 'react';

export const n = (s: string) => { const v = parseFloat(s); return isFinite(v) && v > 0 ? v : 0; };

export function Num({ label, value, onChange, hint, step, wide }: { label: string; value: number; onChange: (v: number) => void; hint?: string; step?: number; wide?: boolean }) {
  const [text, setText] = useState(value ? String(value) : '');
  const last = useRef(value);
  if (value !== last.current) { last.current = value; if (n(text) !== value) setText(value ? String(value) : ''); }
  return <label className={'f' + (wide ? ' wide' : '')}>{label}
    <input inputMode="decimal" type="number" step={step ?? 'any'} min={0} value={text} onChange={e => { setText(e.target.value); last.current = n(e.target.value); onChange(n(e.target.value)); }} />
    {hint && <span className="hint">{hint}</span>}</label>;
}
export const Text = ({ label, value, onChange, wide, type, placeholder }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string; placeholder?: string }) =>
  <label className={'f' + (wide ? ' wide' : '')}>{label}<input type={type ?? 'text'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></label>;
export const Check = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) =>
  <label className="check wide"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />{label}</label>;
