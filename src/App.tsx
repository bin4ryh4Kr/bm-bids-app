import { App as CapApp } from '@capacitor/app';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { bioAvailable, loadLock, saveLock, type LockCfg } from './lock';
import { LockScreen } from './LockScreen';
import { applyLook, COLORS, type Look } from './theme';
import { AiBid, AiEstimate, AiSettings } from './ai/gate';
import { commercial, comparePlans, DEFAULT_COM, DEFAULT_COSTS, DEFAULT_RES, FLOORS, residential, TRAFFIC, VISIT_PLANS, type Costs, type Extra, type Floor, type Job, type Room } from './calc';
import { Contracts, Finder, Pipeline, Schedule, Team, Timesheets, Tools, type ToolTab } from './BusinessScreens';
import { addDays, balance, blankEstimate, blankInvoice, estimateFromCommercial, estimateFromResidential, invoiceFromEstimate, jobNumber, money, money2, niceDate, repeatInvoice, subtotal, taxOf, today, total, uid, type Client, type Estimate, type Invoice, type Item } from './docs';
import { Miles, Receipts } from './ExpenseScreens';
import { loadPhoto, savePhoto } from './expenses';
import { estimatePDF, invoicePDF, jobCostPDF, proposalPDF, setPdfColor } from './pdf';
import { ADD_ONS, DEFAULT_RATES, EXAMPLE_ESTIMATE_TERMS, EXAMPLE_INVOICE_TERMS, MAKER, NAMES, SPACE_TYPES, TIER_NAMES, type Company, type Rates } from './rates';
import { shareFile, shareText } from './share';
import { freshDB, loadDB, parseDB, saveDB, type DB, type SavedBid } from './store';
import { allIndustry, fillBlanks, usingIndustry } from './industry';
import { addMonths, blankContract, blankLead, contractFromEstimate, stageFor, type Contract, type Lead } from './tools';
import { Check, n, Num, Text } from './ui';

type Tab = 'bid' | 'pipe' | 'est' | 'inv' | 'tool' | ToolTab | 'set';
type Set = (fn: (d: DB) => DB) => void;

const labor = (p: number) => p <= 45 ? <span className="pill good">Healthy</span> : p <= 55 ? <span className="pill warn">Tight</span> : <span className="pill bad">Too high</span>;
const rate = (h: number, l: number) => h >= l * 1.8 ? <span className="pill good">Good rate</span> : h >= l * 1.4 ? <span className="pill warn">Thin</span> : <span className="pill bad">Too low</span>;
const Stat = ({ k, v, pill }: { k: string; v: string; pill?: ReactNode }) => <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{pill}</div>;
const Breakdown = ({ r, total: t, label }: { r: { labor: number; drive: number; supplies: number; overhead: number; profit: number }; total: number; label: string }) =>
  <table className="rows"><tbody>
    <tr><td>Crew labor</td><td>{money2(r.labor)}</td></tr><tr><td>Drive time + mileage</td><td>{money2(r.drive)}</td></tr>
    <tr><td>Supplies</td><td>{money2(r.supplies)}</td></tr><tr><td>Overhead</td><td>{money2(r.overhead)}</td></tr>
    <tr><td>Profit</td><td>{money2(r.profit)}</td></tr><tr><td>{label}</td><td>{money2(t)}</td></tr></tbody></table>;

const Setup = ({ list, open }: { list: string[]; open: () => void }) => <section className="panel"><h2>Finish setting up</h2>
  <p className="hint">Add these in Settings and your prices will show here:</p><ul className="hint" style={{ margin: '0 0 8px', paddingLeft: 18 }}>{list.map(x => <li key={x}>{x}</li>)}</ul>
  <button className="b" style={{ width: '100%' }} onClick={open}>Open Settings</button></section>;

const main0 = (r: { main: { price: number } }) => r.main.price > 0;

// At least 30% profit, and always above the main quote.
const startHigh = (high: number, price: number) => Math.max(high, Math.ceil(price * 1.1 / 5) * 5);

// The three quote boxes. Each one can become an estimate, a shared PDF or a shared quote at that price.
type Tier = { label: string; price: number };
function Tiers({ tiers, make, shareQuote, pdf }: { tiers: Tier[]; make: (p: number) => void; shareQuote: (p: number) => void; pdf: (p: number) => void }) {
  const [t, setT] = useState<Tier | null>(null);
  const run = (f: (p: number) => void) => { const p = t!.price; setT(null); f(p); };
  return <><div className="range">{tiers.map((x, i) => <button key={x.label} className={i === 1 ? 'mid' : ''} onClick={() => setT(x)}><div className="k">{x.label}</div><div className="v">{money(x.price)}</div></button>)}</div>
    {t && <div className="modal" role="dialog"><div><h2>{t.label}: {money(t.price)}</h2><p className="hint" style={{ marginTop: 0 }}>Use this price for the quote.</p>
      <div className="stack"><button className="b" onClick={() => run(make)}>Create estimate</button><button className="b g" onClick={() => run(pdf)}>Share estimate PDF</button><button className="b g" onClick={() => run(shareQuote)}>Share quote</button><button className="b g" onClick={() => setT(null)}>Cancel</button></div></div></div>}</>;
}

