import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Receipt, Trip } from './expenses';
import type { ComBid, commercial } from './calc';
import { balance, money2, niceDate, subtotal, taxOf, today, total, type Client, type Estimate, type Invoice, type Item } from './docs';
import { contractOpening, contractTitle, fillTerms, punchHours, type Contract, type Punch, type Worker } from './tools';
import { MAKER, type Company } from './rates';
import { mix, readable } from './theme';

let TEAL: [number, number, number] = [13, 135, 138];
let SOFT: [number, number, number] = [226, 242, 242];
const asRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export function setPdfColor(accent: string) { TEAL = asRgb(readable(accent, '#ffffff')); SOFT = asRgb(mix('#ffffff', accent, 0.12)); }
const INK: [number, number, number] = [30, 41, 43];
const M = 40, W = 612;

function frame(co: Company, title: string, label: string, number: string, date: string) {
  const d = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  if (co.logo) {
    const { width, height } = d.getImageProperties(co.logo);
    const k = Math.min(110 / width, 70 / height);
    d.addImage(co.logo, 'PNG', M, 28, width * k, height * k, 'logo', 'FAST');
  } else {
    d.setTextColor(...TEAL).setFont('helvetica', 'bold').setFontSize(15).text(d.splitTextToSize(co.name || 'Your Business', 260), M, 58);
  }
  d.setTextColor(...TEAL).setFont('helvetica', 'bold').setFontSize(20).text(title, W - M, 58, { align: 'right' });
  d.setTextColor(90).setFont('helvetica', 'normal').setFontSize(9).text(`${label}: ${number}     Date: ${niceDate(date)}`, W - M, 74, { align: 'right' });
  d.setDrawColor(...TEAL).setLineWidth(2).line(M, 104, W - M, 104);
  return d;
}

function section(d: jsPDF, y: number, text: string) {
  d.setFillColor(...TEAL).rect(M, y, W - 2 * M, 20, 'F');
  d.setTextColor(255).setFont('helvetica', 'bold').setFontSize(10).text(text.toUpperCase(), M + 8, y + 14);
  return y + 28;
}

function clientBlock(d: jsPDF, y: number, c: Client, heading: string) {
  d.setTextColor(...TEAL).setFont('helvetica', 'bold').setFontSize(8).text(heading.toUpperCase(), M, y);
  d.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(11);
  const lines = [c.name, c.street, c.city, [c.phone, c.email].filter(Boolean).join('   ')].filter(Boolean);
  lines.forEach((l, i) => d.text(l, M, y + 15 + i * 14));
  return y + 15 + lines.length * 14 + 6;
}

