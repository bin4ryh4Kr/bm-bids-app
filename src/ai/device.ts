// AI that runs on the phone itself (llama.cpp inside the app). Nothing leaves the phone and nothing is billed:
// the model is downloaded once, then photos and notes are read right here.
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { LlamaContext } from 'llama-cpp-capacitor';
import { extractJSON, type Ask } from './client';
import { schemaToGrammar } from './grammar';

// Only the phone apps carry the llama.cpp engine. The Mac app and the browser do not.
export const DEVICE_OK = Capacitor.isNativePlatform();

type ModelFile = { name: string; url: string; bytes: number };
export type DeviceModel = { id: string; label: string; files: [ModelFile, ModelFile] };
const HF = 'https://huggingface.co';
// One model that reads both text and photos. files[0] is the language model, files[1] is its eyes.
// Chosen 2026-11-12 after running this app's three tasks against four small models: this was the only one that got
// the room counts, the receipt date and the scope right. Apache 2.0 licence. Pinned to one revision so it cannot change.
const REPO = `${HF}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/5037fcf163dd95d1e41d1974465f0898ed108ca2`;
export const MODEL: DeviceModel = {
  id: 'qwen2.5-vl-3b-q4',
  label: 'Qwen2.5-VL 3B',
  files: [
    { name: 'model.gguf', url: `${REPO}/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf`, bytes: 1_929_901_056 },
    { name: 'vision.gguf', url: `${REPO}/mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf`, bytes: 844_757_728 },
  ],
};
export const modelBytes = MODEL.files[0].bytes + MODEL.files[1].bytes;
export const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;

const DIR = 'ai-model';
const at = (f: ModelFile) => `${DIR}/${MODEL.id}-${f.name}`;
const size = async (path: string) => { try { return (await Filesystem.stat({ path, directory: Directory.Data })).size; } catch { return -1; } };
// A file counts only when it is whole.
const whole = (have: number, f: ModelFile) => have === f.bytes;

export async function installed() {
  if (!DEVICE_OK) return false;
  for (const f of MODEL.files) if (!whole(await size(at(f)), f)) return false;
  return true;
}

let downloading = false;
export const isDownloading = () => downloading;
/** Downloads whatever is missing. `on` gets the share done, 0 to 1, across both files. */
export async function install(on: (done: number) => void) {
  if (downloading) throw new Error('The download is already running.');
  downloading = true;
  let before = 0;
  const listener = await Filesystem.addListener('progress', p => on(Math.min(0.999, (before + p.bytes) / modelBytes)));
  try {
    await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {}); // fails when it exists, which is fine
    for (const f of MODEL.files) {
      if (!whole(await size(at(f)), f)) {
        const part = `${at(f)}.part`;
        try {
          await Filesystem.downloadFile({ url: f.url, path: part, directory: Directory.Data, recursive: true, progress: true, connectTimeout: 30000, readTimeout: 120000 });
        } catch {
          await Filesystem.deleteFile({ path: part, directory: Directory.Data }).catch(() => {});
          throw new Error('The download stopped. Check your connection and free space, then try again.');
        }
        const got = await size(part);
        if (!whole(got, f)) {
          await Filesystem.deleteFile({ path: part, directory: Directory.Data }).catch(() => {});
          throw new Error('The download came out incomplete. Try again on Wi-Fi.');
        }
        await Filesystem.deleteFile({ path: at(f), directory: Directory.Data }).catch(() => {});
        await Filesystem.rename({ from: part, to: at(f), directory: Directory.Data, toDirectory: Directory.Data });
      }
      before += f.bytes;
      on(Math.min(0.999, before / modelBytes));
    }
    on(1);
  } finally {
    downloading = false;
    listener.remove().catch(() => {});
  }
}

export async function remove() {
  await unload();
  await Filesystem.rmdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {});
}