function ResidentialBid({ db, set, go, toast, setup, pipe }: { db: DB; set: Set; go: (e: Estimate, lead?: string) => void; toast: (s: string) => void; setup: () => void; pipe: (l: Partial<Lead>, id: string) => void }) {
  const b = db.res, c = db.costs;
  const up = (o: Partial<typeof b>) => set(d => ({ ...d, res: { ...d.res, ...o } }));
  const R = db.rates;
  const r = residential(b, c, R);
  const ao = (id: string, v: number) => up({ addOns: { ...b.addOns, [id]: v } });
  const quote = (price: number) => {
    const deposit = price * R.depositPct / 100;
    const home = `${b.sqft.toLocaleString('en-US')} sq ft, ${Math.floor(b.beds)} bed, ${Math.floor(b.full)} full / ${Math.floor(b.half)} half bath`;
    const L = [`${db.company.name || 'Your'} quote` + (b.client.trim() ? ' - ' + b.client.trim() : '')];
    if (r.rec && r.first) {
      L.push(`${r.rec.name} cleaning, ${home}`, `First visit, Deep Clean: ${money(r.first.price)}`, `Then ${r.rec.name.toLowerCase()}: ${money(price)} per visit`);
    } else {
      L.push(r.hourly ? `${NAMES.hourly}, ${r.main.hours} cleaner-hours` : `${NAMES[r.firstKind]}, ${home}`);
      if (r.main.add.lines.length) L.push('Add-ons: ' + r.main.add.lines.join(', '));
      L.push(`Price: ${money(price)}`, `Deposit to reserve your date: ${money2(deposit)} (${R.depositPct}%). Balance of ${money2(price - deposit)} is due when the crew arrives.`);
    }
    L.push('Your price is confirmed in a written Estimate. Sales tax is added where required by law.');
    return L.join('\n');
  };
  const shareQuote = async (p: number) => { try { toast(await shareText('Quote', quote(p))); } catch { toast('Could not share.'); } };
  const sharePdf = async (p: number) => { const e = estimateFromResidential(b, c, R, db.estimates, p); go(e, b.leadId); try { await shareFile(`Estimate ${e.number}.pdf`, 'Estimate', estimatePDF(e, db.company, db.preparedBy, db.estimateTerms), 'pdf'); } catch { toast('Could not make the PDF.'); } };
  const need = [!R.tiers.some(t => t[1] || t[2] || t[3]) && 'Your prices', !c.wage && 'Your crew pay and costs', !(c.speedStd || c.speedDeep || c.speedMove) && 'Your cleaning speeds'].filter(Boolean) as string[];
  const blank = !main0(r);
  return <>
    {need.length > 0 && <Setup list={need} open={setup} />}
    {AiBid && <Suspense fallback={null}><AiBid b={b} apply={up} /></Suspense>}
    <section className="panel"><h2>The home</h2><div className="fields">
      <Text wide label="Client name" value={b.client} onChange={v => up({ client: v })} />
      <label className="f wide">Type of clean<select value={b.job} onChange={e => up({ job: e.target.value as Job })}>
        <option value="standard">Standard Clean, one time</option><option value="deep">Deep Clean, one time</option><option value="move">Move-In / Move-Out</option>
        <option value="weekly">Recurring: weekly{R.off.weekly ? ` (${R.off.weekly}% off)` : ''}</option><option value="biweekly">Recurring: every 2 weeks{R.off.biweekly ? ` (${R.off.biweekly}% off)` : ''}</option><option value="monthly">Recurring: monthly{R.off.monthly ? ` (${R.off.monthly}% off)` : ''}</option>
        <option value="hourly">Hourly / custom work{R.hourly ? ` ($${R.hourly} per cleaner-hour)` : ''}</option></select></label>
      {r.hourly ? <Num wide label="Cleaner-hours" value={b.hours} onChange={v => up({ hours: v })} hint={`${R.hourlyMin ? `${R.hourlyMin}-hour minimum. ` : ''}Two cleaners for 3 hours is 6 cleaner-hours.`} /> : <>
        <Num label="Home size (sq ft)" value={b.sqft} onChange={v => up({ sqft: v })} /><Num label="Bedrooms" value={b.beds} onChange={v => up({ beds: v })} />
        {r.tierName && <div className="hint wide">{r.tierName}{r.manyBeds ? '. More bedrooms than this size usually has, so consider the next size up.' : ''}</div>}
        <Num label="Full baths" value={b.full} onChange={v => up({ full: v })} /><Num label="Half baths" value={b.half} onChange={v => up({ half: v })} />
        <label className="f wide">Condition<select value={b.cond} onChange={e => up({ cond: +e.target.value })}><option value={0}>Normal</option><option value={25}>Heavy: +25%</option><option value={35}>Heavier: +35%</option><option value={50}>Neglected or cluttered: +50%</option></select></label></>}
      <Num label="Cleaners on the job" value={b.crew} onChange={v => up({ crew: v })} /><Num label="Drive, round trip (min)" value={b.drive} onChange={v => up({ drive: v })} />
      <Num label="Miles, round trip" value={b.miles} onChange={v => up({ miles: v })} /><div />
      <Check label={`Rush, same-day or next-day${R.rush ? ` (+${R.rush}%)` : ''}`} value={b.rush} onChange={v => up({ rush: v })} />
      <Check label={`Sunday or holiday${R.sunday ? ` (+${R.sunday}%)` : ''}`} value={b.sunday} onChange={v => up({ sunday: v })} />
    </div></section>
    <section className="panel"><h2>Add-ons</h2>
      {ADD_ONS.map(a => {
        const inc = a.in.includes(r.firstKind);
        const price = R.addOns[a.id] ?? 0;
        const cost = inc ? 'Included' : !price ? 'Set price' : `$${price}${a.unit ? ' / ' + a.unit : ''}${a.id === 'carpet' && R.carpetMin ? `, $${R.carpetMin} min.` : ''}`;
        return <div key={a.id} className={'addon' + (inc ? ' incl' : '')}>
          {a.qty ? <label className="qty"><input type="number" inputMode="numeric" min={0} disabled={inc} value={b.addOns[a.id] || ''} placeholder="0" onChange={e => ao(a.id, n(e.target.value))} />{a.name}</label>
            : <label className="check"><input type="checkbox" disabled={inc} checked={!!b.addOns[a.id]} onChange={e => ao(a.id, e.target.checked ? 1 : 0)} />{a.name}</label>}
          <span className="cost">{cost}</span></div>;
      })}
      <div className="fields" style={{ marginTop: 10 }}><Num wide label="Quoted extras ($)" value={b.extras} onChange={v => up({ extras: v })} hint="Exterior windows, pressure washing, junk haul-off" />
        {r.rec && <Check label="Repeat add-ons on every visit (otherwise first visit only)" value={b.repeat} onChange={v => up({ repeat: v })} />}</div>
    </section>
    <section className="panel">
      {!blank && <><div className="stats">
        <Stat k={`Time on site, ${r.crew} cleaner${r.crew > 1 ? 's' : ''}`} v={r.onsite.toFixed(1) + ' hrs'} />
        <Stat k="You earn per labor hour" v={money2(r.perHour)} pill={rate(r.perHour, r.loaded)} />
        <Stat k="Labor as % of price" v={Math.round(r.laborPct) + '%'} pill={labor(r.laborPct)} />
        <Stat k={r.rec ? 'Profit per month' : 'Profit on this job'} v={money(r.profitMonth)} />
      </div>
      <details><summary className="hint">See the cost breakdown</summary><Breakdown r={r} total={r.main.price} label={r.rec ? 'Price per visit' : 'Job price'} /></details>
      <div className="note">{r.main.price < r.floor ? `This price is under your ${money(r.floor)} floor. Raise it, or pass on the job.` : `This keeps ${Math.round(r.profitPct)}% profit after crew, drive, supplies and overhead.`}
        {r.rec ? ` Recurring starts with one Deep Clean.` : ''}{r.firstKind === 'move' ? ' Assumes an empty home with water and electricity on.' : ''}</div>
      <p className="hint">Tap a price to quote it.</p>
      <Tiers tiers={[{ label: 'Floor (10% profit)', price: r.floor }, { label: 'Quote this', price: r.main.price }, { label: 'Start high', price: startHigh(r.high, r.main.price) }]} make={p => go(estimateFromResidential(b, c, R, db.estimates, p), b.leadId)} shareQuote={p => void shareQuote(p)} pdf={p => void sharePdf(p)} /></>}
      <div className="acts">
        <button className="b" onClick={() => go(estimateFromResidential(b, c, R, db.estimates), b.leadId)}>Create estimate</button>
        <button className="b g" onClick={() => void shareQuote(r.main.price)}>Share quote</button>
        <button className="b g" onClick={() => { const m = r.rec?.perMonth ?? 1; pipe({ name: b.client, kind: 'residential', sqft: b.sqft, monthly: Math.round(r.rec ? r.monthly : r.main.price), cost: Math.round((r.direct + r.overhead) * m) }, b.leadId); }}>{b.leadId ? 'Update pipeline' : 'Save to pipeline'}</button>
      </div>
      <div className="price" style={{ marginTop: 12, marginBottom: 0 }}>
        <div className="lbl">{r.rec ? 'PRICE PER VISIT' : 'JOB PRICE'}{r.overSheet ? ' (CUSTOM QUOTE)' : ''}</div>
        <div className="big">{money(r.main.price)}</div>
        <div className="row">{r.rec && r.first
          ? <><span>First Deep Clean <b>{money(r.first.price)}</b></span><span>Monthly <b>{money(r.monthly)}</b></span></>
          : R.depositPct > 0 && <><span>{R.depositPct}% deposit <b>{money2(r.deposit)}</b></span><span>At arrival <b>{money2(r.balance)}</b></span></>}</div>
      </div>
    </section></>;
}