function itemsTable(d: jsPDF, y: number, items: Item[]) {
  autoTable(d, {
    startY: y, margin: { left: M, right: M },
    head: [['Service', 'Description', 'Qty', 'Rate', 'Amount']],
    body: items.map(i => [i.name, i.desc, String(i.qty), money2(i.price), money2(i.qty * i.price)]),
    styles: { fontSize: 9, textColor: INK, cellPadding: 5, lineColor: [205, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: SOFT, textColor: TEAL, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 130 }, 2: { cellWidth: 34, halign: 'center' }, 3: { cellWidth: 66, halign: 'right' }, 4: { cellWidth: 70, halign: 'right' } },
  });
  return (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
}

function totalsBox(d: jsPDF, y: number, rows: [string, string][], last: [string, string]) {
  const x = W - M - 230;
  autoTable(d, {
    startY: y, margin: { left: x, right: M }, tableWidth: 230, theme: 'grid',
    body: [...rows, last],
    styles: { fontSize: 9.5, textColor: INK, cellPadding: 5, lineColor: [205, 220, 220], lineWidth: 0.5 },
    columnStyles: { 0: { halign: 'right', fillColor: SOFT }, 1: { halign: 'right', cellWidth: 100 } },
    didParseCell: h => { if (h.row.index === rows.length) { h.cell.styles.fontStyle = 'bold'; if (h.column.index === 0) { h.cell.styles.fillColor = TEAL; h.cell.styles.textColor = 255; } } },
  });
  return (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
}

function room(d: jsPDF, y: number, need: number) {
  if (y + need < 730) return y;
  d.addPage();
  return 50;
}

function para(d: jsPDF, y: number, text: string, size = 9.5, color: number | [number, number, number] = 70) {
  d.setFont('helvetica', 'normal').setFontSize(size);
  if (Array.isArray(color)) d.setTextColor(...color); else d.setTextColor(color);
  const lines = d.splitTextToSize(text, W - 2 * M);
  d.text(lines, M, y);
  return y + lines.length * size * 1.3 + 8;
}

function footers(d: jsPDF, form: string, co: Company) {
  const n = d.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    d.setPage(p);
    d.setDrawColor(...TEAL).setLineWidth(0.5).line(M, 750, W - M, 750);
    d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(110);
    d.text([co.name, co.city].filter(Boolean).join('  |  '), M, 760);
    d.text([co.phone, co.email, co.web].filter(Boolean).join('  |  '), M, 769);
    d.text(`${form}  |  Pg ${p} of ${n}`, W - M, 769, { align: 'right' });
    d.setFontSize(6.5).setTextColor(140).textWithLink(`Made with B&M Bids, free from ${MAKER.name} (${MAKER.site})`, M, 779, { url: MAKER.url });
  }
}

const base64 = (d: jsPDF) => d.output('datauristring').split(',')[1];

function accept(d: jsPDF, y0: number, co: Company, what: string) {
  let y = room(d, y0, 110);
  y = section(d, y, 'Acceptance') + 8;
  y = para(d, y, `By signing below, the Client accepts this ${what} and authorizes ${co.name || 'us'} to schedule the work.`);
  y += 26;
  d.setDrawColor(120).setLineWidth(0.5);
  d.line(M, y, 330, y); d.line(350, y, W - M, y);
  d.setFontSize(8).setTextColor(90).text('Client signature', M, y + 11); d.text('Date', 350, y + 11);
}

// Long text that may run onto the next page.
function long(d: jsPDF, y0: number, text: string, size = 9.5) {
  let y = y0;
  d.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK);
  for (const line of d.splitTextToSize(text, W - 2 * M) as string[]) {
    if (y > 725) { d.addPage(); y = 50; d.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK); }
    d.text(line, M, y);
    y += size * 1.35;
  }
  return y + 8;
}

const grid = (d: jsPDF, y: number, head: string[], body: string[][]) => {
  autoTable(d, {
    startY: y, margin: { left: M, right: M, bottom: 60 }, head: [head], body,
    styles: { fontSize: 9, textColor: INK, cellPadding: 5, lineColor: [205, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: SOFT, textColor: TEAL, fontStyle: 'bold' },
  });
  return (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
};

export function proposalPDF(e: Estimate, co: Company, preparedBy: string, terms: string) {
  const d = frame(co, 'PROPOSAL', 'Proposal #', e.number, e.date);
  let y = clientBlock(d, 122, e.client, 'Prepared for');
  d.setTextColor(70).setFont('helvetica', 'normal').setFontSize(9);
  [preparedBy ? `Prepared by: ${preparedBy}` : '', `Valid until: ${niceDate(e.validUntil)}`].filter(Boolean).forEach((t, n) => d.text(t, W - M, 136 + n * 14, { align: 'right' }));
  if (co.tagline) y = para(d, y + 4, co.tagline, 12, TEAL);
  if (co.bio) { y = section(d, y, `About ${co.name || 'us'}`) + 6; y = long(d, y, co.bio, 10); }
  y = section(d, room(d, y, 90), 'What we will do') + 6;
  if (e.scope) y = long(d, y, e.scope, 10);
  y = itemsTable(d, y, e.items);
  y = section(d, room(d, y, 170), 'Your investment');
  const rows: [string, string][] = [['Subtotal', money2(subtotal(e))]];
  if (e.discount) rows.push(['Discount', money2(-e.discount)]);
  rows.push(['Sales Tax', money2(taxOf(e))]);
  y = totalsBox(d, y, rows, [e.recurring ? 'PER VISIT' : 'TOTAL', money2(total(e))]);
  if (e.options?.length) { y = section(d, y, 'Other schedules we can offer'); y = grid(d, y, ['Schedule', 'Per visit', 'Per month'], e.options.map(o => [o.name, money2(o.perVisit), money2(o.monthly)])); }
  const facts = [e.recurringRate && `Recurring rate: ${e.recurringRate}`, e.duration && `Estimated time: ${e.duration}`, e.deposit ? `Deposit to start: ${money2(e.deposit)}` : ''].filter(Boolean) as string[];
  d.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK); facts.forEach(f => { y = room(d, y, 20); d.text(f, M, y); y += 15; });
  if (e.notes) y = long(d, y + 4, e.notes, 10);
  if (terms) { y = section(d, room(d, y, 90), 'Terms') + 6; y = long(d, y, terms); }
  accept(d, y, co, 'proposal');
  footers(d, 'Proposal', co);
  return base64(d);
}

function signBlock(d: jsPDF, x: number, y: number, who: string, name: string, sign: string, date: string) {
  if (sign) { const { width, height } = d.getImageProperties(sign); const k = Math.min(200 / width, 46 / height); d.addImage(sign, 'PNG', x, y - height * k, width * k, height * k); }
  d.setDrawColor(120).setLineWidth(0.5).line(x, y, x + 240, y);
  d.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90).text(who, x, y + 11);
  d.text(`Name: ${name}`, x, y + 22);
  d.text(sign && date ? `Date: ${niceDate(date)}` : 'Date:', x, y + 33);
}

