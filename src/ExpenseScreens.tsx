import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { AiReceipt } from './ai/gate';
import { money2, niceDate } from './docs';
import { blankReceipt, blankTrip, CATEGORIES, csvCell, deletePhoto, inPeriod, loadPhoto, periodName, periods, readReceipt, savePhoto, tracker, type Receipt, type Trip } from './expenses';
import { milesPDF, receiptsPDF } from './pdf';
import { shareFile } from './share';
import type { DB } from './store';

type Set = (fn: (d: DB) => DB) => void;
type P = { db: DB; set: Set; toast: (s: string) => void; ask: (t: string, f: () => void) => void; Text: (p: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string; placeholder?: string }) => ReactNode; Num: (p: { label: string; value: number; onChange: (v: number) => void; wide?: boolean; hint?: string }) => ReactNode };

const shrinkPhoto = (f: File) => new Promise<string>((ok, no) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    ok(cv.toDataURL('image/jpeg', 0.8));
  };
  img.onerror = no;
  img.src = URL.createObjectURL(f);
});

const Period = ({ value, list, onChange }: { value: string; list: string[]; onChange: (v: string) => void }) =>
  <label className="f" style={{ marginBottom: 10 }}>Show<select value={value} onChange={e => onChange(e.target.value)}>{list.map(p => <option key={p} value={p}>{periodName(p)}</option>)}</select></label>;

