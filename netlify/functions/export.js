// netlify/functions/export.js
// Jonathan's Daily Task List — .docx export
// v7: removed all page break logic — sections flow organically across pages

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        BorderStyle, WidthType, ShadingType, VerticalAlign, AlignmentType,
        ImageRun, Header, Tab, TabStopType } = require('docx');
const fs   = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")   return { statusCode: 405, headers, body: "Method not allowed" };

  try {
    // ── Load data from POST body ───────────────────────────────────────────
    const body = JSON.parse(event.body);
    const T    = body.tasks  || {};
    const pillar = body.pillar && body.pillar.text ? body.pillar : null;

    // DBR and Proposals: Out use Prospect / P3 / P2 / Tentative. Old High / Med / Low values
    // are not shown there (matches the on-screen app); the stored data itself is untouched.
    ['dbr', 'proposals_out'].forEach(k => {
      if (Array.isArray(T[k])) T[k] = T[k].map(t =>
        (['high', 'med', 'low'].includes(t.priority) || ['P1', 'P2', 'P3'].includes(t.p))
          ? { ...t, priority: 'none', p: undefined } : t);
    });

    // Sort DBR and Proposals: Out the same way as the app (Definite first; Proposals then Tentative, P2, P3, Prospect)
    const RANK_PO = { definite: 0, tentative: 1, p2: 2, p3: 3, prospect: 4, none: 5 };
    const rankOf = (sid, t) => { const p = t.priority || 'none'; if (p === 'definite') return 0; return sid === 'proposals_out' ? (RANK_PO[p] !== undefined ? RANK_PO[p] : 5) : 1; };
    ['dbr', 'proposals_out'].forEach(k => {
      if (Array.isArray(T[k])) T[k] = T[k].map((t, i) => ({ t, i, r: rankOf(k, t) })).sort((a, b) => a.r - b.r || a.i - b.i).map(o => o.t);
    });

    // Tasks labeled GMCVB appear only in the GMCVB Leads table (DBR first, then Funnel)
    const GM = [];
    ['dbr', 'proposals_out'].forEach(k => {
      if (!Array.isArray(T[k])) return;
      T[k].filter(t => t.text && t.priority === 'gmcvb').forEach(t => GM.push({ ...t, _src: k === 'dbr' ? 'DBR' : 'FUNNEL' }));
      T[k] = T[k].filter(t => t.priority !== 'gmcvb');
    });

    // ── Date / time helpers ────────────────────────────────────────────────
    const TZ  = 'America/New_York';
    const NOW = new Date();
    const DATE_STR = NOW.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ
    });
     TIME_STR = NOW.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ
    });
     DATE_TIME_STR = DATE_STR + ' · ' + TIME_STR;

    function getDBRDate() {
      const n = new Date(), day = n.getDay(), h = n.getHours();
      let d = new Date(n);
      if (day === 0) d.setDate(d.getDate() + 1);
      else if (day === 6) d.setDate(d.getDate() + 2);
      else if (h >= 9) {
        d.setDate(d.getDate() + (day === 5 ? 3 : 1));
        if (d.getDay() === 6) d.setDate(d.getDate() + 2);
        if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      }
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
    }

    function getCultureClubDate() {
      const anchor = new Date('2026-03-18T14:30:00');
      const nowMT  = new Date(NOW.toLocaleString('en-US', { timeZone: TZ }));
      let next = new Date(anchor);
      while (next <= nowMT) next.setDate(next.getDate() + 14);
      return next.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ
      }).replace(/,\s+\d{4}$/, '') + ' @ 2:30 PM';
    }

    function getAffinityDate() {
      const anchor = new Date('2026-03-26T11:00:00');
      const nowMT  = new Date(NOW.toLocaleString('en-US', { timeZone: TZ }));
      let next = new Date(anchor);
      while (next <= nowMT) next.setDate(next.getDate() + 28);
      return next.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ
      }).replace(/,\s+\d{4}$/, '') + ' @ 11:00 AM';
    }

    function fmt(s) {
      if (!s) return '';
      const p = s.split('-');
      if (p.length !== 3) return s;
      return parseInt(p[1], 10) + '/' + parseInt(p[2], 10) + '/' + String(parseInt(p[0], 10)).slice(-2);
    }

    function fmtDue(s) {
      if (!s) return '';
      const p = s.split('-');
      if (p.length !== 3) return s;
      return 'Due: ' + parseInt(p[1], 10) + '/' + parseInt(p[2], 10) + '/' + String(parseInt(p[0], 10)).slice(-2);
    }

    // ── Design constants ───────────────────────────────────────────────────
    // The James brand typography: Gramers Light (headline), Roboto Medium (sub headline), Roboto Regular (body)
    const FONT = 'Roboto';
    const HEAD = 'Gramers Light';
    const SUBF = 'Roboto Medium';
    const W    = 10800;   // content width DXA (0.5" margins each side)
    const HW   = 5400;    // half width
    const TW   = 3600;    // third width (equal thirds)

    const C = {
      hdr:    '1F3864',   // navy
      sub:    '2E5FA0',   // medium blue
      perpBg: 'DDEEFF',
      highBg: 'FFEDED',
      alt:    'F7F7F7',
      white:  'FFFFFF',
      bdr:    'BBBBBB',
    };

    const bdr  = { style: BorderStyle.SINGLE, size: 1, color: C.bdr };
    const B    = { top: bdr, bottom: bdr, left: bdr, right: bdr };
    const NB   = {
      top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };

    // ── Cell / row helpers ─────────────────────────────────────────────────
    function tbg(t, ri) {
      if (t.perpetual)          return C.perpBg;
      if (t.priority === 'high' || t.p === 'P1') return C.highBg;
      return ri % 2 === 1 ? C.alt : C.white;
    }

    // Build the inline runs for a task row
    function taskRuns(t, showArr, showDR, showDue, showNotes, opts) {
      const noMeta = !!(opts && opts.noMeta);
      const ch = [];
      ch.push(new TextRun({ text: '☐ ', font: 'Segoe UI Symbol', size: 17 }));

      const isHigh = t.priority === 'high' || t.p === 'P1';
      const label  = t.text || t.t || '';

      // New labels (Prospect / P3 / P2 / Tentative) lead the line, before the task name
      const leadColors = { definite: '7A5A00', prospect: '2C4A7C', p3: '2E6B34', p2: '9A5B00', tentative: '6A3D99' };
      const leadNames  = { definite: 'DEFINITE', prospect: 'PROSPECT', p3: 'P3', p2: 'P2', tentative: 'TENTATIVE' };
      const hasLead = !!leadNames[t.priority];
      if (opts && opts.src) ch.push(new TextRun({ text: '[' + opts.src + '] ', font: FONT, size: 14, bold: true, color: '7A7A7A' }));
      if (hasLead) ch.push(new TextRun({ text: '[' + leadNames[t.priority] + '] ', font: FONT, size: 14, bold: true, color: leadColors[t.priority] }));

      // Task text — bold if high priority
      ch.push(new TextRun({ text: label, font: FONT, size: 17, bold: isHigh }));

      // Perpetual marker
      if (t.perpetual) ch.push(new TextRun({ text: ' [∞]', font: FONT, size: 14, bold: true, color: '1F4E79' }));

      // Priority badge
      const pMap = { high: 'HIGH', P1: 'HIGH', med: 'MED', P2: 'MED', low: 'LOW', P3: '',
                     definite: 'DEFINITE', prospect: 'PROSPECT', p3: 'P3', p2: 'P2', tentative: 'TENTATIVE' };
      const newColors = { definite: '7A5A00', prospect: '2C4A7C', p3: '2E6B34', p2: '9A5B00', tentative: '6A3D99' };
      const pLbl = pMap[t.priority || t.p] || '';
      if (pLbl && !hasLead) {
        const pColor = newColors[t.priority] || (isHigh ? '9B1111' : '8B5E00');
        ch.push(new TextRun({ text: ' [' + pLbl + ']', font: FONT, size: 14, bold: true, color: pColor }));
      }

      // Dollar value (follows the task through DBR, Proposals and Contracts)
      if (!noMeta && t.value !== undefined && t.value !== null && t.value !== '') {
        ch.push(new TextRun({ text: ' $' + Number(t.value).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(t.value)) ? 0 : 2, maximumFractionDigits: 2 }), font: FONT, size: 14, color: '1E5E2E', bold: true }));
      }

      // Arrival date (proposals/contracts)
      if (!noMeta && showArr === 'dec') {
        // DBR: Decision Date (burgundy) and Arrival Date (blue), same colors as Proposals: Out
        if (t.arrival) ch.push(new TextRun({ text: ' Decision: ' + fmt(t.arrival), font: FONT, size: 14, color: '8B2635', bold: true }));
        if (t.arrDate) ch.push(new TextRun({ text: ' Arrival: ' + fmt(t.arrDate), font: FONT, size: 14, color: '1F5FA8', bold: true }));
      } else if (!noMeta && showArr && t.arrival) {
        ch.push(new TextRun({ text: ' Arr: ' + fmt(t.arrival), font: FONT, size: 14, color: '2E6B00', bold: true }));
      }

      // Travel date range
      if (showDR && (t.travelStart || t.travelEnd)) {
        const r = (t.travelStart ? fmt(t.travelStart) : '?') + ' to ' + (t.travelEnd ? fmt(t.travelEnd) : '?');
        ch.push(new TextRun({ text: ' ' + r, font: FONT, size: 14, color: '2E6B00', bold: true }));
      }

      // Task due date
      if (showDue && t.dueDate) {
        ch.push(new TextRun({ text: '  ' + fmtDue(t.dueDate), font: FONT, size: 14, color: '8B2635', bold: true }));
      }

      // Hot Dates time field
      if (t.time) {
        ch.push(new TextRun({ text: ' @ ' + t.time, font: FONT, size: 14, color: '2E5FA0', bold: true }));
      }

      return ch;
    }

    function mkCell(t, w, showArr, showDR, showDue, ri, opts) {
      const children = [new Paragraph({ children: taskRuns(t, showArr, showDR, showDue, false, opts) })];
      // Per-task notes (italic, indented)
      if (t.notes && t.notes.trim()) {
        children.push(new Paragraph({
          children: [new TextRun({ text: t.notes.trim(), font: FONT, size: 15, color: '666666', italics: true })],
          indent: { left: 180 },
          spacing: { before: 0, after: 20 },
        }));
      }
      return new TableCell({
        borders: B,
        width: { size: w, type: WidthType.DXA },
        shading: { fill: tbg(t, ri), type: ShadingType.CLEAR },
        margins: { top: 48, bottom: 48, left: 100, right: 100 },
        children,
      });
    }

    function emCell(w, ri) {
      return new TableCell({
        borders: B,
        width: { size: w, type: WidthType.DXA },
        shading: { fill: ri % 2 === 1 ? C.alt : C.white, type: ShadingType.CLEAR },
        margins: { top: 48, bottom: 48, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: ' ', font: FONT, size: 17 })] })],
      });
    }

    function hCell(title, w, span) {
      return new TableCell({
        columnSpan: span || 1,
        borders: B,
        width: { size: w, type: WidthType.DXA },
        shading: { fill: C.hdr, type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({
          keepNext: true,
          children: [new TextRun({ text: title, font: HEAD, size: 22, color: 'FFFFFF' })],
        })],
      });
    }

    function shCell(title, w) {
      return new TableCell({
        borders: B,
        width: { size: w, type: WidthType.DXA },
        shading: { fill: C.sub, type: ShadingType.CLEAR },
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
        children: [new Paragraph({
          children: [new TextRun({ text: title, font: SUBF, size: 16, color: 'FFFFFF' })],
        })],
      });
    }

    function divCell(label, color, bg, w, span) {
      return new TableCell({
        columnSpan: span || 1,
        borders: B,
        width: { size: w, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: { top: 28, bottom: 28, left: 100, right: 100 },
        children: [new Paragraph({
          children: [new TextRun({ text: label, font: FONT, size: 13, bold: true, color, italics: true })],
        })],
      });
    }

    function sp(after) {
      return new Paragraph({ spacing: { before: 0, after: after || 70 }, children: [] });
    }

    function addSec(ch, tbl) { if (tbl) { ch.push(tbl); ch.push(sp(70)); } }

    // ── Section builders ───────────────────────────────────────────────────

    // Proposals / Contracts: side-by-side split with sub-headers
    function buildSplit(title, lLabel, lTasks, rLabel, rTasks, showArr) {
      const lActive = lTasks.filter(t => !t.done && (t.text || t.t));
      const rActive = rTasks.filter(t => !t.done && (t.text || t.t));
      if (!lActive.length && !rActive.length) return null;
      const rows = [];
      rows.push(new TableRow({ cantSplit: true, keepLines: true, children: [hCell(title, W, 2)] }));
      rows.push(new TableRow({ cantSplit: true, children: [shCell(lLabel, HW), shCell(rLabel, HW)] }));
      const max = Math.max(lActive.length, rActive.length, 1);
      for (let i = 0; i < max; i++) {
        rows.push(new TableRow({ children: [
          lActive[i] ? mkCell(lActive[i], HW, showArr, false, false, i) : emCell(HW, i),
          rActive[i] ? mkCell(rActive[i], HW, showArr, false, false, i) : emCell(HW, i),
        ]}));
      }
return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [HW, HW], rows });
    }

    // Proposals: Out with color-coded Decision Date / Arrival Date / Value columns
    function buildProposals(tasks, title) {
      const active = tasks.filter(t => !t.done && (t.text || t.t));
      if (!active.length) return null;
      const cw = [5400, 1800, 1800, 1800];
      const col = { dec: '8B2635', arr: '1F5FA8', val: '1E5E2E' };
      const money = v => { const n = Number(v); return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); };
      function dCell(text, w, color, ri, t, head) {
        return new TableCell({
          borders: B, width: { size: w, type: WidthType.DXA },
          shading: { fill: head ? 'F2F2F2' : tbg(t, ri), type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 48, bottom: 48, left: 80, right: 80 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: text || '', font: head ? SUBF : FONT, size: head ? 14 : 16, bold: !head, color })] })],
        });
      }
      const rows = [new TableRow({ cantSplit: true, keepLines: true, children: [hCell(title || 'Funnel', W, 4)] })];
      rows.push(new TableRow({ cantSplit: true, children: [
        dCell('', cw[0], '404040', 0, null, true),
        dCell('DECISION DATE', cw[1], col.dec, 0, null, true),
        dCell('ARRIVAL DATE', cw[2], col.arr, 0, null, true),
        dCell('VALUE', cw[3], col.val, 0, null, true) ] }));
      active.forEach((t, i) => {
        const hasV = t.value !== undefined && t.value !== null && t.value !== '';
        rows.push(new TableRow({ children: [
          mkCell(t, cw[0], false, false, false, i, { noMeta: true, src: t._src }),
          dCell(t.arrival ? fmt(t.arrival) : '', cw[1], col.dec, i, t),
          dCell(t.arrDate ? fmt(t.arrDate) : '', cw[2], col.arr, i, t),
          dCell(hasV ? money(t.value) : '', cw[3], col.val, i, t) ] }));
      });
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cw, rows });
    }

    // Single full-width column (used for Proposals: Out)
    function buildFull(title, tasks, showArr) {
      const active = tasks.filter(t => !t.done && (t.text || t.t));
      if (!active.length) return null;
      const rows = [new TableRow({ cantSplit: true, keepLines: true, children: [hCell(title, W, 1)] })];
      active.forEach((t, i) => rows.push(new TableRow({ children: [mkCell(t, W, showArr, false, false, i)] })));
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows });
    }

    // Contracts (3-way): Prep / Out / Closed side-by-side with sub-headers
    function buildSplit3(title, l1Label, l1Tasks, l2Label, l2Tasks, l3Label, l3Tasks, showArr) {
      const a1 = l1Tasks.filter(t => !t.done && (t.text || t.t));
      const a2 = l2Tasks.filter(t => !t.done && (t.text || t.t));
      const a3 = l3Tasks.filter(t => !t.done && (t.text || t.t));
      if (!a1.length && !a2.length && !a3.length) return null;
      const rows = [];
      rows.push(new TableRow({ cantSplit: true, keepLines: true, children: [hCell(title, W, 3)] }));
      rows.push(new TableRow({ cantSplit: true, children: [shCell(l1Label, TW), shCell(l2Label, TW), shCell(l3Label, TW)] }));
      const max = Math.max(a1.length, a2.length, a3.length, 1);
      for (let i = 0; i < max; i++) {
        rows.push(new TableRow({ children: [
          a1[i] ? mkCell(a1[i], TW, showArr, false, false, i) : emCell(TW, i),
          a2[i] ? mkCell(a2[i], TW, showArr, false, false, i) : emCell(TW, i),
          a3[i] ? mkCell(a3[i], TW, showArr, false, false, i) : emCell(TW, i),
        ]}));
      }
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [TW, TW, TW], rows });
    }

    // One pipeline line: label, task count and value on tab stops
    function pipeCell(p, w) {
      return new TableCell({
        borders: B, width: { size: w, type: WidthType.DXA },
        shading: { fill: p.fill || C.white, type: ShadingType.CLEAR },
        margins: { top: 48, bottom: 48, left: 100, right: 100 },
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: 3500 }, { type: TabStopType.RIGHT, position: w - 200 }],
          children: [
            new TextRun({ text: p.label, font: FONT, size: 17, bold: true, color: p.color || '222222' }),
            new TextRun({ children: [new Tab(), p.n + (p.n === 1 ? ' task' : ' tasks')], font: FONT, size: 16, color: '555555' }),
            new TextRun({ children: [new Tab(), p.v], font: FONT, size: 17, bold: true, color: '1E5E2E' }),
          ],
        })],
      });
    }

    // Three equal columns (Hot Dates, Prospecting, One on One Items)
    function buildTriple(cols) {
      const act = cols.map(c => c.tasks.filter(t => !t.done && (t.text || t.t)));
      if (!act.some(a => a.length)) return null;
      const rows = [new TableRow({ cantSplit: true, keepLines: true, children: cols.map(c => hCell(c.title, TW, 1)) })];
      const max = Math.max(...act.map(a => a.length), 1);
      for (let i = 0; i < max; i++) {
        rows.push(new TableRow({ children: cols.map((c, ci) => act[ci][i] ? mkCell(act[ci][i], TW, false, !!c.showDR, false, i) : emCell(TW, i)) }));
      }
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [TW, TW, TW], rows });
    }

    // Pipeline + DBR side by side (no sub-header row, separate navy headers)
    function buildDual(lTitle, lTasks, lArr, lDR, rTitle, rTasks, rArr, rDR, lItems) {
      const lActive = lTasks.filter(t => !t.done && (t.text || t.t));
      const rActive = rTasks.filter(t => !t.done && (t.text || t.t));

      function sideItems(tasks, sa, sd) {
        const items = [];
        const perp  = tasks.filter(t => t.perpetual);
        const high  = tasks.filter(t => !t.perpetual && (t.priority === 'high' || t.p === 'P1'));
        const rest  = tasks.filter(t => !t.perpetual && t.priority !== 'high' && t.p !== 'P1');
        let ri = 0;
        if (perp.length) {
          items.push({ div: true, label: 'Perpetual', color: '1F4E79', bg: 'E8F0FA' });
          perp.forEach(t => items.push({ t, ri: ri++, sa, sd }));
        }
        if (high.length) {
          items.push({ div: true, label: 'High Priority', color: 'AA0000', bg: 'FFF0F0' });
          high.forEach(t => items.push({ t, ri: ri++, sa, sd }));
        }
        if ((perp.length || high.length) && rest.length)
          items.push({ div: true, label: 'Today', color: '404040', bg: 'F2F2F2' });
        rest.forEach(t => items.push({ t, ri: ri++, sa, sd }));
        return items;
      }

      function bCell(item, w) {
        if (!item) return emCell(w, 0);
        if (item.div) return divCell(item.label, item.color, item.bg, w);
        if (item.pipe) return pipeCell(item.pipe, w);
        return mkCell(item.t, w, item.sa, item.sd, false, item.ri);
      }

      const li = lItems || sideItems(lActive, lArr, lDR);
      const ri = sideItems(rActive, rArr, rDR);
      if (!li.length && !ri.length) return null;

      const max  = Math.max(li.length, ri.length);
      const rows = [];
      rows.push(new TableRow({ cantSplit: true, children: [hCell(lTitle, HW), hCell(rTitle, HW)] }));
      for (let i = 0; i < max; i++) {
        rows.push(new TableRow({ children: [bCell(li[i] || null, HW), bCell(ri[i] || null, HW)] }));
      }
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [HW, HW], rows });
    }

    // Tasks / Prospecting / Hot Dates: two-column with divider rows
    // maxRows: optional cap on rendered table rows (not counting header) to prevent overflow
    function buildTwoCol(title, tasks, showArr, showDR, showDue, mode, maxRows) {
      const active = tasks.filter(t => !t.done && (t.text || t.t));
      if (!active.length) return null;

      const perp   = active.filter(t => t.perpetual);
      const high   = active.filter(t => !t.perpetual && (t.priority === 'high' || t.p === 'P1'));
      const rest   = active.filter(t => !t.perpetual && t.priority !== 'high' && t.p !== 'P1');
      const sorted = mode === 'travel' ? active : [...perp, ...high, ...rest];
      const mid    = Math.ceil(sorted.length / 2);
      const left   = sorted.slice(0, mid);
      const right  = sorted.slice(mid);

      function colCells(items, offset) {
        const cells = [];
        if (mode === 'travel') {
          const nowMT = new Date(NOW.toLocaleString('en-US', { timeZone: TZ }));
          const cut30 = new Date(nowMT); cut30.setDate(cut30.getDate() + 30);
          const cut60 = new Date(nowMT); cut60.setDate(cut60.getDate() + 60);
          let sh30 = false, sh60 = false;
          items.forEach((t, i) => {
            const sd      = t.travelStart ? new Date(t.travelStart + 'T00:00:00') : null;
            const in30    = sd && sd <= cut30;
            const in60    = sd && sd > cut30 && sd <= cut60;
            if (in30 && !sh30) { cells.push(divCell('Next 30 days', '9B1111', 'FFF0F0', HW)); sh30 = true; }
            if (in60 && !sh60) { cells.push(divCell('Next 60 days', '2E6B00', 'EAF3DE', HW)); sh60 = true; }
            cells.push(mkCell(t, HW, showArr, showDR, showDue, i + offset));
          });
        } else {
          let shPerp = false, shHigh = false, shToday = false;
          items.forEach((t, i) => {
            const isPerp = !!t.perpetual;
            const isHi   = (t.priority === 'high' || t.p === 'P1') && !isPerp;
            if (isPerp && !shPerp) { cells.push(divCell('Perpetual',    '1F4E79', 'E8F0FA', HW)); shPerp = true; }
            if (isHi   && !shHigh) { cells.push(divCell('High Priority','AA0000', 'FFF0F0', HW)); shHigh = true; }
            if (!isPerp && !isHi && !shToday) { cells.push(divCell('Today','404040','F2F2F2', HW)); shToday = true; }
            cells.push(mkCell(t, HW, showArr, showDR, showDue, i + offset));
          });
        }
        return cells;
      }

      const lc  = colCells(left, 0);
      const rc  = colCells(right, mid);
      let max = Math.max(lc.length, rc.length);
      if (maxRows && max > maxRows) max = maxRows;
      const rows = [];
      rows.push(new TableRow({ cantSplit: true, keepLines: true, children: [hCell(title, W, 2)] }));
      for (let i = 0; i < max; i++) {
        rows.push(new TableRow({
          children: [lc[i] || emCell(HW, i), rc[i] || emCell(HW, i)],
        }));
      }
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [HW, HW], rows });
    }

    // The James Daily Pillar
    function buildPillar(p) {
      if (!p || !p.text || !p.text.trim()) return null;
      const paras = p.text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
      const title = 'The James Daily Pillar' + (p.pillar ? ': ' + p.pillar : '');
      const rows = [];
      rows.push(new TableRow({ cantSplit: true, children: [hCell(title, W)] }));
      paras.forEach((para, i) => {
        rows.push(new TableRow({ children: [new TableCell({
          borders: B,
          width: { size: W, type: WidthType.DXA },
          shading: { fill: 'FBF8F2', type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 140, right: 140 },
          children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [
            i === 0
              ? new TextRun({ text: para, font: SUBF, size: 20, color: '111111' })
              : new TextRun({ text: para, font: FONT, size: 17, color: '222222' })
          ]})],
        })] }));
      });
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows });
    }

    // Pipeline tally by priority label (open items in DBR and Funnel; GMCVB leads are not counted)
    function pipelineItems() {
      const keys  = ['definite', 'tentative', 'p2', 'p3'];
      const names = { definite: 'Definite', tentative: 'Tentative', p2: 'P2', p3: 'P3' };
      const cols  = { definite: '7A5A00', tentative: '6A3D99', p2: '9A5B00', p3: '2E6B34' };
      const tot = {}; keys.forEach(k => { tot[k] = { n: 0, v: 0 }; });
      ['dbr', 'proposals_out'].forEach(sec => (T[sec] || []).forEach(t => {
        if (!t.text || t.done || !tot[t.priority]) return;
        tot[t.priority].n++;
        const v = Number(t.value); if (!isNaN(v)) tot[t.priority].v += v;
      }));
      const money = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
      const items = keys.map(k => ({ pipe: { label: names[k], n: tot[k].n, v: money(tot[k].v), color: cols[k] } }));
      const all = keys.reduce((a, k) => ({ n: a.n + tot[k].n, v: a.v + tot[k].v }), { n: 0, v: 0 });
      items.push({ pipe: { label: 'Total pipeline', n: all.n, v: money(all.v), fill: 'FBF8F2' } });
      return items;
    }

    // ── Load logo ──────────────────────────────────────────────────────────
    let logoData = null;
    const logoCandidates = [
      path.join(__dirname, 'hotel_polaris_logo_white.png'),
      path.join(__dirname, '../../hotel_polaris_logo_white.png'),
      path.join(__dirname, '../hotel_polaris_logo_white.png'),
    ];
    for (const p of logoCandidates) {
      try { if (fs.existsSync(p)) { logoData = fs.readFileSync(p); break; } } catch (_) {}
    }

    // ── Build document body ────────────────────────────────────────────────
    const children = [];
    const TITLE_W  = 7600;
    const LOGO_W   = W - TITLE_W; // 3200

    // Header table (navy, title left, logo right)
    children.push(new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: [TITLE_W, LOGO_W],
      rows: [new TableRow({ children: [
        new TableCell({
          borders: NB,
          width: { size: TITLE_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: '1F3864', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 160, right: 80 },
          children: [
            new Paragraph({ children: [new TextRun({ text: "Jonathan's Daily Task List", font: HEAD, size: 34, color: 'FFFFFF' })] }),
            new Paragraph({ spacing: { before: 30 }, children: [new TextRun({ text: DATE_TIME_STR, font: FONT, size: 18, color: 'B8C8DC' })] }),
          ],
        }),
        new TableCell({
          borders: NB,
          width: { size: LOGO_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: '1F3864', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 80, right: 160 },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: logoData
              ? [new ImageRun({ type: 'png', data: logoData, transformation: { width: 125, height: 45 },
                  altText: { title: 'The James Nautilus Miami Beach', description: 'Hotel Polaris logo', name: 'HotelPolarisLogo' } })]
              : [new TextRun({ text: 'The James Nautilus Miami Beach', font: FONT, size: 18, bold: true, color: 'FFFFFF' })],
          })],
        }),
      ]}),
    ]}));

    children.push(sp(90));

    // ── Sections ───────────────────────────────────────────────────────────
    // The James Daily Pillar leads the page, as it does on screen
    addSec(children, buildPillar(pillar));

    // Pipeline (left) + DBR (right)
    addSec(children, buildDual(
      'Pipeline',                  [], false, false,
      'DBR: ' + getDBRDate(),      T.dbr || [], 'dec', false,
      pipelineItems()
    ));

    // Funnel (full width)
    addSec(children, buildProposals(T.proposals_out || [], 'Funnel'));

    // GMCVB Leads (labeled in DBR or Funnel)
    if (GM.length) addSec(children, buildProposals(GM, 'GMCVB Leads'));

    // Contracts
    addSec(children, buildSplit(
      'Contracts', 'Out', T.contracts_out || [], 'Closed', T.contracts_closed || [], true
    ));
    // Tasks (with due dates)
    addSec(children, buildTwoCol('Tasks', T.tasks || [], false, false, true, null));

    // Hot Dates + Prospecting + One on One Items
    addSec(children, buildTriple([
      { title: 'Client Dates',     tasks: T.calls       || [], showDR: true },
      { title: 'Prospecting',      tasks: T.prospecting || [] },
      { title: 'One on One Items', tasks: T.one_on_one  || [] },
    ]));

    // Travel (with 30/60-day dividers)
    addSec(children, buildTwoCol('Upcoming Industry Events and Travel', T.travel || [], false, true, false, 'travel'));

    // ── Assemble document ──────────────────────────────────────────────────
    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: 17 } } } },
      sections: [{
        properties: {
          page: {
            size:   { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      }],
    });

    // ── Pack + return ──────────────────────────────────────────────────────
    const buffer = await Packer.toBuffer(doc);
    const today  = NOW.toLocaleDateString('en-US', { timeZone: TZ });
    const [m, d, y] = today.split('/');
    const mm   = String(m).padStart(2, '0');
    const dd   = String(d).padStart(2, '0');
    const yyyy = String(y);
    const filename = `jonathans_task_list_${mm}-${dd}-${yyyy}.docx`;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (err) {
    console.error('Export error:', err.message, err.stack);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
