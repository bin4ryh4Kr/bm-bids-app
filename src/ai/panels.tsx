import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { ResBid } from '../calc';
import { loadPhoto, type Receipt } from '../expenses';
import { ADD_ONS } from '../rates';
import { askJSON } from './client';
import { defaults, loadAi, ready, saveAi, type AiConfig } from './config';
import { clearDiagnostics, DEVICE_OK, diagnostics, gb, install, installed, isDownloading, MODEL, modelBytes, remove, stage } from './device';
import { shareText } from '../share';
import { applyHome, readHome, readReceiptAI, writeScope, type HomeGuess } from './tasks';

const useAi = () => {
  const [c, setC] = useState<AiConfig | null>(null);
  useEffect(() => { loadAi().then(setC).catch(() => setC(defaults())); }, []);
  return c;
};
const NAME = 'on-phone AI';
const say = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.';
const Off = ({ setup }: { setup?: () => void }) => <div className="ai-off"><p className="hint">AI can fill this in from photos and notes. Set it up once in Settings.</p>{setup && <button className="b g" onClick={setup}>Set up AI</button>}</div>;
const MAX_PHOTOS = 4;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// Seconds since `on` became true, so a long on-phone answer shows it is still working.
const useElapsed = (on: boolean) => {
  const [s, setS] = useState(0);
  useEffect(() => { if (!on) return; setS(0); const t = setInterval(() => setS(x => x + 1), 1000); return () => clearInterval(t); }, [on]);
  return s;
};
const Working = ({ secs, photos }: { c?: AiConfig; secs: number; photos?: boolean }) => <div className="ai-busy" role="status"><span className="spin" /><span>{`${stage() || 'Working on this phone'}... ${clock(secs)}`}<span className="hint"> {photos ? 'Photos can take a few minutes on the phone.' : 'The first answer also loads the model.'} Keep the app open.</span></span></div>;

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
    <div className="ai-model"><span>{MODEL.label} <span className="hint">({gb(modelBytes)})</span></span><span className={`pill ${have ? 'good' : done !== null ? 'warn' : 'plain'}`}>{have ? 'Ready' : done !== null ? 'Downloading' : 'Not downloaded'}</span></div>
    {have ? <p className="hint">Reads photos and notes on this phone without sending them anywhere.</p>
      : <p className="hint">Download the AI model once on Wi-Fi. After that it works with no internet, no account and no cost. It needs {gb(modelBytes + 0.5e9)} of free storage and a recent phone with 8 GB of memory (RAM). Answers take longer than online AI.</p>}
    {done !== null && <><progress className="ai-bar" value={done} max={1} /><p className="hint">{Math.round(done * 100)}% of {gb(modelBytes)}. Keep the app open until it finishes.</p></>}
    {err && <div className="note bad">{err}</div>}
    <div className="acts">
      {!have && done === null && <button className="b" onClick={start}>Download AI model</button>}
      {have && <button className="b g" onClick={async () => { await remove(); up({ deviceModel: '' }); toast('AI model removed.'); }}>Remove model</button>}
      {have && <button className="b g" onClick={async () => { try { toast(await shareText('B&M Bids AI log', diagnostics())); } catch { toast('Could not share the log.'); } }}>Share AI log</button>}
    </div>
    {have && <p className="hint">The AI log holds timings and errors only, never your photos or notes. Share it if the AI is slow or stops. <button className="linkb" style={{ minHeight: 0, padding: 0, margin: 0 }} onClick={() => { clearDiagnostics(); toast('AI log cleared.'); }}>Clear log</button></p>}
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

