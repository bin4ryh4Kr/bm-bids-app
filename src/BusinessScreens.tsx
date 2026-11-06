import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addDays, money, money2, niceDate, today, uid } from './docs';
import { csvCell } from './expenses';
import { contractPDF, timesheetPDF } from './pdf';
import { shareFile, shareText } from './share';
import { cancelLink, canSendLink, createLink, linkStatus, signPage } from './sign';
import type { DB } from './store';
import { addMonths, blankContract, contractOpening, wordingFor, blankLead, blankShift, blankWorker, capacity, clashes, DAYS, FIND_TYPES, findBusinesses, mondayOf, payGap, payroll, pipelineStats, punchesFromSchedule, punchHours, pulse, renewal, renewalNote, STAGES, type Contract, type Found, type Lead, type Punch, type Shift, type Stage, type Worker } from './tools';
import { Check, Num, Text } from './ui';

type Set = (fn: (d: DB) => DB) => void;
type P = { db: DB; set: Set; toast: (s: string) => void; ask: (t: string, f: () => void) => void; sub: string; setSub: (s: string) => void };
const Stat = ({ k, v, pill }: { k: string; v: string; pill?: ReactNode }) => <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{pill}</div>;
const Back = ({ to, go }: { to: string; go: () => void }) => <button className="back" onClick={go}>‹ {to}</button>;
const now = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const stagePill = (s: Stage) => s === 'Won' ? 'good' : s === 'Lost' ? 'bad' : s === 'Quoted' ? 'warn' : 'plain';

export type ToolTab = 'con' | 'find' | 'sch' | 'time' | 'team' | 'rec' | 'mil';
const TILES: { t: ToolTab; name: string; about: string }[] = [
  { t: 'find', name: 'Find businesses', about: 'Local leads to call' }, { t: 'con', name: 'Contracts', about: 'Sign and renew' },
  { t: 'sch', name: 'Schedule', about: 'Shifts and capacity' }, { t: 'time', name: 'Timesheets', about: 'Hours and pay' },
  { t: 'team', name: 'Team and pay', about: 'Crew and pay check' }, { t: 'rec', name: 'Receipts', about: 'Scan and sort' }, { t: 'mil', name: 'Miles', about: 'GPS mileage log' },
];

export function Tools({ db, open }: { db: DB; open: (t: ToolTab) => void }) {
  const p = pulse(db), s = pipelineStats(db.leads);
  const used = db.invoices.length || db.receipts.length || db.trips.length || db.leads.length;
  return <>
    {used ? <section className="panel"><h2>Your business right now</h2><div className="stats">
      <Stat k="Owed to you" v={money(p.owed)} pill={p.late ? <span className="pill bad">{p.late} past due</span> : undefined} />
      <Stat k="Won work per month" v={money(s.active)} />
      <Stat k="Open pipeline per month" v={money(s.open)} pill={s.due ? <span className="pill warn">{s.due} to follow up</span> : undefined} />
      <Stat k="Spent this month" v={money(p.spentMonth)} />
    </div>
      <table className="rows"><tbody><tr><td>Collected this year</td><td>{money2(p.collected)}</td></tr><tr><td>Receipts this year</td><td>{money2(p.spent)}</td></tr><tr><td>Mileage this year</td><td>{money2(p.miles)}</td></tr><tr><td>Left after those</td><td>{money2(p.left)}</td></tr></tbody></table>
      <p className="hint">A rough look from what's in this app. It doesn't include payroll or anything you haven't logged here.</p>
      {p.ending > 0 && <div className="note">{p.ending} signed contract{p.ending > 1 ? 's end' : ' ends'} in the next 60 days. Run a renewal check.</div>}</section>
      : <div className="note">Once you have leads, invoices or receipts, your numbers show up here.</div>}
    <div className="tiles">{TILES.map(x => <button key={x.t} className="tile" onClick={() => open(x.t)}><b>{x.name}</b><span>{x.about}</span></button>)}</div></>;
}