function ReceiptEdit({ r0, reading, p, back }: { r0: Receipt; reading: boolean; p: P; back: () => void }) {
  const { db, set, ask, Text, Num } = p;
  const [r, setR] = useState(r0);
  const [photo, setPhoto] = useState('');
  useEffect(() => { if (r0.photo) loadPhoto(r0.id).then(setPhoto).catch(() => {}); }, [r0.id]);
  useEffect(() => { setR(x => ({ ...x, merchant: x.merchant || r0.merchant, date: r0.date, total: x.total || r0.total })); }, [r0.merchant, r0.total, r0.date]);
  useEffect(() => { set(d => ({ ...d, receipts: d.receipts.map(x => x.id === r.id ? r : x) })); }, [r]);
  const up = (o: Partial<Receipt>) => setR(x => ({ ...x, ...o }));
  return <>
    <button className="back" onClick={back}>‹ Receipts</button>
    {photo && <img src={photo} alt="Receipt" style={{ width: '100%', maxHeight: 340, objectFit: 'contain', borderRadius: 12, marginBottom: 12, background: 'var(--surface)' }} />}
    <section className="panel"><h2>Receipt</h2>{reading && <div className="note">Reading the receipt on your phone. This can take a little while.</div>}
      <div className="fields">
        <Text wide label="Store" value={r.merchant} onChange={v => up({ merchant: v })} />
        <Text label="Date" type="date" value={r.date} onChange={v => { if (v) up({ date: v }); }} /><Num label="Total ($)" value={r.total} onChange={v => up({ total: v })} />
        <label className="f wide">Category<select value={r.category} onChange={e => up({ category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="f wide">Notes<textarea value={r.notes} onChange={e => up({ notes: e.target.value })} /></label>
      </div><p className="hint">Check these against the receipt. Scanning can misread numbers.</p>
      {AiReceipt && <Suspense fallback={null}><AiReceipt r={r} apply={up} /></Suspense>}</section>
    <div className="acts"><button className="b x" onClick={() => ask('Delete this receipt?', () => { back(); deletePhoto(r.id); set(d => ({ ...d, receipts: d.receipts.filter(x => x.id !== r.id) })); })}>Delete</button></div></>;
}

export function Receipts(p: P & { editing: string; setEditing: (id: string) => void }) {
  const { db, set, toast, editing, setEditing } = p;
  const [reading, setReading] = useState(false);
  const [period, setPeriod] = useState(() => periods([])[0]);
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  const scan = async () => {
    if (!Capacitor.isNativePlatform()) return cam.current?.click();
    try {
      const shot = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.DataUrl, quality: 80, width: 1600, correctOrientation: true });
      if (shot.dataUrl) await add(shot.dataUrl);
    } catch (e) { if (!/cancel/i.test(String(e))) toast('Could not open the camera.'); }
  };
  const add = async (f?: File | string) => {
    if (!f) return;
    try {
      const data = typeof f === 'string' ? f : await shrinkPhoto(f);
      const r = { ...blankReceipt(), photo: true };
      await savePhoto(r.id, data);
      set(d => ({ ...d, receipts: [r, ...d.receipts] }));
      setEditing(r.id); setReading(true);
      try {
        const got = await readReceipt(data);
        if (!got.merchant && !got.total) toast('Could not find any text. Type the details in.');
        set(d => ({ ...d, receipts: d.receipts.map(x => x.id === r.id ? { ...x, merchant: x.merchant || got.merchant, date: got.date || x.date, total: x.total || got.total } : x) }));
      } catch { toast('Could not read it. Type the details in.'); }
      setReading(false);
    } catch { toast('Could not save that photo.'); setReading(false); }
  };
  const cur = db.receipts.find(r => r.id === editing);
  if (cur) return <ReceiptEdit r0={cur} reading={reading} p={p} back={() => setEditing('')} />;
  const list = db.receipts.filter(r => inPeriod(r.date, period)).sort((a, b) => b.date.localeCompare(a.date));
  const sum = list.reduce((s, r) => s + r.total, 0);
  const csv = () => 'Date,Store,Category,Total,Notes\n' + list.map(r => [r.date, r.merchant, r.category, r.total.toFixed(2), r.notes].map(csvCell).join(',')).join('\n');
  return <>
    <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}>
      <button className="b" onClick={scan}>Scan receipt</button>
      <button className="b g" onClick={() => gal.current?.click()}>From photos</button>
      <button className="b g" onClick={() => { const r = blankReceipt(); set(d => ({ ...d, receipts: [r, ...d.receipts] })); setEditing(r.id); }}>Type it in</button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; add(f); }} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; add(f); }} />
    </div>
    <Period value={period} list={periods(db.receipts.map(r => r.date))} onChange={setPeriod} />
    <div className="price"><div className="lbl">BUSINESS EXPENSES</div><div className="big">{money2(sum)}</div><div className="row"><span>{list.length} receipt{list.length === 1 ? '' : 's'}</span></div></div>
    {list.length === 0 ? <div className="empty">No receipts here yet. Scan one and it's saved with the photo.</div> : <>
      {list.map(r => <button className="card" key={r.id} onClick={() => setEditing(r.id)}><div className="l1"><span>{r.merchant || 'No store yet'}</span><span>{money2(r.total)}</span></div><div className="l2"><span>{niceDate(r.date)}</span><span className="pill plain">{r.category}</span></div></button>)}
      <div className="acts">
        <button className="b" onClick={() => shareFile(`Expenses ${period}.pdf`, 'Expense report', receiptsPDF(list, periodName(period), db.company), 'pdf').catch(() => toast('Could not share.'))}>Share report</button>
        <button className="b g" onClick={() => shareFile(`Expenses ${period}.csv`, 'Expenses', csv(), 'json').catch(() => toast('Could not share.'))}>Spreadsheet</button>
      </div></>}
  </>;
}

function TripEdit({ t0, p, back }: { t0: Trip; p: P; back: () => void }) {
  const { set, ask, Text, Num } = p;
  const [t, setT] = useState(t0);
  useEffect(() => { set(d => ({ ...d, trips: d.trips.map(x => x.id === t.id ? t : x) })); }, [t]);
  const up = (o: Partial<Trip>) => setT(x => ({ ...x, ...o }));
  return <>
    <button className="back" onClick={back}>‹ Miles</button>
    <section className="panel"><h2>Trip</h2><div className="fields">
      <Text label="Date" type="date" value={t.date} onChange={v => { if (v) up({ date: v }); }} /><Num label="Miles" value={t.miles} onChange={v => up({ miles: v })} />
      <Text label="From" value={t.from} onChange={v => up({ from: v })} /><Text label="To" value={t.to} onChange={v => up({ to: v })} />
      <Text wide label="Business purpose" placeholder="Walkthrough at Smith home" value={t.purpose} onChange={v => up({ purpose: v })} />
      <Num wide label="Rate per mile ($)" value={t.rate} onChange={v => up({ rate: v })} />
    </div><div className="sum t" style={{ marginTop: 10 }}><span>Mileage value</span><span>{money2(t.miles * t.rate)}</span></div></section>
    <div className="acts"><button className="b x" onClick={() => ask('Delete this trip?', () => { back(); set(d => ({ ...d, trips: d.trips.filter(x => x.id !== t.id) })); })}>Delete</button></div></>;
}

