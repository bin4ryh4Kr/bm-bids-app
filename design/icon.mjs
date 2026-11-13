// Draws the app icon. Run from a folder with puppeteer-core: node icon.mjs <out dir>
import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const defs = `<defs>
 <radialGradient id="bg" cx="50%" cy="34%" r="80%"><stop offset="0" stop-color="#2be0d6"/><stop offset=".42" stop-color="#0d9a9c"/><stop offset="1" stop-color="#04343a"/></radialGradient>
 <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".42" stop-color="#dfeef0"/><stop offset=".5" stop-color="#7f9aa2"/><stop offset=".56" stop-color="#eef7f8"/><stop offset="1" stop-color="#a9c2c8"/></linearGradient>
 <linearGradient id="wave" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ff5ea"/><stop offset="1" stop-color="#e9fffd"/></linearGradient>
 <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f6c343"/><stop offset="1" stop-color="#b9780f"/></linearGradient>
 <linearGradient id="handle" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a9c2c8"/><stop offset=".35" stop-color="#ffffff"/><stop offset=".6" stop-color="#dfeef0"/><stop offset="1" stop-color="#7f9aa2"/></linearGradient>
 <linearGradient id="straw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8dc"/><stop offset=".6" stop-color="#f3dc8e"/><stop offset="1" stop-color="#d9b257"/></linearGradient>
 <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
 <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#012225" flood-opacity=".75"/></filter>
</defs>`;
const sparkle = (x, y, r) => `<path d="M${x} ${y-r}C${x+r*.12} ${y-r*.2} ${x+r*.2} ${y-r*.12} ${x+r} ${y}C${x+r*.2} ${y+r*.12} ${x+r*.12} ${y+r*.2} ${x} ${y+r}C${x-r*.12} ${y+r*.2} ${x-r*.2} ${y+r*.12} ${x-r} ${y}C${x-r*.2} ${y-r*.12} ${x-r*.12} ${y-r*.2} ${x} ${y-r}Z"`;
// BidBroom: a chrome broom sweeping up sparkles, with the gold $ coin. No letters, so it reads at any size.
// The art sits inside the middle of the tile so Android's round masks never cut it.
const art = `
 <path d="M196 690c110 62 214-40 330-14s182 60 302-16c-40 116-174 176-320 166s-262-48-312-136z" fill="url(#wave)" opacity=".92"/>
 <path d="M226 734c96 40 196-30 306-8s150 40 246-8c-52 62-150 92-258 84s-226-22-294-68z" fill="#0d9a9c" opacity=".55"/>
 <g transform="translate(40 -10) rotate(32 512 520)" filter="url(#sh)">
  <rect x="490" y="180" width="44" height="410" rx="22" fill="url(#handle)" stroke="#033238" stroke-width="7"/>
  <path d="M440 612H584L662 852Q512 884 362 852Z" fill="url(#straw)" stroke="#033238" stroke-width="7" stroke-linejoin="round"/>
  <path d="M464 624L420 850" stroke="#c9a64a" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M488 624L468 850" stroke="#c9a64a" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M512 624L516 850" stroke="#c9a64a" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M536 624L564 850" stroke="#c9a64a" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M560 624L612 850" stroke="#c9a64a" stroke-width="5" stroke-linecap="round" opacity=".7"/>
  <rect x="446" y="566" width="132" height="58" rx="14" fill="url(#gold)" stroke="#7a4f06" stroke-width="6"/>
  <rect x="460" y="578" width="104" height="10" rx="5" fill="#fff6c9" opacity=".7"/>
 </g>
 <g filter="url(#sh)"><circle cx="300" cy="300" r="96" fill="url(#gold)" stroke="#7a4f06" stroke-width="6"/><circle cx="300" cy="300" r="75" fill="none" stroke="#fff6c9" stroke-opacity=".8" stroke-width="5"/>
 <text x="300" y="352" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="140" fill="#6f4705">$</text></g>
 ${sparkle(770, 600, 84)} fill="#fff" filter="url(#glow)" opacity=".85"/>${sparkle(770, 600, 76)} fill="#fff"/>
 ${sparkle(250, 560, 40)} fill="#fff"/>${sparkle(700, 790, 30)} fill="#fff"/>`;
const bg = `<rect width="1024" height="1024" fill="url(#bg)"/><ellipse cx="512" cy="-60" rx="760" ry="430" fill="#fff" opacity=".14"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}${body}</svg>`;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid slice">${defs}<rect width="1024" height="1024" fill="#04343a"/><g transform="translate(362 362) scale(.293)">${art}</g></svg>`;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev', headless: 'new' });
const p = await b.newPage();
async function shot(markup, file, size, transparent) {
  await p.setViewport({ width: size, height: size });
  await p.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${markup}`);
  await p.screenshot({ path: `${out}/${file}`, omitBackground: !!transparent });
}
await shot(svg(bg + `<g transform="translate(-31 -20) scale(1.06)">${art}</g>`), 'icon-only.png', 1024);
await shot(svg(`<g transform="translate(77 77) scale(.85)">${art}</g>`), 'icon-foreground.png', 1024, true);
await shot(svg(bg), 'icon-background.png', 1024);
await shot(splash, 'splash.png', 2732);
await shot(splash, 'splash-dark.png', 2732);
await b.close();