function CommercialBid({ db, set, go, toast, setup, pipe }: { db: DB; set: Set; go: (e: Estimate, lead?: string) => void; toast: (s: string) => void; setup: () => void; pipe: (l: Partial<Lead>, id: string) => void }) {
  const b = db.com, c = db.costs;
  const up = (o: Partial<typeof b>) => set(d => ({ ...d, com: { ...d.com, ...o } }));
  const r = commercial(b, c);
  const plans = comparePlans(b, c);
  const room = (x: number, o: Partial<Room>) => up({ rooms: b.rooms.map((y, i) => i === x ? { ...y, ...o } : y) });
  const extra = (x: number, o: Partial<Extra>) => up({ extras: b.extras.map((y, i) => i === x ? { ...y, ...o } : y) });
  const text = (p: number) => `${db.company.name || 'Your'} quote${b.client.trim() ? ' - ' + b.client.trim() : ''}\n${SPACE_TYPES[b.space]?.name}, ${r.sqft.toLocaleString('en-US')} sq ft, ${b.restrooms} restroom(s), ${b.visits} visit(s) per week\nPrice per visit: ${money(p)}\nMonthly: ${money(p * r.visitsMo)} (${r.visitsMo.toFixed(1)} visits/month avg)`;
  const shareQuote = async (p: number) => { try { toast(await shareText('Quote', text(p))); } catch { toast('Could not share.'); } };
  const sharePdf = async (p: number) => { const e = estimateFromCommercial(b, c, db.estimates, p); go(e, b.leadId); try { await shareFile(`Estimate ${e.number}.pdf`, 'Estimate', estimatePDF(e, db.company, db.preparedBy, db.estimateTerms), 'pdf'); } catch { toast('Could not make the PDF.'); } };
  const need = [!c.wage && 'Your crew pay and costs', !(c.overhead || c.profit) && 'Your overhead and profit targets'].filter(Boolean) as string[];
  return <>
    {need.length > 0 && <Setup list={need} open={setup} />}
    <section className="panel"><h2>The site</h2><div className="fields">
      <Text wide label="Client / site name" value={b.client} onChange={v => up({ client: v })} />
      <label className="f wide">Type of space<select value={b.space} onChange={e => up({ space: +e.target.value })}>{SPACE_TYPES.map((s, i) => <option key={i} value={i}>{s.name}: {s.rate.toLocaleString('en-US')} sq ft per hour</option>)}</select></label>
      <div className="chips wide">{VISIT_PLANS.map(p => <button key={p.name} className={Math.abs(b.visits - p.visits) < 0.001 ? 'on' : ''} onClick={() => up({ visits: p.visits })}>{p.name}</button>)}</div>
      {b.rooms.length ? <div className="hint wide">{r.sqft.toLocaleString('en-US')} sq ft from your rooms below</div> : <Num label="Cleanable sq ft" value={b.sqft} onChange={v => up({ sqft: v })} />}<Num label="Visits per week" value={b.visits} onChange={v => up({ visits: v })} />
      <Num label="Restrooms" value={b.restrooms} onChange={v => up({ restrooms: v })} /><Num label="Break rooms / kitchens" value={b.kitchens} onChange={v => up({ kitchens: v })} />
      <label className="f wide">Foot traffic<select value={b.traffic} onChange={e => up({ traffic: +e.target.value })}>{TRAFFIC.map(t => <option key={t.pct} value={t.pct}>{t.name}</option>)}</select></label>
      <Num label="Cleaners on the job" value={b.crew} onChange={v => up({ crew: v })} /><Num label="Supplies per visit ($)" value={b.suppliesVisit} onChange={v => up({ suppliesVisit: v })} />
      <Num label="Drive, round trip (min)" value={b.drive} onChange={v => up({ drive: v })} /><Num label="Miles, round trip" value={b.miles} onChange={v => up({ miles: v })} />
      <Num wide label="Sales tax (%)" value={b.taxPct} onChange={v => up({ taxPct: v })} hint="Shown on top of the price and never counted as profit." />
    </div></section>
    <details className="panel"><summary><b>Room by room</b> <span className="hint">(optional, for a closer number)</span></summary>
      {b.rooms.map((x, i) => <div className="item" key={i}><div className="fields"><Text wide label="Room" value={x.name} onChange={v => room(i, { name: v })} /><Num label="Sq ft" value={x.sqft} onChange={v => room(i, { sqft: v })} />
        <label className="f">Floor<select value={x.floor} onChange={e => room(i, { floor: e.target.value as Floor })}>{FLOORS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <button className="b x wide" onClick={() => up({ rooms: b.rooms.filter((_, y) => y !== i) })}>Remove room</button></div></div>)}
      <button className="b g" style={{ width: '100%' }} onClick={() => up({ rooms: [...b.rooms, { name: '', sqft: 0, floor: '' }] })}>Add room</button>
      <p className="hint">Set how fast you clean each floor in Settings. Rooms replace the sq ft above.</p></details>
    <details className="panel"><summary><b>Trash, glass, stairs and more</b></summary><div className="fields" style={{ marginTop: 8 }}>
      <Num label="Trash cans" value={b.trash} onChange={v => up({ trash: v })} /><Num label="Glass doors / panes" value={b.glass} onChange={v => up({ glass: v })} />
      <Num label="Flights of stairs" value={b.stairs} onChange={v => up({ stairs: v })} /><Num label="Elevators" value={b.elevators} onChange={v => up({ elevators: v })} />
      <Num wide label="Entry doors" value={b.doors} onChange={v => up({ doors: v })} /></div><p className="hint">Set your minutes for each of these in Settings.</p></details>
    <details className="panel"><summary><b>Scheduled extras</b> <span className="hint">(floor waxing, carpets, windows)</span></summary>
      {b.extras.map((x, i) => <div className="item" key={i}><div className="fields"><Text wide label="Service" value={x.name} onChange={v => extra(i, { name: v })} /><Num label="Price each time ($)" value={x.price} onChange={v => extra(i, { price: v })} /><Num label="Times a year" value={x.perYear} onChange={v => extra(i, { perYear: v })} />
        <button className="b x wide" onClick={() => up({ extras: b.extras.filter((_, y) => y !== i) })}>Remove</button></div></div>)}
      <button className="b g" style={{ width: '100%' }} onClick={() => up({ extras: [...b.extras, { name: '', price: 0, perYear: 0 }] })}>Add extra</button>
      {r.extrasMonth > 0 && <div className="sum t" style={{ marginTop: 8 }}><span>Adds per month, on average</span><span>{money2(r.extrasMonth)}</span></div>}</details>
    <details className="panel"><summary><b>Use my own numbers</b> <span className="hint">(override the math)</span></summary><div className="fields" style={{ marginTop: 8 }}>
      <Num label="Labor hours per visit" value={b.hoursOverride} onChange={v => up({ hoursOverride: v })} /><Num label="Price per sq ft, per visit ($)" value={b.sqftPrice} onChange={v => up({ sqftPrice: v })} /></div>
      {b.sqftPrice > 0 && r.price < r.floor && <div className="note">That price is under your {money(r.floor)} floor.</div>}</details>
    <section className="panel">
      {r.price > 0 && <><div className="stats">
        <Stat k={r.crew > 1 ? `Time on site, ${r.crew} cleaners` : 'Labor hours per visit'} v={r.onsite.toFixed(1) + ' hrs'} />
        <Stat k="You earn per labor hour" v={money2(r.perHour)} pill={rate(r.perHour, r.loaded)} />
        <Stat k="Labor as % of price" v={Math.round(r.laborPct) + '%'} pill={labor(r.laborPct)} />
        <Stat k="Profit per month" v={money(r.profit * r.visitsMo)} />
        <Stat k="Margin after overhead" v={Math.round(r.margin) + '%'} />
        <Stat k="Price per sq ft, per visit" v={'$' + r.priceSqft.toFixed(3)} />
      </div>
      <details><summary className="hint">See the cost breakdown</summary><Breakdown r={r} total={r.price} label="Price per visit" /></details>
      <details><summary className="hint">Compare schedules</summary><div className="scroll"><table className="rows plans"><tbody><tr><td><b>Schedule</b></td><td>Visit</td><td>Month</td><td>Profit / mo</td></tr>
        {plans.map(p => <tr key={p.name}><td>{p.name}</td><td>{money(p.perVisit)}</td><td>{money(p.monthly)}</td><td>{money(p.profitMonth)}</td></tr>)}</tbody></table></div></details>
      <p className="hint">Tap a price to quote it.</p>
      <Tiers tiers={[{ label: 'Floor (10% profit)', price: r.floor }, { label: 'Quote this', price: r.price }, { label: 'Start high', price: startHigh(r.high, r.price) }]} make={p => go(estimateFromCommercial(b, c, db.estimates, p), b.leadId)} shareQuote={p => void shareQuote(p)} pdf={p => void sharePdf(p)} /></>}
      <div className="acts"><button className="b" onClick={() => go(estimateFromCommercial(b, c, db.estimates), b.leadId)}>Create estimate</button>
        <button className="b g" onClick={() => void shareQuote(r.price)}>Share quote</button>
        <button className="b g" onClick={() => pipe({ name: b.client, kind: 'commercial', sqft: r.sqft, monthly: Math.round(r.monthly), cost: Math.round(r.costMonth + r.overhead * r.visitsMo) }, b.leadId)}>{b.leadId ? 'Update pipeline' : 'Save to pipeline'}</button>
        {r.price > 0 && <button className="b g" onClick={async () => { try { await shareFile(`Job cost ${b.client || 'job'}.pdf`, 'Internal job cost', jobCostPDF(b, r, db.company), 'pdf'); } catch { toast('Could not make the PDF.'); } }}>Internal job cost PDF</button>}</div>
      <div className="price" style={{ marginTop: 12, marginBottom: 0 }}><div className="lbl">PRICE PER VISIT</div><div className="big">{money(r.price)}</div>
        <div className="row"><span>Monthly <b>{money(r.monthly)}</b></span><span>Yearly <b>{money(r.yearly)}</b></span>{b.taxPct > 0 && <span>Sales tax <b>{money2(r.taxVisit)}</b> a visit, added on top</span>}</div></div>
    </section></>;
}

function ClientFields({ c, up, pick }: { c: Client; up: (o: Partial<Client>) => void; pick: Client[] }) {
  return <div className="fields">
    <label className="f wide">Client name<input list="clients" value={c.name} onChange={e => { const m = pick.find(p => p.name === e.target.value); up(m ? { ...m } : { name: e.target.value }); }} /></label>
    <datalist id="clients">{pick.map(p => <option key={p.name} value={p.name} />)}</datalist>
    <Text label="Phone" type="tel" value={c.phone} onChange={v => up({ phone: v })} /><Text label="Email" type="email" value={c.email} onChange={v => up({ email: v })} />
    <Text wide label="Address" value={c.street} onChange={v => up({ street: v })} /><Text wide label="City, State, ZIP" value={c.city} onChange={v => up({ city: v })} />
  </div>;
}

function Items({ items, up }: { items: Item[]; up: (i: Item[]) => void }) {
  const at = (x: number, o: Partial<Item>) => up(items.map((it, i) => i === x ? { ...it, ...o } : it));
  return <>{items.map((it, x) => <div className="item" key={x}><div className="fields">
    <Text wide label="Service" value={it.name} onChange={v => at(x, { name: v })} />
    <label className="f wide">Description<textarea value={it.desc} onChange={e => at(x, { desc: e.target.value })} /></label>
    <Num label="Qty" value={it.qty} onChange={v => at(x, { qty: v })} /><Num label="Price ($)" value={it.price} onChange={v => at(x, { price: v })} />
    {items.length > 1 && <button className="b x wide" onClick={() => up(items.filter((_, i) => i !== x))}>Remove line</button>}
  </div></div>)}
    <button className="b g" style={{ width: '100%' }} onClick={() => up([...items, { name: '', desc: '', qty: 1, price: 0 }])}>Add line</button></>;
}

const clientsOf = (db: DB) => { const m = new Map<string, Client>(); [...db.estimates, ...db.invoices].forEach(d => { if (d.client.name) m.set(d.client.name, d.client); }); return [...m.values()]; };

function EstimateEdit({ e0, db, set, back, toast, openInv, ask, makeContract }: { e0: Estimate; db: DB; set: Set; back: () => void; toast: (s: string) => void; openInv: (i: Invoice) => void; ask: (t: string, f: () => void) => void; makeContract: (e: Estimate) => void }) {
  const [e, setE] = useState(e0);
  const up = (o: Partial<Estimate>) => setE(x => ({ ...x, ...o }));
  const autoNumber = useRef(!e0.client.name);
  const save = (x = e) => set(d => ({ ...d, estimates: d.estimates.some(y => y.id === x.id) ? d.estimates.map(y => y.id === x.id ? x : y) : [x, ...d.estimates] }));
  useEffect(() => { save(e); }, [e]); // every change is kept, even if the phone's back button is used
  const renumber = (name: string) => { if (autoNumber.current) up({ number: jobNumber(name, e.date, db.estimates.filter(x => x.id !== e.id)) }); };
  return <>
    <button className="back" onClick={back}>‹ Estimates</button>
    <section className="panel"><h2>Client</h2><ClientFields c={e.client} pick={clientsOf(db)} up={o => { setE(x => ({ ...x, client: { ...x.client, ...o } })); if (o.name) renumber(o.name); }} /></section>
    <section className="panel"><h2>Estimate</h2><div className="fields">
      <Text wide label="Estimate #" value={e.number} onChange={v => { autoNumber.current = false; up({ number: v }); }} />
      <Text label="Date" type="date" value={e.date} onChange={v => up({ date: v })} /><Text label="Valid until" type="date" value={e.validUntil} onChange={v => up({ validUntil: v })} />
      <label className="f">Type<select value={e.kind} onChange={x => up({ kind: x.target.value as Estimate['kind'] })}><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
      <label className="f">Status<select value={e.status} onChange={x => { const status = x.target.value as Estimate['status']; up({ status }); if (e.leadId) set(d => ({ ...d, leads: d.leads.map(l => l.id === e.leadId ? { ...l, stage: stageFor(status, l.stage) } : l) })); }}>{['Draft', 'Sent', 'Accepted', 'Declined'].map(s => <option key={s}>{s}</option>)}</select></label>
      <Check label="Recurring service" value={e.recurring} onChange={v => up({ recurring: v })} />
    </div></section>
    <section className="panel"><h2>Services</h2><label className="f" style={{ marginBottom: 10 }}>Scope of work (prints on the proposal)<textarea value={e.scope ?? ''} onChange={x => up({ scope: x.target.value })} /></label><Items items={e.items} up={items => up({ items })} />
      {AiEstimate && <Suspense fallback={null}><AiEstimate service={e.items[0]?.name ?? ''} use={t => setE(x => ({ ...x, items: x.items.map((it, n) => n === 0 ? { ...it, desc: t } : it) }))} /></Suspense>}</section>
    <section className="panel"><h2>Totals and deposit</h2><div className="fields">
      <Num label="Discount ($)" value={e.discount} onChange={v => up({ discount: v })} /><Num label="Sales tax (%)" value={e.taxPct ?? 0} onChange={v => up({ taxPct: v })} />
      {!e.taxPct && <Num label="Or sales tax ($)" value={e.tax} onChange={v => up({ tax: v })} />}<Num label="Deposit ($)" value={e.deposit} onChange={v => up({ deposit: v })} />
      <Check label="Deposit has been paid" value={e.depositPaid} onChange={v => up({ depositPaid: v })} />
      <Text wide label="Recurring rate" value={e.recurringRate} onChange={v => up({ recurringRate: v })} />
      <Text wide label="Estimated duration" value={e.duration} onChange={v => up({ duration: v })} />
      <label className="f wide">Notes<textarea value={e.notes} onChange={x => up({ notes: x.target.value })} /></label>
    </div>
      <div style={{ marginTop: 10 }}><div className="sum"><span>Subtotal</span><span>{money2(subtotal(e))}</span></div>{taxOf(e) > 0 && <div className="sum"><span>Sales tax</span><span>{money2(taxOf(e))}</span></div>}<div className="sum t"><span>Estimated total</span><span>{money2(total(e))}</span></div></div></section>
    <div className="acts">
      <button className="b" onClick={async () => { try { await shareFile(`Estimate ${e.number}.pdf`, 'Estimate', estimatePDF(e, db.company, db.preparedBy, db.estimateTerms), 'pdf'); } catch { toast('Could not make the PDF.'); } }}>Share PDF</button>
      <button className="b" onClick={async () => { try { await shareFile(`Proposal ${e.number}.pdf`, 'Proposal', proposalPDF(e, db.company, db.preparedBy, db.estimateTerms), 'pdf'); } catch { toast('Could not make the PDF.'); } }}>Share proposal</button>
      <button className="b g" onClick={() => makeContract(e)}>Make contract</button>
      <button className="b g" onClick={() => { const i = invoiceFromEstimate(e, db.nextInvoice); set(d => ({ ...d, nextInvoice: d.nextInvoice + 1, invoices: [i, ...d.invoices] })); openInv(i); }}>Create invoice</button>
      <button className="b x" onClick={() => ask(`Delete estimate ${e.number}?`, () => { back(); set(d => ({ ...d, estimates: d.estimates.filter(y => y.id !== e.id) })); })}>Delete</button>
    </div></>;
}

function InvoiceEdit({ i0, db, set, back, toast, openInv, ask }: { i0: Invoice; db: DB; set: Set; back: () => void; toast: (s: string) => void; openInv: (i: Invoice) => void; ask: (t: string, f: () => void) => void }) {
  const [i, setI] = useState(i0);
  const up = (o: Partial<Invoice>) => setI(x => ({ ...x, ...o }));
  const save = (x = i) => set(d => ({ ...d, invoices: d.invoices.map(y => y.id === x.id ? x : y) }));
  useEffect(() => { save(i); }, [i]);
  const paid = i.status === 'Paid';
  return <>
    <button className="back" onClick={back}>‹ Invoices</button>
    <section className="panel"><h2>Bill to</h2><ClientFields c={i.client} pick={clientsOf(db)} up={o => setI(x => ({ ...x, client: { ...x.client, ...o } }))} /></section>
    <section className="panel"><h2>Invoice</h2><div className="fields">
      <Text label="Invoice #" value={i.number} onChange={v => up({ number: v })} /><Text label="Job #" value={i.jobRef} onChange={v => up({ jobRef: v })} />
      <Text label="Date" type="date" value={i.date} onChange={v => up({ date: v })} /><Text label="Due" type="date" value={i.dueDate} onChange={v => up({ dueDate: v })} />
      <label className="f wide">Terms<select value={i.terms} onChange={e => up({ terms: e.target.value })}>{['Due on crew arrival', 'Due on completion', 'Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60'].map(t => <option key={t}>{t}</option>)}</select></label>
    </div></section>
    <section className="panel"><h2>Services</h2><Items items={i.items} up={items => up({ items })} /></section>
    <section className="panel"><h2>Totals</h2><div className="fields">
      <Num label="Discount ($)" value={i.discount} onChange={v => up({ discount: v })} /><Num label="Sales tax (%)" value={i.taxPct ?? 0} onChange={v => up({ taxPct: v })} />
      {!i.taxPct && <Num wide label="Or sales tax ($)" value={i.tax} onChange={v => up({ tax: v })} />}<Num wide label="Less deposit / payments ($)" value={i.credit} onChange={v => up({ credit: v })} />
      <label className="f wide">Notes<textarea value={i.notes} onChange={e => up({ notes: e.target.value })} /></label></div>
      <div style={{ marginTop: 10 }}><div className="sum"><span>Total</span><span>{money2(total(i))}</span></div><div className="sum t"><span>{paid ? 'Paid' : 'Balance due'}</span><span>{money2(balance(i))}</span></div></div></section>
    <section className="panel"><h2>Payment</h2><div className="fields">
      <Check label="Paid" value={paid} onChange={v => up(v ? { status: 'Paid', paidDate: i.paidDate || today() } : { status: 'Unpaid', paidDate: '' })} />
      {paid && <><Text label="Paid on" type="date" value={i.paidDate} onChange={v => up({ paidDate: v })} />
        <label className="f">Method<select value={i.paidMethod} onChange={e => up({ paidMethod: e.target.value })}>{['', 'Zelle', 'Card', 'Check', 'Cash'].map(m => <option key={m}>{m}</option>)}</select></label></>}
    </div></section>
    <div className="acts">
      <button className="b" onClick={async () => { try { await shareFile(`Invoice ${i.number}.pdf`, 'Invoice', invoicePDF(i, db.company, db.invoiceTerms), 'pdf'); } catch { toast('Could not make the PDF.'); } }}>Share PDF</button>
      <button className="b g" onClick={() => { const x = repeatInvoice(i, db.nextInvoice); set(d => ({ ...d, nextInvoice: d.nextInvoice + 1, invoices: [x, ...d.invoices] })); openInv(x); toast('New invoice for the next visit.'); }}>Next visit invoice</button>
      <button className="b x" onClick={() => ask(`Delete invoice ${i.number}?`, () => { back(); set(d => ({ ...d, invoices: d.invoices.filter(y => y.id !== i.id) })); })}>Delete</button>
    </div></>;
}

// Logos are resized so backups and PDFs stay small.
const shrinkImage = (f: File) => new Promise<string>((ok, no) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    ok(cv.toDataURL('image/png'));
  };
  img.onerror = no;
  img.src = URL.createObjectURL(f);
});

