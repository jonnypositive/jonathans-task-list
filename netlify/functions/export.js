// netlify/functions/export.js
// Jonathan's Daily Task List — .docx export
// v7: removed all page break logic — sections flow organically across pages

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        BorderStyle, WidthType, ShadingType, VerticalAlign, AlignmentType,
        ImageRun, Header } = require('docx');
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
    const recap = body.recap || '';

    // ── Date / time helpers ────────────────────────────────────────────────
    const TZ  = 'America/Denver';
    const NOW = new Date();
    const DATE_STR = NOW.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ
    });
    const TIME_STR = NOW.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ
    });
    const DATE_TIME_STR = DATE_STR + ' · ' + TIME_STR;

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

    // ── Sort proposals_out by arrival/decision date ────────────────────────
    if (T.proposals_out) {
      T.proposals_out.sort((a, b) => {
        if (!a.arrival && !b.arrival) return 0;
        if (!a.arrival) return 1;
        if (!b.arrival) return -1;
        return new Date(a.arrival) - new Date(b.arrival);
      });
    }

    // ── Design constants ───────────────────────────────────────────────────
    const FONT = 'Arial';
    const W    = 10800;   // content width DXA (0.5" margins each side)
    const HW   = 5400;    // half width

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
    function taskRuns(t, showArr, showDR, showDue, showNotes) {
      const ch = [];
      ch.push(new TextRun({ text: '☐ ', font: 'Segoe UI Symbol', size: 17 }));

      // Task text — bold if high priority
      const isHigh = t.priority === 'high' || t.p === 'P1';
      const label  = t.text || t.t || '';
      ch.push(new TextRun({ text: label, font: FONT, size: 17, bold: isHigh }));

      // Perpetual marker
      if (t.perpetual) ch.push(new TextRun({ text: ' [∞]', font: FONT, size: 14, bold: true, color: '1F4E79' }));

      // Priority badge
      const pMap = { high: 'HIGH', P1: 'HIGH', med: 'MED', P2: 'MED', low: 'LOW', P3: '' };
      const pLbl = pMap[t.priority || t.p] || '';
      if (pLbl) {
        const pColor = isHigh ? '9B1111' : '8B5E00';
        ch.push(new TextRun({ text: ' [' + pLbl + ']', font: FONT, size: 14, bold: true, color: pColor }));
      }

      // Arrival date (proposals/contracts)
      if (showArr && t.arrival) {
        ch.push(new TextRun({ text: ' Arr: ' + fmt(t.arrival), font: FONT, size: 14, color: '2E6B00', bold: true }));
      }

      // Travel date range
      if (showDR && (t.travelStart || t.travelEnd)) {
        const r = (t.travelStart ? fmt(t.travelStart) : '?') + '–' + (t.travelEnd ? fmt(t.travelEnd) : '?');
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

    function mkCell(t, w, showArr, showDR, showDue, ri) {
      const children = [new Paragraph({ children: taskRuns(t, showArr, showDR, showDue) })];
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
          children: [new TextRun({ text: title, font: FONT, size: 18, bold: true, color: 'FFFFFF' })],
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
          children: [new TextRun({ text: title, font: FONT, size: 16, bold: true, color: 'FFFFFF' })],
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

    // Client Dates + DBR side by side (no sub-header row, separate navy headers)
    function buildDual(lTitle, lTasks, lArr, lDR, rTitle, rTasks, rArr, rDR) {
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
        return mkCell(item.t, w, item.sa, item.sd, false, item.ri);
      }

      const li = sideItems(lActive, lArr, lDR);
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

    // Daily Recap
    function buildRecap(recapText) {
      if (!recapText || !recapText.trim()) return null;
      const plain = recapText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const paragraphs = plain.split(/\n\n+|\n/).filter(p => p.trim().length > 0);
      const rows = [];
      rows.push(new TableRow({ cantSplit: true, children: [hCell('Daily Recap', W)] }));
      paragraphs.forEach((para, i) => {
        rows.push(new TableRow({ children: [new TableCell({
          borders: B,
          width: { size: W, type: WidthType.DXA },
          shading: { fill: i % 2 === 1 ? C.alt : C.white, type: ShadingType.CLEAR },
          margins: { top: 36, bottom: 36, left: 120, right: 120 },
          children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [
            new TextRun({ text: para.trim(), font: FONT, size: 16, color: '222222' })
          ]})],
        })] }));
      });
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows });
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
            new Paragraph({ children: [new TextRun({ text: "Jonathan's Daily Task List", font: FONT, size: 28, bold: true, color: 'FFFFFF' })] }),
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
              ? [new ImageRun({ type: 'png', data: logoData, transformation: { width: 180, height: 45 },
                  altText: { title: 'Hotel Polaris', description: 'Hotel Polaris logo', name: 'HotelPolarisLogo' } })]
              : [new TextRun({ text: 'Hotel Polaris', font: FONT, size: 18, bold: true, color: 'FFFFFF' })],
          })],
        }),
      ]}),
    ]}));

    children.push(sp(90));

    // ── Sections ───────────────────────────────────────────────────────────
    // Client Dates (key: 'calls') + DBR side by side
    addSec(children, buildDual(
      'Client Dates',              T.calls          || [], false, true,
      'DBR — ' + getDBRDate(),     T.dbr            || [], true,  false
    ));

    // Proposals
    addSec(children, buildSplit(
      'Proposals', 'Prep', T.proposals_prep || [], 'Out', T.proposals_out || [], true
    ));

    // Contracts
    addSec(children, buildSplit(
      'Contracts', 'Prep', T.contracts_prep || [], 'Out', T.contracts_out || [], true
    ));

    // Tasks (with due dates)
    addSec(children, buildTwoCol('Tasks', T.tasks || [], false, false, true, null));

    // Prospecting
    addSec(children, buildTwoCol('Prospecting', T.prospecting || [], false, false, false));

    // Culture Club + Sales Manager Affinity side by side
    addSec(children, buildDual(
      'Culture Club — ' + getCultureClubDate(),         T.culture  || [], false, false,
      'Sales Manager Affinity — ' + getAffinityDate(),  T.affinity || [], false, false
    ));

    // Travel (with 30/60-day dividers)
    addSec(children, buildTwoCol('Travel', T.travel || [], false, true, false, 'travel'));

    // Daily Recap
    addSec(children, buildRecap(recap));

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