export function Pipeline({ db, set, ask, sub, setSub, price, toast }: P & { price: (l: Lead) => void }) {
  const [show, setShow] = useState<'Open' | Stage>('Open');
  const lead = db.leads.find(l => l.id === sub);
  const up = (o: Partial<Lead>) => set(d => ({ ...d, leads: d.leads.map(l => l.id === sub ? { ...l, ...o } : l) }));
  if (lead) return <>
    <Back to="Pipeline" go={() => setSub('')} />
    <section className="panel"><h2>Stage</h2><div className="chips">{STAGES.map(s => <button key={s} className={lead.stage === s ? 'on' : ''} onClick={() => up({ stage: s })}>{s}</button>)}</div>
      <div className="fields" style={{ marginTop: 10 }}><Text wide label="Follow up on" type="date" value={lead.next} onChange={v => up({ next: v })} /></div></section>
    <section className="panel"><h2>Who</h2><div className="fields">
      <Text wide label="Business or client name" value={lead.name} onChange={v => up({ name: v })} /><Text wide label="Contact person" value={lead.contact} onChange={v => up({ contact: v })} />
      <Text label="Phone" type="tel" value={lead.phone} onChange={v => up({ phone: v })} /><Text label="Email" type="email" value={lead.email} onChange={v => up({ email: v })} />
      <Text wide label="Address" value={lead.street} onChange={v => up({ street: v })} /><Text wide label="City, State, ZIP" value={lead.city} onChange={v => up({ city: v })} /><Text wide label="Website" value={lead.web} onChange={v => up({ web: v })} />
    </div>
      <div className="acts">{lead.phone && <a className="b g" href={`tel:${lead.phone}`}>Call</a>}{lead.phone && <a className="b g" href={`sms:${lead.phone}`}>Text</a>}{lead.email && <a className="b g" href={`mailto:${lead.email}`}>Email</a>}</div></section>
    <section className="panel"><h2>The job</h2><div className="fields">
      <label className="f wide">Type<select value={lead.kind} onChange={e => up({ kind: e.target.value as Lead['kind'] })}><option value="commercial">Commercial</option><option value="residential">Residential</option></select></label>
      <Num wide label="Square feet" value={lead.sqft} onChange={v => up({ sqft: v })} /><Num label="Revenue per month ($)" value={lead.monthly} onChange={v => up({ monthly: v })} /><Num label="Cost per month ($)" value={lead.cost} onChange={v => up({ cost: v })} />
      <label className="f wide">Notes<textarea value={lead.notes} onChange={e => up({ notes: e.target.value })} /></label></div></section>
    <div className="acts"><button className="b" onClick={() => price(lead)}>Price this job</button>
      <button className="b x" onClick={() => ask(`Delete ${lead.name || 'this lead'}?`, () => { setSub(''); set(d => ({ ...d, leads: d.leads.filter(l => l.id !== lead.id) })); toast('Lead deleted.'); })}>Delete</button></div></>;
  const s = pipelineStats(db.leads);
  const list = db.leads.filter(l => show === 'Open' ? l.stage !== 'Won' && l.stage !== 'Lost' : l.stage === show).sort((a, b) => (a.next || '9').localeCompare(b.next || '9'));
  return <>
    <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}><button className="b" onClick={() => { const l = blankLead(); set(d => ({ ...d, leads: [l, ...d.leads] })); setSub(l.id); }}>New lead</button></div>
    {db.leads.length > 0 && <div className="stats"><Stat k="Open, per month" v={money(s.open)} /><Stat k="Won, per month" v={money(s.active)} /><Stat k="Win rate" v={Math.round(s.winRate) + '%'} /><Stat k="Average margin" v={Math.round(s.margin) + '%'} /></div>}
    <div className="chips" style={{ marginBottom: 10 }}>{(['Open', ...STAGES] as const).map(x => <button key={x} className={show === x ? 'on' : ''} onClick={() => setShow(x)}>{x} {db.leads.filter(l => x === 'Open' ? l.stage !== 'Won' && l.stage !== 'Lost' : l.stage === x).length}</button>)}</div>
    {list.length === 0 ? <div className="empty">{db.leads.length ? 'Nothing here.' : 'No leads yet. Add one here, save a bid to your pipeline, or use Find businesses in Tools.'}</div> :
      list.map(l => <button className="card" key={l.id} onClick={() => setSub(l.id)}>
        <div className="l1"><span>{l.name || 'No name yet'}</span><span>{l.monthly ? money(l.monthly) + '/mo' : ''}</span></div>
        <div className="l2"><span>{l.next ? `Follow up ${niceDate(l.next)}` : l.city || l.phone}</span><span className={'pill ' + (l.next && l.next <= today() && l.stage !== 'Won' && l.stage !== 'Lost' ? 'bad' : stagePill(l.stage))}>{l.stage}</span></div></button>)}</>;
}