// Numbered sections with a bold heading, the way a contract reads.
function articles(d: jsPDF, y0: number, text: string) {
  let y = y0;
  const size = 9.5, width = W - 2 * M;
  for (const block of text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)) {
    const caps = !/[a-z]/.test(block) && !block.includes('\n');
    const m = caps ? [block, block, ''] : block.match(/^((?:\d+|[A-C])\.\s+[^.]+\.)\s*([\s\S]*)$/);
    if (m) {
      if (y > 700) { d.addPage(); y = 50; }
      d.setFont('helvetica', 'bold').setFontSize(size).setTextColor(...INK).text(m[1], M, y);
      y += size * 1.4;
    }
    d.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK);
    for (const line of d.splitTextToSize(m ? m[2] : block, width) as string[]) {
      if (y > 725) { d.addPage(); y = 50; d.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK); }
      d.text(line, M, y);
      y += size * 1.35;
    }
    y += 7;
  }
  return y;
}

export function contractPDF(c: Contract, co: Company) {
  const kind = c.kind ?? 'commercial';
  const d = frame(co, 'SERVICE AGREEMENT', 'Agreement #', c.number, c.date);
  d.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...INK).text((c.title_ || contractTitle(kind)).toUpperCase(), W / 2, 130, { align: 'center' });
  const { opening, sections } = contractOpening(c, co.name, co.city);
  let y = articles(d, 152, opening);
  if (c.intro) y = articles(d, y + 2, 'KEY TERMS');
  y = articles(d, y + 2, sections + '\n\n' + fillTerms(c));
  y = room(d, y, 150);
  y = long(d, y + 4, 'IN WITNESS WHEREOF, each party confirms it has read, understands, and agrees to this Agreement, and that the person signing is authorized to sign for that party.', 10) + 52;
  signBlock(d, M, y, `Provider: ${co.name || ''}`, c.ourName, c.ourSign, c.signedOn || c.sentOn || '');
  signBlock(d, 320, y, `Client: ${c.client.name}`, [c.theirName, c.title].filter(Boolean).join(', '), c.theirSign, c.signedOn);
  if (c.attach) {
    d.addPage();
    let z = section(d, 50, `Attached estimate ${c.attach.number}`);
    z = itemsTable(d, z, c.attach.items);
    const rows: [string, string][] = [['Subtotal', money2(subtotal(c.attach))]];
    if (c.attach.discount) rows.push(['Discount', money2(-c.attach.discount)]);
    rows.push(['Sales Tax', money2(taxOf(c.attach))]);
    z = totalsBox(d, z, rows, ['ESTIMATED TOTAL', money2(total(c.attach))]);
    const facts = [c.attach.recurringRate, c.attach.duration, c.attach.deposit ? `Deposit: ${money2(c.attach.deposit)}` : '', c.attach.notes].filter(Boolean).join('\n\n');
    if (facts) long(d, z, facts, 10);
  }
  if (c.afterSign) { d.addPage(); articles(d, 56, c.afterSign); }
  if (c.signToken && c.theirSign) {
    d.addPage();
    let z = section(d, 50, 'Signature certificate') + 4;
    z = grid(d, z, ['Item', 'Record'], [['Document', `${c.title_ || contractTitle(kind)} ${c.number}`], ['Signed by', c.theirName], ['Signed at', c.signedAt || c.signedOn], ['IP address', c.signIp || ''], ['Device', c.signDevice || ''], ['Document fingerprint (SHA-256)', c.pdfSha || ''], ['Signing record', c.signToken.slice(0, 12) + '...']]);
    para(d, z, 'The signer read the document online, confirmed consent, and signed electronically through a private link.');
  }
  footers(d, 'Service agreement', co);
  return base64(d);
}

