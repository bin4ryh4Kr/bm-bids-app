import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

const cancelled = (e: unknown) => /cancel/i.test(String((e as Error)?.message ?? e));

// The Mac app passes files to a real Save dialog instead of a browser download.
type MacBridge = { postMessage: (m: unknown) => void };
const mac = () => (window as unknown as { webkit?: { messageHandlers?: { bmMac?: MacBridge } } }).webkit?.messageHandlers?.bmMac;

export async function shareFile(name: string, title: string, data: string, kind: 'pdf' | 'json') {
  const m = mac();
  if (m) { m.postMessage({ type: 'save', name, data, kind }); return; }
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, ...(kind === 'json' ? { encoding: Encoding.UTF8 } : {}) });
    await Share.share({ title, files: [uri], dialogTitle: title }).catch(e => { if (!cancelled(e)) throw e; });
    return;
  }
  if (kind === 'json') return download(new Blob([data], { type: 'application/json' }), name);
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  download(new Blob([bytes], { type: 'application/pdf' }), name);
}

export async function shareText(title: string, text: string) {
  const m = mac();
  if (m) { m.postMessage({ type: 'copy', text }); return 'Copied. Paste it into your email or messages.'; }
  if (Capacitor.isNativePlatform()) {
    try { await Share.share({ title, text, dialogTitle: title }); } catch (e) { if (cancelled(e)) return ''; throw e; }
    return 'Shared.';
  }
  await navigator.clipboard.writeText(text);
  return 'Copied.';
}