export function Finder({ db, set, toast }: Pick<P, 'db' | 'set' | 'toast'>) {
  const [town, setTown] = useState(db.company.city);
  const [type, setType] = useState(FIND_TYPES[0].name);
  const [miles, setMiles] = useState(10);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Found[] | null>(null);
  const have = (f: Found) => db.leads.some(l => l.name.toLowerCase() === f.name.toLowerCase());
  const add = (fs: Found[]) => {
    const fresh = fs.filter(f => !have(f)).map(f => blankLead({ name: f.name, phone: f.phone, email: f.email, web: f.web, street: f.street, city: f.city, notes: `Found under ${type}. Check the details before you call.` }));
    set(d => ({ ...d, leads: [...fresh, ...d.leads] }));
    toast(fresh.length ? `Added ${fresh.length} to your pipeline.` : 'Already in your pipeline.');
  };
  const search = async () => {
    if (!town.trim()) { toast('Enter a town first.'); return; }
    setBusy(true); setList(null);
    try { setList(await findBusinesses(town.trim(), type, miles)); }
    catch (e) { toast((e as Error).message === 'town' ? 'Could not find that town. Try "City, State".' : 'Could not reach the map service. Try again in a minute.'); }
    setBusy(false);
  };
  const csv = () => ['Name,Phone,Email,Website,Address,City', ...(list ?? []).map(f => [f.name, f.phone, f.email, f.web, f.street, f.city].map(csvCell).join(','))].join('\n');
  return <>
    <section className="panel"><h2>Who do you want to clean for?</h2><div className="fields">
      <Text wide label="Town" placeholder="City, State" value={town} onChange={setTown} />
      <label className="f">Type<select value={type} onChange={e => setType(e.target.value)}>{FIND_TYPES.map(t => <option key={t.name}>{t.name}</option>)}</select></label>
      <label className="f">Within<select value={miles} onChange={e => setMiles(+e.target.value)}>{[5, 10, 25].map(m => <option key={m} value={m}>{m} miles</option>)}</select></label></div>
      <div className="acts"><button className="b" disabled={busy} onClick={search}>{busy ? 'Searching…' : 'Search'}</button></div>
      <p className="hint">This sends only the town and type to OpenStreetMap. Its listings are public and can be out of date or incomplete, so check before you call.</p></section>
    {list && (list.length === 0 ? <div className="empty">Nothing listed there. Try a wider area or another type.</div> : <>
      <div className="note">{list.length} found, {list.filter(f => f.phone).length} with a phone number.</div>
      <div className="acts" style={{ marginBottom: 10 }}><button className="b" onClick={() => add(list)}>Add all to pipeline</button>
        <button className="b g" onClick={async () => { try { await shareFile(`${type} leads.csv`, 'Business list', csv(), 'json'); } catch { toast('Could not make the file.'); } }}>Share as CSV</button></div>
      {list.map(f => <div className="card" key={f.id}><div className="l1"><span>{f.name}</span></div>
        <div className="l2"><span>{[f.street, f.city].filter(Boolean).join(', ') || 'No address listed'}</span><span className={'pill ' + (f.phone ? 'good' : 'plain')}>{f.phone ? 'Has phone' : 'No phone'}</span></div>
        <div className="acts">{f.phone && <a className="b g" href={`tel:${f.phone}`}>Call</a>}<button className="b g" disabled={have(f)} onClick={() => add([f])}>{have(f) ? 'In pipeline' : 'Add'}</button></div></div>)}</>)}</>;
}