export function AiBid({ b, apply, setup }: { b: ResBid; apply: (o: Partial<ResBid>) => void; setup?: () => void }) {
  const c = useAi();
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState<HomeGuess | null>(null);
  const [err, setErr] = useState('');
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  const secs = useElapsed(busy);
  if (!c) return null;
  const full = photos.length >= MAX_PHOTOS;
  const addPhotos = (more: string[]) => { setErr(''); setPhotos(p => [...p, ...more].slice(0, MAX_PHOTOS)); };
  const fromFiles = async (list: FileList | null) => {
    const fs = [...(list || [])].slice(0, MAX_PHOTOS - photos.length);
    try { addPhotos(await Promise.all(fs.map(shrink))); } catch { setErr('Could not read those photos.'); }
  };
  const take = async () => {
    if (!Capacitor.isNativePlatform()) return cam.current?.click();
    try {
      const shot = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.DataUrl, quality: 80, width: 1280, correctOrientation: true });
      if (shot.dataUrl) addPhotos([shot.dataUrl]);
    } catch (e) { if (!/cancel/i.test(String(e))) setErr('Could not open the camera.'); }
  };
  const ask = async () => { setBusy(true); setErr(''); setGuess(null); try { setGuess(await readHome(c, photos, notes)); } catch (e) { setErr(say(e)); } setBusy(false); };
  return <section className="panel ai"><div className="ai-head"><h2>AI walkthrough</h2>{ready(c) && <span className="pill plain">On this phone</span>}</div>
    {!ready(c) ? <Off setup={setup} /> : <>
      <p className="hint">Take or add up to {MAX_PHOTOS} photos, add a few notes, and AI fills in the home details. Your price still comes from your rate sheet.</p>
      {photos.length > 0 && <div className="thumbs">{photos.map((src, i) => <div className="thumb" key={i}><img src={src} alt={`Photo ${i + 1}`} /><button aria-label={`Remove photo ${i + 1}`} disabled={busy} onClick={() => setPhotos(p => p.filter((_, n) => n !== i))}>×</button></div>)}</div>}
      <div className="acts">
        <button className="b g" disabled={busy || full} onClick={take}>Take photo</button>
        <button className="b g" disabled={busy || full} onClick={() => gal.current?.click()}>Add from photos</button>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { const l = e.target.files; fromFiles(l).finally(() => { e.target.value = ''; }); }} />
        <input ref={gal} type="file" accept="image/*" multiple hidden onChange={e => { const l = e.target.files; fromFiles(l).finally(() => { e.target.value = ''; }); }} />
      </div>
      <p className="hint ai-count">{photos.length ? `${photos.length} of ${MAX_PHOTOS} photos added${full ? '. Remove one to add another.' : ''}` : 'No photos yet. Notes alone work too.'}</p>
      <label className="f">Notes<textarea value={notes} placeholder="3 bed 2 bath, about 1,600 sq ft, two dogs, tenant moving out" onChange={e => setNotes(e.target.value)} /></label>
      <div className="acts"><button className="b" disabled={busy || (!photos.length && !notes.trim())} onClick={ask}>{busy ? 'Working...' : 'Fill in the home details'}</button></div>
      {busy && <Working c={c} secs={secs} photos={photos.length > 0} />}
      {err && <div className="note bad">{err}</div>}
      {guess && <div className="ai-result"><div className="ai-result-h">AI suggests</div>
        <div className="stats">
          <div className="stat"><div className="k">Home size</div><div className="v">{guess.sqft ? `${guess.sqft.toLocaleString('en-US')} sq ft` : 'Not sure'}</div></div>
          <div className="stat"><div className="k">Bedrooms</div><div className="v">{guess.beds || 'Not sure'}</div></div>
          <div className="stat"><div className="k">Baths</div><div className="v">{guess.full || guess.half ? `${guess.full} full, ${guess.half} half` : 'Not sure'}</div></div>
          <div className="stat"><div className="k">Condition</div><div className="v">{guess.cond ? `+${guess.cond}% work` : 'Normal'}</div></div>
        </div>
        {guess.addOns.length > 0 && <p className="ai-addons">Add-ons: {guess.addOns.map(id => <span className="pill plain" key={id}>{ADD_ONS.find(a => a.id === id)?.name}</span>)}</p>}
        {guess.notes && <p className="ai-notes">{guess.notes}</p>}
        <p className="hint">Check these before you use them. Anything marked Not sure keeps what is already in the form.</p>
        <div className="acts"><button className="b" onClick={() => { apply(applyHome(b, guess)); setGuess(null); }}>Use these details</button><button className="b g" onClick={() => setGuess(null)}>Ignore</button></div></div>}
    </>}</section>;
}

export function AiReceipt({ r, apply }: { r: Receipt; apply: (o: Partial<Receipt>) => void }) {
  const c = useAi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const secs = useElapsed(busy);
  if (!c || !r.photo) return null;
  if (!ready(c)) return <Off />;
  return <div className="acts ai"><button className="b g" disabled={busy} onClick={async () => {
    setBusy(true); setErr('');
    try { const g = await readReceiptAI(c, await loadPhoto(r.id)); apply({ merchant: g.merchant || r.merchant, date: g.date || r.date, total: g.total || r.total, category: g.category }); }
    catch (e) { setErr(say(e)); }
    setBusy(false);
  }}>{busy ? 'Reading...' : `Read with ${NAME}`}</button>{busy && <Working c={c} secs={secs} photos />}{err && <div className="note bad wide">{err}</div>}</div>;
}

export function AiEstimate({ service, use }: { service: string; use: (text: string) => void }) {
  const c = useAi();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const secs = useElapsed(busy);
  if (!c || !ready(c)) return null;
  return <div style={{ marginTop: 10 }}><label className="f">Describe the job and AI writes the first line's description<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <div className="acts"><button className="b g" disabled={busy || !notes.trim()} onClick={async () => { setBusy(true); setErr(''); try { use(await writeScope(c, notes, service)); setNotes(''); } catch (e) { setErr(say(e)); } setBusy(false); }}>{busy ? 'Writing...' : `Write with ${NAME}`}</button></div>{busy && <Working c={c} secs={secs} />}{err && <div className="note bad">{err}</div>}</div>;
}