// ── What it is doing, and a log to share when it misbehaves ───────────────────
let stageNow = '';
/** A short line for the screen: 'Loading the AI model', 'Reading the photo', 'Writing the answer'. */
export const stage = () => stageNow;
const LOG_KEY = 'bm-bids-ai-log';
let log: string[] = (() => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } })();
function note(line: string) {
  log = [...log, `${new Date().toISOString().slice(5, 19).replace('T', ' ')}  ${line}`].slice(-120);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* storage full: keep it in memory */ }
}
const secs = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
/** Timings and errors only. No photos, notes or answers are ever written here. */
export function diagnostics() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return [`B&M Bids on-phone AI log`, `model ${MODEL.id}`, `phone ${nav.userAgent.replace(/^.*?\((.*?)\).*$/, '$1')}`,
    `cores ${nav.hardwareConcurrency ?? '?'}, memory hint ${nav.deviceMemory ?? '?'} GB`, '', ...log].join('\n');
}
export const clearDiagnostics = () => { log = []; try { localStorage.removeItem(LOG_KEY); } catch { /* nothing to clear */ } };

// Fails with a clear message instead of leaving the screen spinning.
const within = <T>(p: Promise<T>, ms: number, message: string, onLate?: () => void) => new Promise<T>((ok, no) => {
  const t = setTimeout(() => { onLate?.(); no(new Error(message)); }, ms);
  p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); });
});
const LOAD_LIMIT = 3 * 60_000, ANSWER_LIMIT = 6 * 60_000;

// ── Running it ───────────────────────────────────────────────────────────────
let ctx: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let busy = false;
// The engine call still in flight. After a time limit we stop waiting, but the engine only notices the stop between
// words; while it is still reading a photo it keeps going. Until it really returns, no new answer may start and the
// model must not be freed, or the app can crash.
let running: Promise<void> | null = null;
const scheduleIdle = () => {
  clearTimeout(idle);
  idle = setTimeout(() => { if (!busy && !running) unload().catch(() => {}); }, 120000); // give the memory back after two quiet minutes
};

const filePath = async (path: string, directory: Directory) => (await Filesystem.getUri({ path, directory })).uri.replace(/^file:\/\//, '');

async function load(): Promise<LlamaContext> {
  if (ctx) return ctx;
  loading ??= (async () => {
    const { initLlama } = await import('llama-cpp-capacitor');
    const [model, vision] = await Promise.all(MODEL.files.map(f => filePath(at(f), Directory.Data)));
    const t0 = Date.now();
    // No n_threads: the patched engine counts the phone's fast cores itself and leaves the slow ones idle.
    const c = await initLlama({ model, n_ctx: 4096, n_batch: 512, n_gpu_layers: 0, use_mmap: true });
    // Plugin 0.2.2 on Android hands the model details back as one flat string, and its own chat code then crashes
    // reading chatTemplates. Give it the shape it expects (this model has a standard built-in chat template).
    const m = c.model as unknown;
    if (!m || typeof m !== 'object' || !(m as { chatTemplates?: unknown }).chatTemplates)
      (c as unknown as { model: unknown }).model = { chatTemplates: { llamaChat: true, minja: { default: true, toolUse: false } } };
    note(`model loaded in ${secs(t0)}`);
    const t1 = Date.now();
    try { await c.initMultimodal({ path: vision, use_gpu: false }); }
    catch (e) { await c.release().catch(() => {}); throw e; }
    note(`vision loaded in ${secs(t1)}`);
    ctx = c;
    if (!busy) scheduleIdle(); // a load that outlived its time limit must still give the memory back later
    return c;
  })().finally(() => { loading = null; });
  return loading;
}

/** Frees the memory the model takes (about as much as its download size). */
export async function unload() {
  clearTimeout(idle);
  if (running) await running; // never free the model under a running engine call
  const c = ctx; ctx = null;
  if (c) await c.release().catch(() => {});
}

// Phones read small pictures much faster, and the details that matter here survive the shrink.
const shrinkTo = (dataUrl: string, max: number) => new Promise<string>((ok, no) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    ok(cv.toDataURL('image/jpeg', 0.8));
  };
  img.onerror = () => no(new Error('Could not read that photo.'));
  img.src = dataUrl;
});

// Small models can get stuck repeating one list item. A length cap in the schema makes that impossible.
function capLists(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(capLists);
  if (!schema || typeof schema !== 'object') return schema;
  const o = Object.fromEntries(Object.entries(schema as Record<string, unknown>).map(([k, v]) => [k, capLists(v)]));
  if (o.type === 'array' && o.maxItems === undefined) o.maxItems = Math.min(6, ((o.items as { enum?: unknown[] })?.enum?.length) ?? 6);
  return o;
}