function SignPad({ value, onChange, label, saved, keep }: { value: string; onChange: (v: string) => void; label: string; saved?: string; keep?: (v: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [redo, setRedo] = useState(!value);
  const drawing = useRef(false), inked = useRef(false);
  useEffect(() => { const c = ref.current?.getContext('2d'); if (c) { c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111'; } }, [redo]);
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const c = e.currentTarget, r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  if (!redo) return <div className="f"><div className="hint">{label}</div><img className="sig" src={value} alt={label} /><div className="acts"><button className="b g" onClick={() => { onChange(''); setRedo(true); }}>Sign again</button>{keep && <button className="b g" onClick={() => keep(value)}>Save as my signature</button>}</div></div>;
  return <div className="f"><div className="hint">{label}</div>
    <canvas ref={ref} className="sig" width={600} height={200} aria-label={label}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const [x, y] = at(e); const c = e.currentTarget.getContext('2d')!; c.beginPath(); c.moveTo(x, y); }}
      onPointerMove={e => { if (!drawing.current) return; const [x, y] = at(e); const c = e.currentTarget.getContext('2d')!; c.lineTo(x, y); c.stroke(); inked.current = true; }}
      onPointerUp={e => { drawing.current = false; if (inked.current) { onChange(e.currentTarget.toDataURL('image/png')); inked.current = false; } }} />
    <div className="acts"><button className="b g" onClick={() => { const c = ref.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); onChange(''); }}>Clear</button>{saved && <button className="b g" onClick={() => { onChange(saved); setRedo(false); }}>Use my saved signature</button>}</div></div>;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export function Contracts({ db, set, toast, ask, sub, setSub, renew }: P & { renew: (c: Contract, rate: number) => void }) {
  const c = db.contracts.find(x => x.id === sub);
  const [busy, setBusy] = useState(false);
  const check = async (quiet = false) => {
    const open = db.contracts.filter(x => x.signToken && x.status !== 'Signed');
    if (!canSendLink || !open.length) return;
    try {
      const done = (await linkStatus(open.map(x => x.signToken!))).filter(r => r.status === 'signed');
      if (done.length) {
        set(d => ({ ...d, contracts: d.contracts.map(x => { const r = done.find(y => y.token === x.signToken); return r ? { ...x, status: 'Signed', theirName: r.signer_name, theirSign: 'data:image/png;base64,' + r.signature_png, signedOn: r.signed_at.slice(0, 10), signedAt: new Date(r.signed_at).toLocaleString('en-US'), signIp: r.ip, signDevice: r.user_agent, pdfSha: r.pdf_sha256 } : x; }) }));
        toast(`${done.length} contract${done.length > 1 ? 's' : ''} signed.`);
      } else if (!quiet) toast('Not signed yet.');
    } catch { if (!quiet) toast('Could not check. Try again.'); }
  };
  useEffect(() => { void check(true); }, []);
  const up = (o: Partial<Contract>) => set(d => ({ ...d, contracts: d.contracts.map(x => x.id === sub ? { ...x, ...o } : x) }));
  if (c) {
    const r = renewal(c);
    const kind = c.kind ?? 'commercial', home = kind === 'residential';
    const words = wordingFor(kind, db.contractWording);
    const useWords = (k: typeof kind) => { const w = wordingFor(k, db.contractWording); return { clauses: w.terms, title_: w.title, intro: w.intro, afterSign: w.after }; };
    const setKind = (k: typeof kind) => up({ kind: k, ...(c.clauses === words.terms || !c.clauses ? useWords(k) : {}), payTerms: k === 'residential' ? 'Due on completion' : 'Net 15' });
    const locked = !!c.signToken || c.status === 'Signed';
    const link = c.signToken ? signPage(c.signToken) : '';
    const name = c.title_ || words.title;
    const note = `Hi ${c.contact || c.client.name || 'there'}, here is your ${name} from ${db.company.name || 'us'}. You can read it and sign it here: ${link}`;
    const send = async () => {
      if (!c.client.name.trim() || !c.client.street.trim()) { toast('Add the client name and service address first.'); return; }
      const signed = c.ourSign ? {} : db.mySign ? { ourSign: db.mySign } : {};
      const ready = { ...c, ...signed, sentOn: today() };
      setBusy(true);
      try {
        const pdf = contractPDF(ready, db.company);
        if (!canSendLink) { await shareFile(`Agreement ${c.number}.pdf`, name, pdf, 'pdf'); up({ ...signed, status: 'Sent', sentOn: today() }); setBusy(false); return; }
        const token = await createLink(home ? 'C-05R' : 'C-05C', name, c.client.name, pdf);
        const bytes = Uint8Array.from(atob(pdf), x => x.charCodeAt(0));
        up({ ...signed, signToken: token, status: 'Sent', sentOn: today(), pdfSha: hex(await crypto.subtle.digest('SHA-256', bytes)) });
        toast('Signing link ready. Send it below.');
      } catch { toast('Could not send it. Check your connection.'); }
      setBusy(false);
    };
    const start = contractOpening(c, db.company.name, db.company.city);
    const signed = (o: Partial<Contract>) => { const next = { ...c, ...o }; up({ ...o, ...(next.ourSign && next.theirSign ? { status: 'Signed' as const, signedOn: c.signedOn || today() } : {}) }); };
    return <>
      <Back to="Contracts" go={() => setSub('')} />
      <section className="panel"><h2>Send for signature</h2>
        {c.status === 'Signed' ? <div className="note">Signed{c.signedAt ? ` ${c.signedAt}` : ''} by {c.theirName}.</div> : c.signToken ? <>
          <div className="note">Waiting for {c.client.name} to sign. The contract is locked while the link is out.</div>
          <div className="acts"><button className="b" onClick={async () => { try { toast(await shareText('Signing link', note)); } catch { toast('Could not share.'); } }}>Share link</button>
            {c.client.email && <a className="b g" href={`mailto:${c.client.email}?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(note)}`}>Email it</a>}
            {c.client.phone && <a className="b g" href={`sms:${c.client.phone}?body=${encodeURIComponent(note)}`}>Text it</a>}
            <button className="b g" onClick={() => void check()}>Check for signature</button>
            <button className="b x" onClick={() => ask('Cancel this signing link so you can change the contract?', async () => { try { await cancelLink(c.signToken!); up({ signToken: '', status: 'Draft' }); toast('Link canceled.'); } catch { toast('Could not cancel it.'); } })}>Cancel link</button></div></> : <>
          <p className="hint">{canSendLink ? 'Sends the full contract through a private link. The client reads it, signs on their own phone or computer, and the signed copy comes back here.' : 'Shares the full contract as a PDF for the client to sign and return. To sign in person, use the signature boxes below.'}</p>
          <div className="acts"><button className="b" disabled={busy} onClick={() => void send()}>{busy ? 'Preparing...' : canSendLink ? 'Send for signature' : 'Share to sign'}</button></div></>}</section>
      <fieldset className="plain" disabled={locked}>
      <div className="seg"><button className={!home ? 'on' : ''} onClick={() => setKind('commercial')}>Commercial</button><button className={home ? 'on' : ''} onClick={() => setKind('residential')}>Residential</button></div>
      <section className="panel"><h2>Client</h2><div className="fields">
        <Text wide label="Client name" value={c.client.name} onChange={v => up({ client: { ...c.client, name: v } })} /><Text wide label="Service address" value={c.client.street} onChange={v => up({ client: { ...c.client, street: v } })} />
        <Text wide label="City, State, ZIP" value={c.client.city} onChange={v => up({ client: { ...c.client, city: v } })} /><Text label="Contact person" value={c.contact} onChange={v => up({ contact: v })} /><Text label="Their title" value={c.title} onChange={v => up({ title: v })} />
        <Text label="Email" type="email" value={c.client.email} onChange={v => up({ client: { ...c.client, email: v } })} /><Text label="Phone" type="tel" value={c.client.phone} onChange={v => up({ client: { ...c.client, phone: v } })} /></div></section>
      <section className="panel"><h2>Agreement</h2><div className="fields">
        <Text wide label="Agreement #" value={c.number} onChange={v => up({ number: v })} />
        <Text label="Starts" type="date" value={c.date} onChange={v => up({ date: v, end: v ? addMonths(v, c.months) : c.end })} /><Text label="Ends" type="date" value={c.end} onChange={v => up({ end: v })} />
        <Num label="Term (months)" value={c.months} onChange={v => up({ months: v, end: c.date && v ? addMonths(c.date, Math.floor(v)) : c.end })} hint="Leave blank to run until someone ends it." />
        {home ? <><Num label="Price per visit ($)" value={c.visit ?? 0} onChange={v => up({ visit: v })} /><Num label="Deposit ($)" value={c.deposit ?? 0} onChange={v => up({ deposit: v })} /></> : <Num label="Monthly fee ($)" value={c.monthly} onChange={v => up({ monthly: v })} />}
        <Text wide label="How often" placeholder={home ? 'Every 2 weeks' : '3 visits per week'} value={c.frequency ?? ''} onChange={v => up({ frequency: v })} />
        <Text label="Service days" placeholder="Mon, Wed, Fri" value={c.days ?? ''} onChange={v => up({ days: v })} /><Text label="Time window" placeholder="6 PM to 9 PM" value={c.window ?? ''} onChange={v => up({ window: v })} />
        <label className="f wide">Payment terms<select value={c.payTerms} onChange={e => up({ payTerms: e.target.value })}>{['Due at start of service', 'Due on completion', 'Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60'].map(t => <option key={t}>{t}</option>)}</select></label>
        <Check label="Renews automatically" value={c.autoRenew} onChange={v => up({ autoRenew: v })} />
        <label className="f wide">Services<textarea value={c.service} onChange={e => up({ service: e.target.value })} /></label>
        <label className="f wide">Contract wording<textarea style={{ minHeight: 220 }} value={c.clauses} onChange={e => up({ clauses: e.target.value })} /></label></div>
      <div className="acts"><button className="b g" onClick={() => ask(`Replace this contract's wording with the ${db.contractWording[kind]?.terms ? 'saved' : 'standard'} ${home ? 'residential' : 'commercial'} wording?`, () => up(useWords(kind)))}>Use {db.contractWording[kind]?.terms ? 'my' : 'standard'} wording</button></div>
      {!db.contractWording[kind]?.terms && <p className="hint">Standard wording is a starting form, not legal advice. Have a lawyer check it for your state before you use it.</p>}
      <details><summary className="hint">Read the opening of the contract</summary><p className="hint" style={{ whiteSpace: 'pre-wrap' }}><b>{name}</b>{'\n\n'}{start.opening}{'\n\n'}{start.sections}</p></details></section>
      <section className="panel"><h2>Signatures</h2><div className="fields">
        <Text wide label="Your name" value={c.ourName} onChange={v => up({ ourName: v })} /><div className="wide"><SignPad label="Your signature" value={c.ourSign} onChange={v => signed({ ourSign: v })} saved={db.mySign} keep={v => { set(d => ({ ...d, mySign: v, mySignName: c.ourName })); toast('Saved as your signature.'); }} /></div>
        <Text wide label="Client's name" value={c.theirName} onChange={v => up({ theirName: v })} /><div className="wide"><SignPad label="Client's signature" value={c.theirSign} onChange={v => signed({ theirSign: v })} /></div></div>
        <div className="sum" style={{ marginTop: 8 }}><span>Status</span><span className={'pill ' + (c.status === 'Signed' ? 'good' : 'plain')}>{c.status}</span></div></section>
      </fieldset>
      {!home && <details className="panel"><summary><b>Renewal check</b> <span className="hint">(is this contract still paying?)</span></summary><div className="fields" style={{ marginTop: 8 }}>
        <Num label="Priced hours per month" value={c.hours} onChange={v => up({ hours: v })} /><Num label="Actual hours per month" value={c.actHours} onChange={v => up({ actHours: v })} />
        <Num label="Priced labor per month ($)" value={c.labor} onChange={v => up({ labor: v })} /><Num label="Actual labor per month ($)" value={c.actLabor} onChange={v => up({ actLabor: v })} />
        <Num label="Priced supplies per month ($)" value={c.supplies} onChange={v => up({ supplies: v })} /><Num label="Actual supplies per month ($)" value={c.actSupplies} onChange={v => up({ actSupplies: v })} />
        <Num label="Extra hours not above" value={c.addHours} onChange={v => up({ addHours: v })} hint="Work they've added that isn't counted yet" /><Num label="Target margin (%)" value={c.target} onChange={v => up({ target: v })} /></div>
        {c.actLabor > 0 && <><div className="stats" style={{ marginTop: 10 }}><Stat k="Margin when priced" v={Math.round(r.original) + '%'} /><Stat k="Margin now" v={Math.round(r.actual) + '%'} pill={r.actual < r.original ? <span className="pill bad">Slipping</span> : <span className="pill good">Holding</span>} />
          <Stat k="Added hours per month" v={r.creep.toFixed(1)} /><Stat k="New monthly rate" v={money(r.rate)} pill={r.raise ? <span className="pill warn">+{r.change.toFixed(1)}%</span> : <span className="pill good">No raise needed</span>} /></div>
          <div className="acts"><button className="b g" onClick={async () => { try { toast(await shareText('Renewal', renewalNote(c.client.name, c, r))); } catch { toast('Could not share.'); } }}>Share explanation</button>
            <button className="b" onClick={() => renew(c, r.rate)}>Make renewal contract</button></div></>}</details>}
      <div className="acts">
        <button className="b" onClick={async () => { try { await shareFile(`Agreement ${c.number}.pdf`, 'Service agreement', contractPDF(c, db.company), 'pdf'); } catch { toast('Could not make the PDF.'); } }}>Share PDF</button>
        <button className="b x" onClick={() => ask(`Delete agreement ${c.number}?`, () => { setSub(''); set(d => ({ ...d, contracts: d.contracts.filter(x => x.id !== c.id) })); })}>Delete</button></div></>;
  }
  return <>
    <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}><button className="b" onClick={() => { const w = wordingFor('commercial', db.contractWording); const x = blankContract(db.contracts, { ourName: db.mySignName || db.preparedBy, ourSign: db.mySign, target: db.costs.overhead + db.costs.profit, clauses: w.terms, title_: w.title, intro: w.intro, afterSign: w.after }); set(d => ({ ...d, contracts: [x, ...d.contracts] })); setSub(x.id); }}>New contract</button></div>
    {db.contracts.length === 0 ? <div className="empty">No contracts yet. Open an estimate and tap Make contract, or start a new one here.</div> :
      db.contracts.map(x => <button className="card" key={x.id} onClick={() => setSub(x.id)}><div className="l1"><span>{x.client.name || 'No client yet'}</span><span>{x.kind === 'residential' ? money(x.visit ?? 0) + '/visit' : money(x.monthly) + '/mo'}</span></div>
        <div className="l2"><span>{x.number}{x.months > 0 ? ` · ends ${niceDate(x.end)}` : ''}</span><span className={'pill ' + (x.status === 'Signed' ? 'good' : 'plain')}>{x.status}</span></div></button>)}</>;
}

const nameOf = (ws: Worker[], id: string) => ws.find(w => w.id === id)?.name || 'Unnamed';

export function Schedule({ db, set, toast, ask, sub, setSub, openTeam }: P & { openTeam: () => void }) {
  const s = db.shifts.find(x => x.id === sub);
  const up = (o: Partial<Shift>) => set(d => ({ ...d, shifts: d.shifts.map(x => x.id === sub ? { ...x, ...o } : x) }));
  const clients = [...new Set([...db.leads.filter(l => l.stage === 'Won').map(l => l.name), ...db.contracts.map(c => c.client.name)].filter(Boolean))];
  if (s) return <>
    <Back to="Schedule" go={() => setSub('')} />
    <section className="panel"><h2>Shift</h2><div className="fields">
      <label className="f wide">Client<input list="jobs" value={s.client} onChange={e => up({ client: e.target.value })} /></label><datalist id="jobs">{clients.map(c => <option key={c} value={c} />)}</datalist>
      <label className="f wide">Day<select value={s.day} onChange={e => up({ day: +e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      <Text label="Start" type="time" value={s.start} onChange={v => up({ start: v })} /><Num label="Hours each" value={s.hours} onChange={v => up({ hours: v })} /></div></section>
    <section className="panel"><h2>Who's on it</h2>{db.workers.length === 0 ? <><p className="hint">Add your crew first.</p><button className="b g" style={{ width: '100%' }} onClick={openTeam}>Open Team and pay</button></> :
      db.workers.map(w => <Check key={w.id} label={w.name || 'Unnamed'} value={s.workers.includes(w.id)} onChange={v => up({ workers: v ? [...s.workers, w.id] : s.workers.filter(x => x !== w.id) })} />)}</section>
    <div className="acts"><button className="b g" onClick={() => { const x = { ...s, id: uid(), day: (s.day + 1) % 7 }; set(d => ({ ...d, shifts: [...d.shifts, x] })); setSub(x.id); toast('Copied to the next day.'); }}>Copy to next day</button>
      <button className="b x" onClick={() => ask('Delete this shift?', () => { setSub(''); set(d => ({ ...d, shifts: d.shifts.filter(x => x.id !== s.id) })); })}>Delete</button></div></>;
  const cap = capacity(db.workers, db.shifts, db.costs.burden), bad = clashes(db.shifts);
  const plain = DAYS.flatMap((d, i) => { const l = db.shifts.filter(x => x.day === i); return l.length ? [d, ...l.map(x => `  ${x.start || 'Any time'} ${x.client || 'Job'}, ${x.hours} hrs: ${x.workers.map(w => nameOf(db.workers, w)).join(', ') || 'Nobody yet'}`)] : []; }).join('\n');
  return <>
    <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}><button className="b" onClick={() => { const x = blankShift(); set(d => ({ ...d, shifts: [...d.shifts, x] })); setSub(x.id); }}>New shift</button>
      {db.shifts.length > 0 && <button className="b g" onClick={async () => { try { toast(await shareText('This week', plain)); } catch { toast('Could not share.'); } }}>Share week</button>}</div>
    {db.shifts.length > 0 && <section className="panel"><h2>Capacity</h2><div className="stats"><Stat k="Hours booked a week" v={cap.booked.toFixed(1)} /><Stat k="Hours you could still sell" v={cap.open.toFixed(1)} /><Stat k="Weekly labor cost" v={money(cap.weekCost)} /><Stat k="Shifts with nobody" v={String(cap.unassigned)} /></div>
      {cap.rows.map(r => <div className="sum" key={r.id}><span>{r.name || 'Unnamed'}</span><span>{r.booked.toFixed(1)}{r.week ? ` of ${r.week}` : ''} hrs {r.over && <span className="pill bad">Over</span>}</span></div>)}
      {bad.size > 0 && <div className="note">Someone is booked in two places at once. Look for the red shifts.</div>}</section>}
    {db.shifts.length === 0 ? <div className="empty">No shifts yet. Build your regular week here.</div> : DAYS.map((d, i) => { const l = db.shifts.filter(x => x.day === i).sort((a, b) => a.start.localeCompare(b.start)); return l.length > 0 && <div key={d}><h2 style={{ marginTop: 10 }}>{d}</h2>
      {l.map(x => <button className="card" key={x.id} onClick={() => setSub(x.id)}><div className="l1"><span>{x.client || 'No client yet'}</span><span>{x.hours} hrs</span></div>
        <div className="l2"><span>{x.start || 'Any time'} · {x.workers.map(w => nameOf(db.workers, w)).join(', ') || 'Nobody yet'}</span>{bad.has(x.id) ? <span className="pill bad">Clash</span> : !x.workers.length ? <span className="pill warn">Open</span> : null}</div></button>)}</div>; })}</>;
}

export function Team({ db, set, ask, sub, setSub }: P) {
  const w = db.workers.find(x => x.id === sub);
  const up = (o: Partial<Worker>) => set(d => ({ ...d, workers: d.workers.map(x => x.id === sub ? { ...x, ...o } : x) }));
  if (w) return <>
    <Back to="Team and pay" go={() => setSub('')} />
    <section className="panel"><h2>Crew member</h2><div className="fields"><Text wide label="Name" value={w.name} onChange={v => up({ name: v })} />
      <Num label="Pay per hour ($)" value={w.pay} onChange={v => up({ pay: v })} /><Num label="Hours they can work a week" value={w.week} onChange={v => up({ week: v })} /></div></section>
    <div className="acts"><button className="b x" onClick={() => ask(`Remove ${w.name || 'this person'}? They come off every shift.`, () => { setSub(''); set(d => ({ ...d, workers: d.workers.filter(x => x.id !== w.id), shifts: d.shifts.map(s => ({ ...s, workers: s.workers.filter(id => id !== w.id) })) })); })}>Remove</button></div></>;
  const cap = capacity(db.workers, db.shifts, db.costs.burden), g = payGap(db.workers, cap.booked, db.marketPay, db.costs.burden);
  return <>
    <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}><button className="b" onClick={() => { const x = blankWorker(); set(d => ({ ...d, workers: [...d.workers, x] })); setSub(x.id); }}>Add crew member</button></div>
    {db.workers.length === 0 ? <div className="empty">No crew yet. Add yourself too if you clean.</div> : db.workers.map(x => <button className="card" key={x.id} onClick={() => setSub(x.id)}><div className="l1"><span>{x.name || 'No name yet'}</span><span>{x.pay ? money2(x.pay) + '/hr' : ''}</span></div><div className="l2"><span>{x.week ? `${x.week} hrs a week` : 'Hours not set'}</span></div></button>)}
    <section className="panel" style={{ marginTop: 12 }}><h2>Pay check</h2><p className="hint">Look up what cleaners earn near you, then see what matching it would cost.</p><div className="fields">
      <Num wide label="Going rate near you ($ per hour)" value={db.marketPay} onChange={v => set(d => ({ ...d, marketPay: v }))} /></div>
      <p style={{ margin: '8px 0' }}><a href="https://www.bls.gov/oes/current/oes372011.htm" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>See government pay data</a></p>
      {g.avg > 0 && db.marketPay > 0 && <div className="stats"><Stat k="Your average pay" v={money2(g.avg)} pill={<span className={'pill ' + (g.gap > 0 ? 'warn' : 'good')}>{g.gap > 0 ? `${money2(g.gap)} under` : 'At or above'}</span>} /><Stat k="Yearly cost to match" v={money(g.yearly)} /></div>}</section></>;
}

export function Timesheets({ db, set, toast, ask, sub, setSub, openTeam }: P & { openTeam: () => void }) {
  const [day, setDay] = useState(today());
  const [who, setWho] = useState(db.workers[0]?.id ?? '');
  const [job, setJob] = useState('');
  const p = db.punches.find(x => x.id === sub);
  const up = (o: Partial<Punch>) => set(d => ({ ...d, punches: d.punches.map(x => x.id === sub ? { ...x, ...o } : x) }));
  if (p) return <>
    <Back to="Timesheets" go={() => setSub('')} />
    <section className="panel"><h2>Time entry</h2><div className="fields">
      <label className="f wide">Crew member<select value={p.worker} onChange={e => up({ worker: e.target.value })}>{db.workers.map(w => <option key={w.id} value={w.id}>{w.name || 'Unnamed'}</option>)}</select></label>
      <Text wide label="Date" type="date" value={p.date} onChange={v => up({ date: v })} /><Text wide label="Job" value={p.client} onChange={v => up({ client: v })} />
      <Text label="In" type="time" value={p.in} onChange={v => up({ in: v })} /><Text label="Out" type="time" value={p.out} onChange={v => up({ out: v })} />
      <Num wide label="Unpaid break (minutes)" value={p.breakMin} onChange={v => up({ breakMin: v })} /></div>
      <div className="sum t" style={{ marginTop: 8 }}><span>Hours</span><span>{punchHours(p).toFixed(2)}</span></div></section>
    <div className="acts"><button className="b x" onClick={() => ask('Delete this entry?', () => { setSub(''); set(d => ({ ...d, punches: d.punches.filter(x => x.id !== p.id) })); })}>Delete</button></div></>;
  if (!db.workers.length) return <><div className="empty">Add your crew first, then track their hours here.</div><button className="b g" style={{ width: '100%' }} onClick={openTeam}>Open Team and pay</button></>;
  const monday = mondayOf(day || today()), end = addDays(monday, 6);
  const week = db.punches.filter(x => x.date >= monday && x.date <= end).sort((a, b) => (a.date + a.in).localeCompare(b.date + b.in));
  const pay = payroll(db.punches, db.workers, monday), active = db.punches.filter(x => x.in && !x.out);
  const worker = db.workers.some(w => w.id === who) ? who : db.workers[0].id;
  const period = `${niceDate(monday)} - ${niceDate(end)}`;
  return <>
    <section className="panel"><h2>Clock in</h2><div className="fields">
      <label className="f">Who<select value={worker} onChange={e => setWho(e.target.value)}>{db.workers.map(w => <option key={w.id} value={w.id}>{w.name || 'Unnamed'}</option>)}</select></label>
      <Text label="Job" value={job} onChange={setJob} /></div>
      <div className="acts"><button className="b" onClick={() => { set(d => ({ ...d, punches: [{ id: uid(), worker, date: today(), in: now(), out: '', breakMin: 0, client: job }, ...d.punches] })); toast('Clocked in.'); }}>Clock in now</button>
        <button className="b g" onClick={() => { const x = { id: uid(), worker, date: day || today(), in: '', out: '', breakMin: 0, client: job }; set(d => ({ ...d, punches: [x, ...d.punches] })); setSub(x.id); }}>Add hours by hand</button></div>
      {active.map(a => <div className="sum" key={a.id} style={{ alignItems: 'center', marginTop: 8 }}><span>{nameOf(db.workers, a.worker)} since {a.in}</span><button className="b g" onClick={() => { set(d => ({ ...d, punches: d.punches.map(x => x.id === a.id ? { ...x, out: now() } : x) })); toast('Clocked out.'); }}>Clock out</button></div>)}</section>
    <section className="panel"><h2>Week of {niceDate(monday)}</h2><div className="fields"><Text wide label="Pick any day in the week" type="date" value={day} onChange={setDay} /></div>
      {pay.rows.map(r => <div className="sum" key={r.id}><span>{r.name || 'Unnamed'}: {r.hours.toFixed(2)} hrs{r.ot > 0 ? `, ${r.ot.toFixed(2)} overtime` : ''}</span><span>{money2(r.gross)}</span></div>)}
      {pay.rows.length > 0 && <div className="sum t"><span>Gross pay</span><span>{money2(pay.gross)}</span></div>}
      <p className="hint">Hours over 40 in the week are counted at time and a half. This is before taxes. Check the overtime rules for your state.</p>
      <div className="acts">{db.shifts.length > 0 && <button className="b g" onClick={() => { const add = punchesFromSchedule(db.shifts, monday, db.punches); set(d => ({ ...d, punches: [...add, ...d.punches] })); toast(add.length ? `Added ${add.length} entries.` : 'Already filled in.'); }}>Fill from schedule</button>}
        {week.length > 0 && <button className="b" onClick={async () => { try { await shareFile(`Timesheet ${monday}.pdf`, 'Timesheet', timesheetPDF(week, db.workers, period, db.company, [['Total hours', pay.hours.toFixed(2)], ['GROSS PAY', money2(pay.gross)]]), 'pdf'); } catch { toast('Could not make the PDF.'); } }}>Share PDF</button>}</div></section>
    {week.length === 0 ? <div className="empty">No hours this week.</div> : week.map(x => <button className="card" key={x.id} onClick={() => setSub(x.id)}><div className="l1"><span>{nameOf(db.workers, x.worker)}</span><span>{punchHours(x).toFixed(2)} hrs</span></div><div className="l2"><span>{niceDate(x.date)} · {x.in || '?'} to {x.out || '?'}{x.client ? ' · ' + x.client : ''}</span></div></button>)}</>;
}
