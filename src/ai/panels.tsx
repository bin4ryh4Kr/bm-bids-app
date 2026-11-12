import { useEffect, useRef, useState } from 'react';
import type { ResBid } from '../calc';
import { loadPhoto, type Receipt } from '../expenses';
import { ADD_ONS } from '../rates';
import { askJSON } from './client';
import { defaults, loadAi, ready, saveAi, type AiConfig } from './config';
import { DEVICE_OK, gb, install, installed, isDownloading, MODEL, modelBytes, remove } from './device';
import { applyHome, readHome, readReceiptAI, writeScope, type HomeGuess } from './tasks';

const useAi = () => {
  const [c, setC] = useState<AiConfig | null>(null);
  useEffect(() => { loadAi().then(setC).catch(() => setC(defaults())); }, []);
  return c;
};
const NAME = 'on-phone AI';
const say = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.';
const Off = () => <p className="hint">Set up AI in Settings first.</p>;

const shrink = (f: File) => new Promise<string>((ok, no) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    ok(cv.toDataURL('image/jpeg', 0.75));
  };
  img.onerror = no;
  img.src = URL.createObjectURL(f);
});

// The on-phone model: one download, then everything runs on this phone with no account, key or bill.
function DeviceModelCard({ c, up, toast }: { c: AiConfig; up: (o: Partial<AiConfig>) => void; toast: (s: string) => void }) {
  const [done, setDone] = useState<number | null>(isDownloading() ? 0 : null);
  const [err, setErr] = useState('');
  // The saved setting can be stale (files cleared by the system, or a newer model in an update), so check the files.
  useEffect(() => { installed().then(ok => { if (ok !== (c.deviceModel === MODEL.id)) up({ deviceModel: ok ? MODEL.id : '' }); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!DEVICE_OK) return <p className="hint wide">On-phone AI works in the phone app. This screen is not running on a phone.</p>;
  const have = c.deviceModel === MODEL.id;
  const start = async () => {
    setErr(''); setDone(0);
    try { await install(setDone); up({ deviceModel: MODEL.id }); toast('AI model is ready.'); }
    catch (e) { setErr(say(e)); }
    setDone(null);
  };
  return <div className="wide">
    {have ? <p className="hint">Model on this phone: {MODEL.label} ({gb(modelBytes)}). It reads photos and notes without sending them anywhere.</p>
      : <p className="hint">Download the AI model once ({gb(modelBytes)}; use Wi-Fi). After that it works with no internet, no account and no cost. It needs {gb(modelBytes + 0.5e9)} of free storage and a recent phone with 8 GB of memory (RAM). Answers take longer than online AI.</p>}
    {done !== null && <><progress value={done} max={1} style={{ width: '100%' }} /><p className="hint">Downloading: {Math.round(done * 100)}% of {gb(modelBytes)}. Keep the app open.</p></>}
    {err && <div className="note">{err}</div>}
    <div className="acts">
      {!have && done === null && <button className="b" onClick={start}>Download AI model</button>}
      {have && <button className="b g" onClick={async () => { await remove(); up({ deviceModel: '' }); toast('AI model removed.'); }}>Remove model ({gb(modelBytes)})</button>}
    </div>
  </div>;
}

export function AiSettings({ toast }: { toast: (s: string) => void }) {
  const [c, setC] = useState<AiConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadAi().then(setC).catch(() => setC(defaults())); }, []);
  if (!c) return null;
  const up = (o: Partial<AiConfig>) => { const n = { ...c, ...o }; setC(n); saveAi(n).catch(() => toast('Could not save.')); };
  return <section className="panel"><h2>AI on this phone</h2><div className="fields">
    <DeviceModelCard c={c} up={up} toast={toast} />
  </div>
    <p className="hint">Photos and notes never leave this phone. AI only suggests details; your prices always come from your own rate sheet.</p>
    <div className="acts"><button className="b g" disabled={busy || !ready(c)} onClick={async () => {
      setBusy(true);
      try { await askJSON(c, { system: 'Answer with JSON.', prompt: 'Set ok to true.', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } }); toast('On-phone AI is working.'); }
      catch (e) { toast(say(e)); }
      setBusy(false);
    }}>{busy ? 'Testing...' : 'Test the AI'}</button></div></section>;
}

export function AiBid({ b, apply }: { b: ResBid; apply: (o: Partial<ResBid>) => void }) {
  const c = useAi();
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState<HomeGuess | null>(null);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  if (!c) return null;
  return <section className="panel"><h2>AI walkthrough</h2>
    {!ready(c) ? <Off /> : <>
      <p className="hint">Add up to 4 photos or notes. AI fills in the home details, and your price still comes from your rate sheet.</p>
      <label className="f">Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <div className="acts">
        <button className="b g" onClick={() => file.current?.click()}>{photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added` : 'Add photos'}</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={async e => { const fs = [...(e.target.files || [])].slice(0, 4); e.target.value = ''; try { setPhotos(await Promise.all(fs.map(shrink))); } catch { setErr('Could not read those photos.'); } }} />
        <button className="b" disabled={busy || (!photos.length && !notes.trim())} onClick={async () => { setBusy(true); setErr(''); setGuess(null); try { setGuess(await readHome(c, photos, notes)); } catch (e) { setErr(say(e)); } setBusy(false); }}>{busy ? 'Working...' : `Ask ${NAME}`}</button>
      </div>
      {err && <div className="note">{err}</div>}
      {guess && <div className="note"><b>AI suggests:</b> {guess.sqft ? `${guess.sqft.toLocaleString('en-US')} sq ft, ` : ''}{guess.beds || '?'} bed, {guess.full || '?'} full / {guess.half} half bath, condition {guess.cond ? `+${guess.cond}%` : 'normal'}{guess.addOns.length ? `. Add-ons: ${guess.addOns.map(id => ADD_ONS.find(a => a.id === id)?.name).join(', ')}` : ''}. {guess.notes}
        <div className="acts"><button className="b" onClick={() => { apply(applyHome(b, guess)); setGuess(null); }}>Use these</button><button className="b g" onClick={() => setGuess(null)}>Ignore</button></div></div>}
    </>}</section>;
}

export function AiReceipt({ r, apply }: { r: Receipt; apply: (o: Partial<Receipt>) => void }) {
  const c = useAi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!c || !r.photo) return null;
  if (!ready(c)) return <Off />;
  return <div className="acts"><button className="b g" disabled={busy} onClick={async () => {
    setBusy(true); setErr('');
    try { const g = await readReceiptAI(c, await loadPhoto(r.id)); apply({ merchant: g.merchant || r.merchant, date: g.date || r.date, total: g.total || r.total, category: g.category }); }
    catch (e) { setErr(say(e)); }
    setBusy(false);
  }}>{busy ? 'Reading...' : `Read with ${NAME}`}</button>{err && <div className="note wide">{err}</div>}</div>;
}

export function AiEstimate({ service, use }: { service: string; use: (text: string) => void }) {
  const c = useAi();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!c || !ready(c)) return null;
  return <div style={{ marginTop: 10 }}><label className="f">Describe the job and AI writes the first line's description<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <div className="acts"><button className="b g" disabled={busy || !notes.trim()} onClick={async () => { setBusy(true); setErr(''); try { use(await writeScope(c, notes, service)); setNotes(''); } catch (e) { setErr(say(e)); } setBusy(false); }}>{busy ? 'Writing...' : `Write with ${NAME}`}</button></div>{err && <div className="note">{err}</div>}</div>;
}