function Prices({ R, up }: { R: Rates; up: (o: Partial<Rates>) => void }) {
  const tier = (t: number, col: number, v: number) => up({ tiers: R.tiers.map((row, i) => i === t ? row.map((x, j) => j === col ? v : x) : row) });
  return <div style={{ marginTop: 10 }}>
    {TIER_NAMES.map((name, t) => <div key={t} style={{ marginBottom: 10 }}><div className="hint"><b>{name}</b></div><div className="fields" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
      <Num label="Standard" value={R.tiers[t][1]} onChange={v => tier(t, 1, v)} /><Num label="Deep" value={R.tiers[t][2]} onChange={v => tier(t, 2, v)} /><Num label="Move" value={R.tiers[t][3]} onChange={v => tier(t, 3, v)} /></div></div>)}
    <div className="fields">
      <Num label="Extra full bath, Standard" value={R.bathFull.standard} onChange={v => up({ bathFull: { ...R.bathFull, standard: v } })} />
      <Num label="Extra full bath, Deep / Move" value={R.bathFull.deep} onChange={v => up({ bathFull: { ...R.bathFull, deep: v, move: v } })} />
      <Num label="Extra half bath, Standard" value={R.bathHalf.standard} onChange={v => up({ bathHalf: { ...R.bathHalf, standard: v } })} />
      <Num label="Extra half bath, Deep / Move" value={R.bathHalf.deep} onChange={v => up({ bathHalf: { ...R.bathHalf, deep: v, move: v } })} />
      <Num label="Hourly rate ($)" value={R.hourly} onChange={v => up({ hourly: v })} /><Num label="Hourly minimum (hrs)" value={R.hourlyMin} onChange={v => up({ hourlyMin: v })} />
      <Num label="Deposit (%)" value={R.depositPct} onChange={v => up({ depositPct: v })} /><Num label="Weekly discount (%)" value={R.off.weekly} onChange={v => up({ off: { ...R.off, weekly: v } })} />
      <Num label="Every 2 weeks discount (%)" value={R.off.biweekly} onChange={v => up({ off: { ...R.off, biweekly: v } })} /><Num label="Monthly discount (%)" value={R.off.monthly} onChange={v => up({ off: { ...R.off, monthly: v } })} />
      <Num label="Rush charge (%)" value={R.rush} onChange={v => up({ rush: v })} /><Num label="Sunday / holiday charge (%)" value={R.sunday} onChange={v => up({ sunday: v })} />
      <Num wide label="Carpet extraction minimum ($)" value={R.carpetMin} onChange={v => up({ carpetMin: v })} />
      {ADD_ONS.map(a => <Num key={a.id} label={a.name + (a.unit ? ` (per ${a.unit})` : '')} value={R.addOns[a.id] ?? 0} onChange={v => up({ addOns: { ...R.addOns, [a.id]: v } })} />)}
    </div></div>;
}