export async function askDevice(a: Ask): Promise<unknown> {
  if (!DEVICE_OK) throw new Error('On-phone AI only works in the phone app.');
  if (!(await installed())) throw new Error('Download the AI model in Settings first.');
  if (busy) throw new Error('The AI is still working on the last request.');
  if (running) throw new Error('The AI is still stopping the last request. Try again in a minute.');
  busy = true;
  clearTimeout(idle);
  const temp: string[] = [];
  try {
    let c: LlamaContext;
    const started = Date.now();
    note(`ask: ${(a.images || []).length} photo(s), ${a.prompt.length} characters${ctx ? ', model already loaded' : ''}`);
    stageNow = ctx ? 'Getting ready' : 'Loading the AI model';
    try { c = await within(load(), LOAD_LIMIT, 'timeout'); }
    catch (e) {
      const m = String((e as Error)?.message);
      note(`load failed after ${secs(started)}: ${m.slice(0, 200)}`);
      if (/INSUFFICIENT_MEMORY/.test(m)) throw new Error('Not enough free memory to start the AI right now. Close other apps and try again. Phones with less than 8 GB of memory may not manage it.');
      if (m === 'timeout') throw new Error('The AI model took more than 3 minutes to load, so it was stopped. Close other apps and try again.');
      throw new Error('This phone could not start the AI model. Close other apps and try again.');
    }
    const images: string[] = [];
    for (const [i, url] of (a.images || []).entries()) {
      // Rooms are judged fine at a smaller size and it is several times faster; receipts need the detail to be read.
      const small = await shrinkTo(url, a.detail === 'high' ? 896 : 672);
      const path = `ai-photo-${Date.now()}-${i}.jpg`;
      await Filesystem.writeFile({ path, directory: Directory.Cache, data: small.split(',')[1] });
      temp.push(path);
      images.push(await filePath(path, Directory.Cache));
    }
    // Each <__media__> marker is where one photo goes. The photos travel as file paths in media_paths_json, which the
    // patched plugin reads (patches/llama-cpp-capacitor-jni.patch); stock 0.2.2 drops images on Android.
    const text = images.map(() => '<__media__>\n').join('') + a.prompt;
    const schema = capLists(a.schema) as object;
    // The grammar is what makes the answer valid JSON in exactly our shape. It is built here because the plugin's own
    // converter is missing on Android (calling it crashes the app).
    stageNow = images.length ? (images.length > 1 ? 'Reading the photos' : 'Reading the photo') : 'Writing the answer';
    const t2 = Date.now();
    const call = c.completion({
      messages: [{ role: 'system', content: a.system }, { role: 'user', content: text }],
      jinja: true, enable_thinking: false, grammar: schemaToGrammar(schema),
      n_predict: 400, temperature: 0, // no randomness: the same photo should give the same answer
      ...(images.length ? { media_paths_json: JSON.stringify(images) } : {}),
    } as Parameters<LlamaContext['completion']>[0]);
    running = call.then(() => {}, () => {}).finally(() => { running = null; if (!busy) scheduleIdle(); });
    const r = await within(call, ANSWER_LIMIT, 'timeout', () => { c.stopCompletion().catch(() => {}); }).catch(e => {
      const m = String((e as Error)?.message);
      note(`answer failed after ${secs(t2)}: ${m.slice(0, 200)}`);
      if (m === 'timeout') throw new Error('The AI took more than 6 minutes, so it was stopped. Try fewer photos, or notes only. Settings has an AI log you can share.');
      throw new Error('The AI stopped before it finished. Try again.');
    });
    const res = r as { tokens_evaluated?: number; tokens_predicted?: number };
    note(`answer in ${secs(t2)}: read ${res.tokens_evaluated ?? '?'} tokens, wrote ${res.tokens_predicted ?? '?'}; total ${secs(started)}`);
    return extractJSON(String(r.content || r.text || ''));
  } finally {
    busy = false; stageNow = '';
    // Photo files stay until the engine is done with them.
    const cleanup = () => { for (const path of temp) Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); };
    if (running) running.then(cleanup); else { cleanup(); scheduleIdle(); }
  }
}
