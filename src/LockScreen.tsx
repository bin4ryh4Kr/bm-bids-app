import { useEffect, useState } from 'react';
import { bioUnlock, checkPin, eraseEverything, setPin, type LockCfg } from './lock';

type Mode = 'unlock' | 'create' | 'verify';
const LEN = 4;

export function LockScreen({ mode, cfg, onDone, onSkip, onCancel }: { mode: Mode; cfg: LockCfg; onDone: (c: LockCfg) => void; onSkip?: () => void; onCancel?: () => void }) {
  const [pin, setP] = useState('');
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState('');
  const [c, setC] = useState(cfg);
  const [now, setNow] = useState(Date.now());
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const wait = Math.max(0, Math.ceil((c.until - now) / 1000));

  useEffect(() => { if (!wait) return; const t = setTimeout(() => setNow(Date.now()), 500); return () => clearTimeout(t); }, [wait, now]);
  useEffect(() => { if (mode === 'unlock' && c.bio) bioUnlock().then(ok => { if (ok) onDone(c); }); }, []);

  useEffect(() => {
    if (pin.length !== LEN || busy) return;
    (async () => {
      setBusy(true);
      if (mode === 'create') {
        if (!first) { setFirst(pin); setMsg(''); }
        else if (first === pin) { onDone(await setPin(c, pin)); return; }
        else { setFirst(''); setMsg("Those didn't match. Start again."); }
      } else {
        const r = await checkPin(c, pin);
        setC(r.cfg); setNow(Date.now());
        if (r.ok) { onDone(r.cfg); return; }
        setMsg('Wrong PIN.');
      }
      setP(''); setBusy(false);
    })();
  }, [pin]);

  const press = (d: string) => { if (!wait && !busy) { setMsg(''); setP(p => (p + d).slice(0, LEN)); } };
  const title = mode === 'create' ? (first ? 'Enter it again' : 'Create a 4-digit PIN') : mode === 'verify' ? 'Enter your PIN' : 'Enter PIN to unlock';

  if (forgot) return <div className="lock"><div className="lockbox">
    <h1>Forgot your PIN?</h1>
    <p>Your work is saved only on this phone, so nobody can reset the PIN for you. The only way back in is to erase everything in the app. You can restore a backup afterward if you saved one.</p>
    <div className="acts"><button className="b g" onClick={() => setForgot(false)}>Go back</button><button className="b x" onClick={() => eraseEverything()}>Erase everything</button></div>
  </div></div>;

  return <div className="lock"><div className="lockbox">
    <img src="icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
    <h1>{title}</h1>
    {mode === 'create' && !first && !onCancel && <p>Keeps your customers and money private if your phone gets picked up.</p>}
    <div className="dots" aria-label={`${pin.length} of ${LEN} digits entered`}>{Array.from({ length: LEN }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
    <div className="lockmsg" role="status">{wait ? `Too many tries. Wait ${wait} seconds.` : msg}</div>
    <div className="pad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} onClick={() => press(d)} aria-label={d}>{d}</button>)}
      {mode === 'unlock' && c.bio ? <button className="side" aria-label="Use fingerprint or face" onClick={() => bioUnlock().then(ok => { if (ok) onDone(c); })}>Use<br />biometric</button> : <span />}
      <button onClick={() => press('0')} aria-label="0">0</button>
      <button className="side" aria-label="Delete digit" onClick={() => setP(p => p.slice(0, -1))}>⌫</button>
    </div>
    {mode === 'unlock' && <button className="linkb" onClick={() => setForgot(true)}>Forgot PIN?</button>}
    {onSkip && <button className="linkb" onClick={onSkip}>Not now</button>}
    {onCancel && <button className="linkb" onClick={onCancel}>Cancel</button>}
  </div></div>;
}