function Appearance({ look, set }: { look: Look; set: (l: Look) => void }) {
  return <section className="panel"><h2>Look</h2>
    <div className="seg three">{(['auto', 'light', 'dark'] as const).map(m => <button key={m} className={look.mode === m ? 'on' : ''} onClick={() => set({ ...look, mode: m })}>{{ auto: 'Auto', light: 'Light', dark: 'Dark' }[m]}</button>)}</div>
    <div className="swatches">{COLORS.map(c => <button key={c.hex} aria-label={c.name} aria-pressed={look.accent === c.hex} className={look.accent === c.hex ? 'on' : ''} style={{ background: c.hex }} onClick={() => set({ ...look, accent: c.hex })} />)}</div>
    <label className="f" style={{ marginTop: 10 }}>Pick your own color<input type="color" value={look.accent} onChange={e => set({ ...look, accent: e.target.value })} /></label>
    <p className="hint">Your color also goes on your PDFs.</p></section>;
}

function Security({ toast }: { toast: (s: string) => void }) {
  const [c, setC] = useState<LockCfg | null>(null);
  const [flow, setFlow] = useState<'' | 'create' | 'off' | 'change'>('');
  const [bio, setBio] = useState(false);
  useEffect(() => {
    loadLock().then(setC); bioAvailable().then(setBio);
    const h = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) bioAvailable().then(setBio); });
    return () => { h.then(x => x.remove()).catch(() => {}); };
  }, []);
  if (!c) return null;
  const save = (n: LockCfg) => { setC(n); saveLock(n).catch(() => toast('Could not save.')); };
  return <section className="panel"><h2>Lock screen</h2>
    {!c.hash ? <><p className="hint">No PIN is set, so anyone with your phone can open this app.</p><button className="b" style={{ width: '100%' }} onClick={() => setFlow('create')}>Set a PIN</button></> : <>
      <div className="fields">
        <label className="f wide">Lock after leaving the app for<select value={c.grace} onChange={e => save({ ...c, grace: +e.target.value })}><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={300}>5 minutes</option></select></label>
        {bio && <Check label="Unlock with fingerprint or face" value={c.bio} onChange={v => save({ ...c, bio: v })} />}
      </div>
      <div className="acts"><button className="b g" onClick={() => setFlow('change')}>Change PIN</button><button className="b x" onClick={() => setFlow('off')}>Turn off PIN</button></div></>}
    <p className="hint">The PIN keeps people out of the app. If you forget it, the only fix is erasing the app, so save a backup.</p>
    {flow === 'create' && <LockScreen mode="create" cfg={c} onCancel={() => setFlow('')} onDone={n => { setC(n); setFlow(''); toast('PIN is on.'); }} />}
    {(flow === 'off' || flow === 'change') && <LockScreen mode="verify" cfg={c} onCancel={() => setFlow('')} onDone={n => {
      if (flow === 'change') { setC(n); setFlow('create'); return; }
      save({ ...n, hash: '', salt: '', bio: false }); setFlow(''); toast('PIN is off.');
    }} />}
  </section>;
}