export function Miles(p: P & { editing: string; setEditing: (id: string) => void }) {
  const { db, set, toast, editing, setEditing } = p;
  const [, tick] = useState(0);
  const [period, setPeriod] = useState(() => periods([])[0]);
  useEffect(() => { tracker.onChange = () => tick(n => n + 1); return () => { tracker.onChange = () => {}; }; }, []);
  const cur = db.trips.find(t => t.id === editing);
  if (cur) return <TripEdit t0={cur} p={p} back={() => setEditing('')} />;
  const list = db.trips.filter(t => inPeriod(t.date, period)).sort((a, b) => b.date.localeCompare(a.date));
  const miles = list.reduce((s, t) => s + t.miles, 0), value = list.reduce((s, t) => s + t.miles * t.rate, 0);
  const csv = () => 'Date,From,To,Business purpose,Miles,Rate,Value\n' + list.map(t => [t.date, t.from, t.to, t.purpose, t.miles, t.rate, (t.miles * t.rate).toFixed(2)].map(csvCell).join(',')).join('\n');
  const newTrip = (m: number) => { const t = { ...blankTrip(db.mileRate), miles: m }; set(d => ({ ...d, trips: [t, ...d.trips] })); setEditing(t.id); };
  return <>
    <section className="panel" style={{ textAlign: 'center' }}>
      {tracker.active ? <>
        <div className="hint">{tracker.problem ? `GPS problem: ${tracker.problem}` : tracker.fixes ? `GPS working (${tracker.fixes}). Keep this app open.` : 'Waiting for GPS. Keep this app open.'}</div>
        <div style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--deep)' }}>{tracker.miles.toFixed(1)} mi</div>
        <button className="b" style={{ width: '100%' }} onClick={async () => newTrip(await tracker.stop())}>End trip</button></>
        : <div className="acts" style={{ marginTop: 0 }}>
          <button className="b" onClick={() => tracker.start().catch(() => toast('Location is off. Turn it on, or add the trip by hand.'))}>Start trip</button>
          <button className="b g" onClick={() => newTrip(0)}>Add by hand</button></div>}
    </section>
    <Period value={period} list={periods(db.trips.map(t => t.date))} onChange={setPeriod} />
    <div className="price"><div className="lbl">BUSINESS MILES</div><div className="big">{miles.toFixed(1)}</div><div className="row"><span>At your rates <b>{money2(value)}</b></span></div></div>
    {list.length === 0 ? <div className="empty">No trips here yet.</div> : <>
      {list.map(t => <button className="card" key={t.id} onClick={() => setEditing(t.id)}><div className="l1"><span>{t.purpose || [t.from, t.to].filter(Boolean).join(' to ') || 'Add a purpose'}</span><span>{t.miles.toFixed(1)} mi</span></div><div className="l2"><span>{niceDate(t.date)}</span><span>{money2(t.miles * t.rate)}</span></div></button>)}
      <div className="acts">
        <button className="b" onClick={() => shareFile(`Mileage ${period}.pdf`, 'Mileage log', milesPDF(list, periodName(period), db.company), 'pdf').catch(() => toast('Could not share.'))}>Share report</button>
        <button className="b g" onClick={() => shareFile(`Mileage ${period}.csv`, 'Mileage', csv(), 'json').catch(() => toast('Could not share.'))}>Spreadsheet</button>
      </div></>}
  </>;
}