type ComResult = ReturnType<typeof commercial>;
export function jobCostPDF(b: ComBid, r: ComResult, co: Company) {
  const d = frame(co, 'INTERNAL JOB COST', 'Job', b.client || 'Unnamed', today());
  d.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...TEAL).text('INTERNAL ONLY. DO NOT SEND TO THE CLIENT.', M, 122);
  let y = grid(d, 134, ['Per visit', 'Amount'], [['Crew labor', money2(r.labor)], ['Drive time + mileage', money2(r.drive)], ['Supplies', money2(r.supplies)], ['Overhead', money2(r.overhead)], ['Profit', money2(r.profit)], ['Price', money2(r.price)]]);
  y = grid(d, y, ['Measure', 'Value'], [['Square feet', r.sqft.toLocaleString('en-US')], ['Labor hours per visit', r.hours.toFixed(2)], ['Time on site', `${r.onsite.toFixed(2)} hrs with ${r.crew} cleaner(s)`], ['Loaded labor rate', money2(r.loaded) + ' per hour'], ['Earned per labor hour', money2(r.perHour)], ['Labor as % of price', Math.round(r.laborPct) + '%'], ['Margin after overhead', Math.round(r.margin) + '%'], ['Price per sq ft, per visit', '$' + r.priceSqft.toFixed(3)], ['Cost per sq ft, per visit', '$' + r.costSqft.toFixed(3)], ['Visits per month', r.visitsMo.toFixed(2)], ['Monthly price', money2(r.monthly)], ['Monthly cost', money2(r.costMonth)], ['Scheduled extras, monthly average', money2(r.extrasMonth)]]);
  const rooms = b.rooms.filter(x => x.sqft > 0);
  if (rooms.length) grid(d, room(d, y, 80), ['Room', 'Sq ft', 'Floor'], rooms.map(x => [x.name, x.sqft.toLocaleString('en-US'), x.floor || 'Same as the space']));
  footers(d, 'Internal job cost', co);
  return base64(d);
}

export function estimatePDF(e: Estimate, co: Company, preparedBy: string, terms: string) {
  const d = frame(co, 'SERVICE ESTIMATE', 'Estimate #', e.number, e.date);
  let y = clientBlock(d, 122, e.client, 'Prepared for');
  d.setTextColor(70).setFont('helvetica', 'normal').setFontSize(9);
  [preparedBy ? `Prepared by: ${preparedBy}` : '', `Valid until: ${niceDate(e.validUntil)}`].filter(Boolean).forEach((t, n) => d.text(t, W - M, 136 + n * 14, { align: 'right' }));
  y = section(d, y, 'Proposed services');
  y = itemsTable(d, y, e.items);
  const rows: [string, string][] = [['Subtotal', money2(subtotal(e))], ['Materials & Supplies', 'Included']];
  if (e.discount) rows.push(['Discount', money2(-e.discount)]);
  rows.push(['Sales Tax', money2(taxOf(e))]);
  y = totalsBox(d, y, rows, ['ESTIMATED TOTAL', money2(total(e))]);
  const facts = [
    e.deposit ? `Deposit to reserve date: ${money2(e.deposit)}` : '',
    e.recurringRate ? `Recurring rate: ${e.recurringRate}` : '',
    e.duration ? `Estimated duration: ${e.duration}` : '',
  ].filter(Boolean);
  if (facts.length) { d.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK); facts.forEach(f => { d.text(f, M, y); y += 15; }); y += 4; }
  if (e.notes) y = para(d, y, e.notes, 10, INK);
  if (terms) {
    y = room(d, y, 190);
    y = section(d, y, 'Terms') + 8;
    y = para(d, y, terms);
  }
  accept(d, y, co, 'estimate');
  footers(d, 'Estimate', co);
  return base64(d);
}