function Settings({ db, set, toast, ask }: { db: DB; set: Set; toast: (s: string) => void; ask: (t: string, f: () => void) => void }) {
  const c = db.costs, co = db.company;
  const up = (o: Partial<Costs>) => set(d => ({ ...d, costs: { ...d.costs, ...o } }));
  const upCo = (o: Partial<Company>) => set(d => ({ ...d, company: { ...d.company, ...o } }));
  const file = useRef<HTMLInputElement>(null);
  const logoFile = useRef<HTMLInputElement>(null);
  return <>
    <section className="panel"><h2>Your business</h2><p className="hint">This prints on your estimates and invoices.</p><div className="fields">
      <Text wide label="Business name" value={co.name} onChange={v => upCo({ name: v })} />
      <Text label="Phone" type="tel" value={co.phone} onChange={v => upCo({ phone: v })} /><Text label="Email" type="email" value={co.email} onChange={v => upCo({ email: v })} />
      <Text label="Website" value={co.web} onChange={v => upCo({ web: v })} /><Text label="City, State" value={co.city} onChange={v => upCo({ city: v })} />
      <Text wide label="Prepared by" value={db.preparedBy} onChange={v => set(d => ({ ...d, preparedBy: v }))} />
      <Text wide label="Tagline (prints on proposals)" value={co.tagline} onChange={v => upCo({ tagline: v })} />
      <label className="f wide">About your business (prints on proposals)<textarea value={co.bio} onChange={e => upCo({ bio: e.target.value })} /></label>
      <label className="f wide">How customers pay you<textarea placeholder="Zelle, checks, card link" value={co.pay} onChange={e => upCo({ pay: e.target.value })} /></label>
    </div>
      <div className="acts">{co.logo && <img src={co.logo} alt="Your logo" style={{ maxHeight: 60, maxWidth: 140 }} />}
        <button className="b g" onClick={() => logoFile.current?.click()}>{co.logo ? 'Change logo' : 'Add your logo'}</button>
        {co.logo && <button className="b x" onClick={() => upCo({ logo: '' })}>Remove logo</button>}
        <input ref={logoFile} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) try { upCo({ logo: await shrinkImage(f) }); } catch { toast('Could not read that picture.'); } }} />
      </div></section>
    <Appearance look={db.look} set={look => set(d => ({ ...d, look }))} />
    <Security toast={toast} />
    <section className="panel"><h2>Industry rates</h2><p className="hint">New installs start with typical U.S. numbers from published ranges. They aren't your costs or your market, so replace them with your own before you rely on a bid.</p>
      <div className="acts"><button className="b g" onClick={() => { set(fillBlanks); toast('Blanks filled in.'); }}>Fill my blanks</button>
        <button className="b g" onClick={() => ask('Replace all your prices, costs and speeds with industry rates?', () => { set(allIndustry); toast('Industry rates loaded.'); })}>Use all industry rates</button></div></section>
    <details className="panel"><summary><b>Your prices</b> <span className="hint">(tap to change)</span></summary><Prices R={db.rates} up={o => set(d => ({ ...d, rates: { ...d.rates, ...o } }))} />
      <div className="acts"><button className="b g" onClick={() => ask('Clear all your prices?', () => set(d => ({ ...d, rates: DEFAULT_RATES() })))}>Clear prices</button></div></details>
    <section className="panel"><h2>Your costs and targets</h2><div className="fields">
      <Num label="Crew pay per hour ($)" value={c.wage} onChange={v => up({ wage: v })} /><Num label="Payroll taxes & comp (%)" value={c.burden} onChange={v => up({ burden: v })} />
      <Num label="Overhead (% of price)" value={c.overhead} onChange={v => up({ overhead: v })} /><Num label="Target profit (% of price)" value={c.profit} onChange={v => up({ profit: v })} />
      <Num label="Supplies (% of labor)" value={c.supplies} onChange={v => up({ supplies: v })} /><Num label="Vehicle cost per mile ($)" value={c.mileRate} onChange={v => up({ mileRate: v })} />
      <Num wide label="Mileage log rate ($ per mile)" value={db.mileRate} onChange={v => set(d => ({ ...d, mileRate: v }))} hint="Check the current IRS business rate each year." />
    </div></section>
    <section className="panel"><h2>Residential speeds</h2><div className="fields">
      <Num label="Standard (sq ft / labor hr)" value={c.speedStd} onChange={v => up({ speedStd: v })} /><Num label="Deep (sq ft / labor hr)" value={c.speedDeep} onChange={v => up({ speedDeep: v })} />
      <Num label="Move-In / Out (sq ft / labor hr)" value={c.speedMove} onChange={v => up({ speedMove: v })} /><Num label="Fewest labor hours per job" value={c.minHours} onChange={v => up({ minHours: v })} />
    </div><p className="hint">How many square feet one person cleans in an hour. Time a few homes to get your real numbers.</p></section>
    <section className="panel"><h2>Commercial</h2><div className="fields">
      <Num label="Minutes per restroom" value={c.restroomMin} onChange={v => up({ restroomMin: v })} /><Num label="Minutes per break room" value={c.kitchenMin} onChange={v => up({ kitchenMin: v })} />
      <Num label="Minutes per trash can" value={c.trashMin} onChange={v => up({ trashMin: v })} /><Num label="Minutes per glass door / pane" value={c.glassMin} onChange={v => up({ glassMin: v })} />
      <Num label="Minutes per flight of stairs" value={c.stairsMin} onChange={v => up({ stairsMin: v })} /><Num label="Minutes per elevator" value={c.elevatorMin} onChange={v => up({ elevatorMin: v })} />
      <Num label="Minutes per entry door" value={c.doorMin} onChange={v => up({ doorMin: v })} /><div />
      <Num label="Carpet (sq ft / labor hr)" value={c.floorCarpet} onChange={v => up({ floorCarpet: v })} /><Num label="Tile / VCT (sq ft / labor hr)" value={c.floorTile} onChange={v => up({ floorTile: v })} />
      <Num label="Hardwood (sq ft / labor hr)" value={c.floorWood} onChange={v => up({ floorWood: v })} /><Num label="Concrete (sq ft / labor hr)" value={c.floorConcrete} onChange={v => up({ floorConcrete: v })} />
      <Num label="Minimum per visit ($)" value={c.minimum} onChange={v => up({ minimum: v })} /><Num label="Round price up to ($)" value={c.round} onChange={v => up({ round: v })} />
    </div><p className="hint">Time your own crew to get these. A floor speed only applies when it's slower than the space speed.</p></section>
    <details className="panel"><summary><b>Your contract wording</b> <span className="hint">(optional)</span></summary><p className="hint">Paste your own full agreement and new contracts use it. Leave a box blank to use the standard wording.</p><div className="fields">
      {(['commercial', 'residential'] as const).map(k => <label className="f wide" key={k}>{k === 'commercial' ? 'Commercial agreement' : 'Residential agreement'}<textarea value={db.contractWording[k]?.terms ?? ''} onChange={e => { const terms = e.target.value; set(d => ({ ...d, contractWording: { ...d.contractWording, [k]: { title: d.contractWording[k]?.title || (k === 'commercial' ? 'Commercial Service Agreement' : 'Residential Service Agreement'), intro: d.contractWording[k]?.intro ?? '', after: d.contractWording[k]?.after ?? '', terms } } })); }} /></label>)}
    </div></details>
    <section className="panel"><h2>Paperwork</h2><div className="fields">
      <Num wide label="Next invoice number" value={db.nextInvoice} onChange={v => set(d => ({ ...d, nextInvoice: Math.floor(v) }))} />
      <label className="f wide">Estimate terms<textarea placeholder={EXAMPLE_ESTIMATE_TERMS} value={db.estimateTerms} onChange={e => set(d => ({ ...d, estimateTerms: e.target.value }))} /></label>
      <label className="f wide">Invoice terms<textarea placeholder={EXAMPLE_INVOICE_TERMS} value={db.invoiceTerms} onChange={e => set(d => ({ ...d, invoiceTerms: e.target.value }))} /></label>
    </div><p className="hint">Terms print on your PDFs. Have yours checked for your state.</p></section>
    {AiSettings && <Suspense fallback={null}><AiSettings toast={toast} /></Suspense>}
    <section className="panel"><h2>Backup</h2><p className="hint">Everything is saved on this phone only. Save a backup somewhere safe so a lost phone doesn't lose your work.</p>
      <div className="acts">
        <button className="b" onClick={async () => { try { const photos: Record<string, string> = {};
          for (const r of db.receipts) if (r.photo) photos[r.id] = await loadPhoto(r.id).catch(() => '');
          await shareFile(`BM Bids backup ${today()}.json`, 'Backup', JSON.stringify({ ...db, photos }), 'json'); } catch { toast('Could not make the backup.'); } }}>Save backup</button>
        <button className="b g" onClick={() => file.current?.click()}>Restore backup</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
          try {
            const text = await f.text(); const d = parseDB(text); const photos: Record<string, string> = JSON.parse(text).photos || {};
            ask('Replace everything on this phone with this backup?', () => { set(() => d); Object.entries(photos).forEach(([id, p]) => { if (p) savePhoto(id, p).catch(() => {}); }); toast('Backup restored.'); });
          } catch { toast('That file is not a B&M Bids backup.'); }
        }} />
      </div>
      <div className="acts"><button className="b g" onClick={() => ask('Clear all your costs, speeds and bid forms?', () => { up({ ...DEFAULT_COSTS }); set(d => ({ ...d, com: { ...DEFAULT_COM }, res: { ...DEFAULT_RES, addOns: {} } })); })}>Clear costs and bid forms</button></div>
    </section>
    <section className="panel" style={{ textAlign: 'center' }}><img src="icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
      <h2 style={{ margin: '8px 0 4px' }}>B&amp;M Bids is free</h2>
      <p className="hint" style={{ margin: 0 }}>Built by {MAKER.name}, a veteran-owned and woman-owned cleaning company in coastal North Carolina, for other cleaners. No account, no ads, and nothing leaves your phone unless you share it. Find businesses sends only the town and type you search.</p>
      <p style={{ margin: '10px 0 0' }}><a href={MAKER.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>Visit {MAKER.site}</a></p></section></>;
}

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS: Record<string, string> = {
  bid: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  est: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  inv: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  pipe: 'M3 5h18l-7 8v6l-4 2v-8z',
  tool: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  set: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
};
const TITLES: Record<Tab, string> = { bid: 'Bid Calculator', pipe: 'Pipeline', est: 'Estimates', inv: 'Invoices', tool: 'Tools', con: 'Contracts', find: 'Find businesses', sch: 'Schedule', time: 'Timesheets', team: 'Team and pay', rec: 'Receipts', mil: 'Miles', set: 'Settings' };
const IN_TOOLS: Tab[] = ['con', 'find', 'sch', 'time', 'team', 'rec', 'mil'];

export default function App() {
  const [db, setDb] = useState<DB | null>(null);
  const [tab, setTab] = useState<Tab>('bid');
  const [mode, setMode] = useState<'res' | 'com'>('res');
  const [est, setEst] = useState<Estimate | null>(null);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [msg, setMsg] = useState('');
  const [sub, setSub] = useState('');
  const [lockCfg, setLockCfg] = useState<LockCfg | null>(null);
  const [gate, setGate] = useState<'' | 'setup' | 'locked'>('');
  const [cover, setCover] = useState(false);
  const leftAt = useRef(0);
  const [dlg, setDlg] = useState<{ t: string; f: () => void } | null>(null);
  const saver = useRef<() => void>(() => {});
  const scroller = useRef<HTMLDivElement>(null);
  const toastTimer = useRef(0);
  const toast = (s: string) => { if (!s) return; setMsg(s); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setMsg(''), 2600); };
  const ask = (t: string, f: () => void) => setDlg({ t, f });

  useEffect(() => { loadDB().then(setDb).catch(() => setDb(freshDB())); }, []);
  useEffect(() => { // Command-S everywhere, and the Mac app's File menu
    const w = window as unknown as { bmSave?: () => void };
    w.bmSave = () => saver.current();
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saver.current(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => { loadLock().then(c => { setLockCfg(c); setGate(!c.asked ? 'setup' : c.hash ? 'locked' : ''); }); }, []);
  useEffect(() => {
    if (!db) return;
    applyLook(db.look); setPdfColor(db.look.accent);
    const m = matchMedia('(prefers-color-scheme: dark)'), f = () => applyLook(db.look);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [db?.look]);
  useEffect(() => {
    const h = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) { leftAt.current = Date.now(); setCover(true); return; }
      // Use the time away once. The fingerprint prompt brings the app back too, and must not lock it again.
      const away = leftAt.current;
      leftAt.current = 0;
      const c = await loadLock();
      setLockCfg(c);
      if (c.hash && away && Date.now() - away >= c.grace * 1000) setGate('locked');
      setCover(false);
    });
    return () => { h.then(x => x.remove()).catch(() => {}); };
  }, []);
  useEffect(() => { if (db) saveDB(db).catch(() => toast('Could not save.')); }, [db]);
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [tab, est?.id, inv?.id, sub]);
  useEffect(() => {
    const h = CapApp.addListener('backButton', () => {
      if (gate) CapApp.minimizeApp(); else if (dlg) setDlg(null); else if (sub) setSub(''); else if (inv) setInv(null); else if (est) setEst(null); else if (IN_TOOLS.includes(tab)) setTab('tool'); else if (tab !== 'bid') setTab('bid'); else CapApp.exitApp();
    });
    return () => { h.then(x => x.remove()).catch(() => {}); };
  }, [dlg, inv, est, tab, sub, gate]);

  if (!db || !lockCfg) return null;
  if (gate === 'setup') return <LockScreen mode="create" cfg={lockCfg} onDone={c => { setLockCfg(c); setGate(''); }} onSkip={() => { const c = { ...lockCfg, asked: true }; setLockCfg(c); saveLock(c); setGate(''); }} />;
  if (gate === 'locked') return <LockScreen mode="unlock" cfg={lockCfg} onDone={c => { setLockCfg(c); setGate(''); }} />;
  const set: Set = fn => setDb(d => d ? fn(d) : d);
  const toEst = (e0: Estimate, leadId = '') => {
    const l = db.leads.find(x => x.id === leadId);
    const e = l ? { ...e0, leadId, client: { ...e0.client, phone: l.phone, email: l.email, street: l.street, city: l.city } } : e0;
    if (l) set(d => ({ ...d, leads: d.leads.map(x => x.id === leadId ? { ...x, estimateId: e.id, stage: x.stage === 'Prospect' || x.stage === 'Contacted' ? 'Quoted' : x.stage } : x) }));
    setSub(''); setInv(null); setEst(e); setTab('est');
  };
  const pipe = (o: Partial<Lead>, id: string) => {
    const has = id && db.leads.some(l => l.id === id);
    if (has) { set(d => ({ ...d, leads: d.leads.map(l => l.id === id ? { ...l, ...o, name: o.name || l.name } : l) })); toast('Pipeline updated.'); return; }
    if (!o.name?.trim()) { toast('Add a client name first.'); return; }
    const l = blankLead({ ...o, stage: 'Quoted' });
    const link = o.kind === 'commercial' ? { com: { ...db.com, leadId: l.id } } : { res: { ...db.res, leadId: l.id } };
    set(d => ({ ...d, ...link, leads: [l, ...d.leads] })); toast('Saved to your pipeline.');
  };
  const price = (l: Lead) => {
    if (l.kind === 'commercial') set(d => ({ ...d, com: { ...DEFAULT_COM, space: d.com.space, client: l.name, sqft: l.sqft, leadId: l.id } }));
    else set(d => ({ ...d, res: { ...DEFAULT_RES, addOns: {}, client: l.name, sqft: l.sqft, leadId: l.id } }));
    setMode(l.kind === 'commercial' ? 'com' : 'res'); setSub(''); setTab('bid');
  };
  const makeContract = (e: Estimate) => {
    const c = { ...contractFromEstimate(e, db.contracts, db.costs.overhead + db.costs.profit, db.contractWording), ourName: db.mySignName || db.preparedBy, ourSign: db.mySign };
    set(d => ({ ...d, contracts: [c, ...d.contracts] })); setEst(null); setInv(null); setTab('con'); setSub(c.id);
  };
  const renew = (c: Contract, rate: number) => {
    const start = c.end && c.end > today() ? addDays(c.end, 1) : today();
    const { id, number } = blankContract(db.contracts);
    const next: Contract = { ...c, id, number, status: 'Draft', ourSign: db.mySign, theirSign: '', signedOn: '', signToken: '', sentOn: '', signedAt: '', signIp: '', signDevice: '', pdfSha: '', monthly: rate, date: start, end: addMonths(start, c.months), hours: c.actHours + c.addHours, labor: c.actLabor, supplies: c.actSupplies, actHours: 0, actLabor: 0, actSupplies: 0, addHours: 0 };
    set(d => ({ ...d, contracts: [next, ...d.contracts] })); setSub(next.id); toast('Renewal contract ready.');
  };
  const toInv = (i: Invoice) => { setEst(null); setInv(i); setTab('inv'); };
  const open = (t: Tab) => { setEst(null); setInv(null); setSub(''); setTab(t); };
  const biz = { db, set, toast, ask, sub, setSub };
  const saveBid = () => {
    const id = (mode === 'com' ? db.com.bidId : db.res.bidId) || uid();
    const name = (mode === 'com' ? db.com.client : db.res.client).trim() || `Bid ${niceDate(today())}`;
    const price = mode === 'com' ? commercial(db.com, db.costs).price : residential(db.res, db.costs, db.rates).main.price;
    const bid: SavedBid = mode === 'com' ? { id, name, mode, date: today(), price, com: { ...db.com, bidId: id } } : { id, name, mode, date: today(), price, res: { ...db.res, bidId: id } };
    set(d => ({ ...d, ...(mode === 'com' ? { com: { ...d.com, bidId: id } } : { res: { ...d.res, bidId: id } }), bids: [bid, ...d.bids.filter(x => x.id !== id)] }));
    return name;
  };
  const saveNow = async () => {
    const name = tab === 'bid' ? saveBid() : '';
    try { await saveDB(db); toast(name ? `Saved ${name}.` : 'Saved.'); } catch { toast('Could not save.'); }
  };
  saver.current = saveNow;
  const openBid = (x: SavedBid) => { set(d => ({ ...d, ...(x.com ? { com: { ...DEFAULT_COM, ...x.com } } : {}), ...(x.res ? { res: { ...DEFAULT_RES, ...x.res } } : {}) })); setMode(x.mode); toast(`Opened ${x.name}.`); };
  const newBid = () => { set(d => mode === 'com' ? { ...d, com: { ...DEFAULT_COM } } : { ...d, res: { ...DEFAULT_RES, addOns: {} } }); toast('New bid.'); };
  const unpaid = db.invoices.filter(i => i.status === 'Unpaid');
  const setup = !db.company.name && <div className="note">Add your business name in <a href="#" style={{ color: 'var(--accent)' }} onClick={e => { e.preventDefault(); open('set'); }}>Settings</a> so it prints on your PDFs.</div>;

  return <div className="app">
    <div className="top"><h1>{TITLES[tab]}</h1><div className="topacts"><button className="save" onClick={() => saver.current()}>Save</button><button className="gear" aria-label="Settings" onClick={() => open('set')}><Icon d={ICONS.set} /></button></div></div>
    <div className="body" ref={scroller}>
      {tab === 'bid' && <>
        {db.bids.length > 0 && <details className="panel"><summary><b>Saved bids</b> <span className="hint">({db.bids.length})</span></summary>
          {db.bids.map(x => <div className="addon" key={x.id}><button className="linkrow" onClick={() => openBid(x)}><b>{x.name}</b><span className="hint">{x.mode === 'com' ? 'Commercial' : 'Residential'} · {niceDate(x.date)} · {money(x.price)}</span></button>
            <button className="b x" onClick={() => ask(`Delete saved bid ${x.name}?`, () => set(d => ({ ...d, bids: d.bids.filter(y => y.id !== x.id) })))}>Delete</button></div>)}
          <button className="b g" style={{ width: '100%', marginTop: 8 }} onClick={newBid}>Start a new bid</button></details>}
        {usingIndustry(db.rates) && <div className="note">These are typical industry numbers, not yours yet. Change them in <a href="#" style={{ color: 'var(--accent)' }} onClick={e => { e.preventDefault(); open('set'); }}>Settings</a>.</div>}
        <div className="seg"><button className={mode === 'res' ? 'on' : ''} onClick={() => setMode('res')}>Residential</button><button className={mode === 'com' ? 'on' : ''} onClick={() => setMode('com')}>Commercial</button></div>
        {mode === 'res' ? <ResidentialBid db={db} set={set} go={toEst} toast={toast} setup={() => open('set')} pipe={pipe} /> : <CommercialBid db={db} set={set} go={toEst} toast={toast} setup={() => open('set')} pipe={pipe} />}</>}
      {tab === 'est' && (est ? <EstimateEdit key={est.id} e0={est} db={db} set={set} back={() => setEst(null)} toast={toast} openInv={toInv} ask={ask} makeContract={makeContract} /> : <>
        <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}><button className="b" onClick={() => setEst(blankEstimate(db.estimates))}>New estimate</button></div>
        {setup}{db.estimates.length === 0 ? <div className="empty">No estimates yet. Price a job on the Bid tab, then tap Create estimate.</div> :
          db.estimates.map(e => <button className="card" key={e.id} onClick={() => setEst(e)}>
            <div className="l1"><span>{e.client.name || 'No client yet'}</span><span>{money2(total(e))}</span></div>
            <div className="l2"><span>{e.number} · {niceDate(e.date)}</span><span className={'pill ' + (e.status === 'Accepted' ? 'good' : e.status === 'Declined' ? 'bad' : 'plain')}>{e.status}</span></div></button>)}</>)}
      {tab === 'inv' && (inv ? <InvoiceEdit key={inv.id} i0={inv} db={db} set={set} back={() => setInv(null)} toast={toast} openInv={toInv} ask={ask} /> : <>
        <div className="acts" style={{ marginTop: 0, marginBottom: 10 }}><button className="b" onClick={() => { const i = blankInvoice(db.nextInvoice); set(d => ({ ...d, nextInvoice: d.nextInvoice + 1, invoices: [i, ...d.invoices] })); setInv(i); }}>New invoice</button></div>
        {setup}{unpaid.length > 0 && <div className="note">{unpaid.length} unpaid: {money2(unpaid.reduce((s, i) => s + balance(i), 0))} owed to you</div>}
        {db.invoices.length === 0 ? <div className="empty">No invoices yet. Open an estimate and tap Create invoice.</div> :
          db.invoices.map(i => { const late = i.status === 'Unpaid' && i.dueDate < today(); return <button className="card" key={i.id} onClick={() => setInv(i)}>
            <div className="l1"><span>{i.client.name || 'No client yet'}</span><span>{money2(balance(i))}</span></div>
            <div className="l2"><span>{i.number} · due {niceDate(i.dueDate)}</span><span className={'pill ' + (i.status === 'Paid' ? 'good' : late ? 'bad' : 'warn')}>{i.status === 'Paid' ? 'Paid' : late ? 'Past due' : 'Unpaid'}</span></div></button>; })}</>)}
      {tab === 'rec' && <Receipts db={db} set={set} toast={toast} ask={ask} Text={Text} Num={Num} editing={sub} setEditing={setSub} />}
      {tab === 'mil' && <Miles db={db} set={set} toast={toast} ask={ask} Text={Text} Num={Num} editing={sub} setEditing={setSub} />}
      {tab === 'pipe' && <Pipeline {...biz} price={price} />}
      {tab === 'tool' && <Tools db={db} open={open} />}
      {IN_TOOLS.includes(tab) && !sub && <button className="back" onClick={() => open('tool')}>‹ Tools</button>}
      {tab === 'find' && <Finder db={db} set={set} toast={toast} />}
      {tab === 'con' && <Contracts {...biz} renew={renew} />}
      {tab === 'sch' && <Schedule {...biz} openTeam={() => open('team')} />}
      {tab === 'time' && <Timesheets {...biz} openTeam={() => open('team')} />}
      {tab === 'team' && <Team {...biz} />}
      {tab === 'set' && <Settings db={db} set={set} toast={toast} ask={ask} />}
    </div>
    <nav className="nav">{(['bid', 'pipe', 'est', 'inv', 'tool'] as Tab[]).map(t => <button key={t} className={tab === t || (t === 'tool' && IN_TOOLS.includes(tab)) ? 'on' : ''} onClick={() => open(t)}><Icon d={ICONS[t]} />{{ bid: 'Bid', pipe: 'Pipeline', est: 'Estimates', inv: 'Invoices', tool: 'Tools' }[t as 'bid']}</button>)}</nav>
    {cover && <div className="cover" />}
    {msg && <div className="toast" role="status">{msg}</div>}
    {dlg && <div className="modal"><div><p style={{ marginTop: 0 }}>{dlg.t}</p><div className="acts"><button className="b g" onClick={() => setDlg(null)}>Cancel</button><button className="b" onClick={() => { dlg.f(); setDlg(null); }}>Yes</button></div></div></div>}
  </div>;
}