export function invoicePDF(i: Invoice, co: Company, terms: string) {
  const d = frame(co, 'INVOICE', 'Invoice #', i.number, i.date);
  let y = clientBlock(d, 122, i.client, 'Bill to');
  d.setTextColor(70).setFont('helvetica', 'normal').setFontSize(9);
  [`Due: ${niceDate(i.dueDate)}`, `Terms: ${i.terms}`, i.jobRef ? `Job #: ${i.jobRef}` : ''].filter(Boolean)
    .forEach((t, n) => d.text(t, W - M, 136 + n * 14, { align: 'right' }));
  y = Math.max(y, 184);
  y = section(d, y, 'Services provided');
  y = itemsTable(d, y, i.items);
  const rows: [string, string][] = [['Subtotal', money2(subtotal(i))]];
  if (i.discount) rows.push(['Discount', money2(-i.discount)]);
  rows.push(['Sales Tax', money2(taxOf(i))]);
  if (i.credit) rows.push(['Less: Deposit / Payments', money2(-i.credit)]);
  const paid = i.status === 'Paid';
  y = totalsBox(d, y, rows, [paid ? 'PAID' : 'BALANCE DUE', paid ? `${money2(balance(i))}${i.paidDate ? ' on ' + niceDate(i.paidDate) : ''}` : money2(balance(i))]);
  if (i.notes) y = para(d, y, i.notes, 10, INK);
  if (!paid) {
    y = room(d, y, 110);
    if (co.pay) {
      const lines: string[] = d.setFont('helvetica', 'normal').setFontSize(10).splitTextToSize(co.pay, W - 2 * M - 20);
      const h = 34 + lines.length * 13;
      d.setFillColor(...SOFT).rect(M, y, W - 2 * M, h, 'F');
      d.setFont('helvetica', 'bold').setTextColor(...TEAL).text('How to pay', M + 10, y + 16);
      d.setFont('helvetica', 'normal').setTextColor(...INK).text(lines, M + 10, y + 31);
      y += h + 12;
    }
    if (terms) y = para(d, y, terms, 8.5, 100);
  }
  d.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TEAL).text(`Thank you for choosing ${co.name || 'us'}!`, W / 2, y + 8, { align: 'center' });
  footers(d, 'Invoice', co);
  return base64(d);
}

function report(co: Company, title: string, period: string, head: string[], body: string[][], totals: [string, string][], form: string) {
  const d = frame(co, title, 'Period', period, today());
  autoTable(d, {
    startY: 120, margin: { left: M, right: M, bottom: 60 }, head: [head], body,
    styles: { fontSize: 9, textColor: INK, cellPadding: 5, lineColor: [205, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: SOFT, textColor: TEAL, fontStyle: 'bold' },
  });
  const y = (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  totalsBox(d, room(d, y, 30 * totals.length), totals.slice(0, -1), totals[totals.length - 1]);
  footers(d, form, co);
  return base64(d);
}

export function receiptsPDF(list: Receipt[], period: string, co: Company) {
  const cats = [...new Set(list.map(r => r.category))].sort();
  const rows: [string, string][] = cats.map(c => [c, money2(list.filter(r => r.category === c).reduce((s, r) => s + r.total, 0))]);
  return report(co, 'EXPENSE REPORT', period, ['Date', 'Store', 'Category', 'Total'], list.map(r => [niceDate(r.date), r.merchant, r.category, money2(r.total)]),
    [...rows, ['TOTAL', money2(list.reduce((s, r) => s + r.total, 0))]], 'Expense report');
}

export function milesPDF(list: Trip[], period: string, co: Company) {
  return report(co, 'MILEAGE LOG', period, ['Date', 'From', 'To', 'Business purpose', 'Miles', 'Rate', 'Value'],
    list.map(t => [niceDate(t.date), t.from, t.to, t.purpose, t.miles.toFixed(1), '$' + t.rate.toFixed(3), money2(t.miles * t.rate)]),
    [['Total miles', list.reduce((s, t) => s + t.miles, 0).toFixed(1)], ['TOTAL VALUE', money2(list.reduce((s, t) => s + t.miles * t.rate, 0))]], 'Mileage log');
}

export function timesheetPDF(list: Punch[], workers: Worker[], period: string, co: Company, totals: [string, string][]) {
  const who = (id: string) => workers.find(w => w.id === id)?.name || 'Removed';
  return report(co, 'TIMESHEET', period, ['Date', 'Worker', 'Job', 'In', 'Out', 'Break', 'Hours'],
    list.map(p => [niceDate(p.date), who(p.worker), p.client, p.in, p.out, p.breakMin ? `${p.breakMin} min` : '', punchHours(p).toFixed(2)]), totals, 'Timesheet');
}
