// netlify/functions/export.js
// Jonathan's Daily Task List — .docx export

const { getStore } = require('@netlify/blobs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, ImageRun, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageBreak
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const PAGE_W    = 12240;
const PAGE_H    = 15840;
const MARGIN    = 720;   // 0.5 inch
const CONTENT_W = PAGE_W - MARGIN * 2; // 10800

const NAVY     = '1F3864';
const WHITE    = 'FFFFFF';
const P1_COLOR = '8B2635';
const P2_COLOR = '92580A';
const P3_COLOR = '1a1d23';
const GRAY_BG  = 'F2F2F2';

// ─── SECTION DEFINITIONS ────────────────────────────────────────────────────
// IDs must match app.js keys exactly:
//   calls, dbr, proposals_prep, proposals_out, contracts_prep, contracts_out,
//   tasks, prospecting, culture, affinity, travel
const SECTIONS = [
  { id:'calls',          label:'Hot Dates and In-House Groups',              type:'full' },
  { id:'dbr',            label:'DBR',                                        type:'full' },
  { id:'proposals_prep', label:'Proposals',  sub:'Prep',                     type:'split_left',  pair:'proposals' },
  { id:'proposals_out',  label:'Proposals',  sub:'Out',                      type:'split_right', pair:'proposals' },
  { id:'contracts_prep', label:'Contracts',  sub:'Prep',                     type:'split_left',  pair:'contracts' },
  { id:'contracts_out',  label:'Contracts',  sub:'Out',                      type:'split_right', pair:'contracts' },
  { id:'tasks',          label:'Tasks / Short-Term Projects',                type:'full', hasDueDate:true },
  { id:'prospecting',    label:'Prospecting',                                type:'full' },
  { id:'culture',        label:'Culture Club & Sales Manager Affinity Group', sub:'Culture Club',                  type:'split_left',  pair:'cult_aff' },
  { id:'affinity',       label:'Culture Club & Sales Manager Affinity Group', sub:'Sales Manager Affinity Group',  type:'split_right', pair:'cult_aff' },
  { id:'travel',         label:'Travel',                                     type:'full' },
];

// ─── HELPERS ────────────────────────────────────────────────────────────────
function textColor(p) {
  return p === 'high' ? P1_COLOR : p === 'med' ? P2_COLOR : P3_COLOR;
}

function noBorder() {
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return { top: none, bottom: none, left: none, right: none };
}

// Standard task paragraph
function taskPara(text, priority, extraText) {
  const color = textColor(priority);
  const runs = [new TextRun({ text: text || '', font: 'Arial', size: 18, color })];
  if (extraText) {
    runs.push(new TextRun({ text: '  ' + extraText, font: 'Arial', size: 16, color: '888888' }));
  }
  return new Paragraph({
    children: runs,
    spacing: { before: 20, after: 20 },
  });
}

// Notes sub-paragraph (italic, indented)
function notesPara(notes) {
  return new Paragraph({
    children: [new TextRun({ text: notes, font: 'Arial', size: 16, color: '666666', italics: true })],
    indent: { left: 200 },
    spacing: { before: 0, after: 24 },
  });
}

// Format date field (YYYY-MM-DD → M/D/YY)
function fmt(s) {
  if (!s) return '';
  const p = s.split('-');
  if (p.length !== 3) return s;
  const y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return s;
  return m + '/' + d + '/' + String(y).slice(-2);
}

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  return 'Due: ' + fmt(dateStr);
}

function formatTravelDates(item) {
  if (!item.travelStart && !item.travelEnd) return '';
  return (item.travelStart ? fmt(item.travelStart) : '?') + '–' + (item.travelEnd ? fmt(item.travelEnd) : '?');
}

// Section header (navy background, white bold text)
function sectionHeader(label) {
  return new Paragraph({
    children: [new TextRun({ text: label.toUpperCase(), font: 'Arial', size: 18, bold: true, color: WHITE })],
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    spacing: { before: 80, after: 40 },
    indent: { left: 120, right: 120 },
  });
}

// Sub-label (Prep / Out / Culture Club etc.)
function subLabel(label) {
  return new Paragraph({
    children: [new TextRun({ text: label, font: 'Arial', size: 16, bold: true, color: '666666' })],
    spacing: { before: 40, after: 20 },
    shading: { fill: GRAY_BG, type: ShadingType.CLEAR },
    indent: { left: 120 },
  });
}

// Build extra info string for a task
function buildExtra(item, sec) {
  const parts = [];
  // Due date (Tasks section)
  if (sec.hasDueDate && item.dueDate) parts.push(formatDueDate(item.dueDate));
  // Arrival date (most sections) — label "Decision Due Date" for proposals_out
  if (item.arrival) {
    const label = sec.id === 'proposals_out' ? 'Decision Due:' : 'Arr:';
    parts.push(label + ' ' + fmt(item.arrival));
  }
  // Travel date range (calls, travel sections)
  const travelStr = formatTravelDates(item);
  if (travelStr) parts.push(travelStr);
  // Time (calls / hot dates section)
  if (item.time) parts.push('@ ' + item.time);
  return parts.join('  ');
}

// ─── SECTION BUILDERS ───────────────────────────────────────────────────────

function buildFullSection(sec, tasks) {
  // Filter: exclude done items (done field is 'done' in app.js, not 'd')
  const items = (tasks[sec.id] || []).filter(x => !x.done && x.text);
  if (!items.length) return [];

  const paras = [sectionHeader(sec.label)];
  items.forEach(item => {
    const extra = buildExtra(item, sec);
    paras.push(taskPara(item.text, item.priority, extra));
    if (item.notes && item.notes.trim()) {
      paras.push(notesPara(item.notes.trim()));
    }
  });
  return paras;
}

function buildSplitSection(lSec, rSec, tasks) {
  const lItems = (tasks[lSec.id] || []).filter(x => !x.done && x.text);
  const rItems = (tasks[rSec.id] || []).filter(x => !x.done && x.text);
  if (!lItems.length && !rItems.length) return [];

  const HALF = Math.floor(CONTENT_W / 2);

  function colParas(items, sub, secDef) {
    const ps = [subLabel(sub)];
    items.forEach(item => {
      const extra = buildExtra(item, secDef);
      ps.push(taskPara(item.text, item.priority, extra));
      if (item.notes && item.notes.trim()) {
        ps.push(notesPara(item.notes.trim()));
      }
    });
    return ps;
  }

  const headerPara = sectionHeader(lSec.label);

  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [HALF, HALF],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorder(),
            width: { size: HALF, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 0, right: 60 },
            children: colParas(lItems, lSec.sub, lSec),
          }),
          new TableCell({
            borders: noBorder(),
            width: { size: HALF, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 60, right: 0 },
            children: colParas(rItems, rSec.sub, rSec),
          }),
        ],
      }),
    ],
  });

  return [headerPara, table];
}

// ─── LOGO ────────────────────────────────────────────────────────────────────
function getLogoData() {
  const candidates = [
    path.join(__dirname, '../../hotel_polaris_logo_white.png'),
    path.join(__dirname, '../hotel_polaris_logo_white.png'),
    path.join(__dirname, '../../logo.png'),
    path.join(__dirname, '../logo.png'),
    path.join(process.env.LAMBDA_TASK_ROOT || '', 'hotel_polaris_logo_white.png'),
    path.join(process.env.LAMBDA_TASK_ROOT || '', 'logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch (_) {}
  }
  return null;
}

// ─── HEADER ──────────────────────────────────────────────────────────────────
function buildHeader(dateStr) {
  const logoData = getLogoData();

  const titleRun = new TextRun({ text: "Jonathan's Daily Task List", font: 'Arial', size: 24, bold: true, color: WHITE });
  const dateRun  = new TextRun({ text: '  ' + dateStr, font: 'Arial', size: 18, color: 'AABBCC' });

  const leftPara = new Paragraph({
    children: [titleRun, dateRun],
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    spacing: { before: 0, after: 0 },
  });

  if (!logoData) {
    return new Header({ children: [leftPara] });
  }

  const LOGO_W = 1440;
  const TEXT_W = CONTENT_W - LOGO_W;

  const logoPara = new Paragraph({
    children: [new ImageRun({ data: logoData, transformation: { width: 100, height: 40 }, type: 'png' })],
    alignment: AlignmentType.RIGHT,
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    spacing: { before: 0, after: 0 },
  });

  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [TEXT_W, LOGO_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorder(),
            width: { size: TEXT_W, type: WidthType.DXA },
            shading: { fill: NAVY, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 120, right: 60 },
            children: [leftPara],
          }),
          new TableCell({
            borders: noBorder(),
            width: { size: LOGO_W, type: WidthType.DXA },
            shading: { fill: NAVY, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 60, right: 120 },
            children: [logoPara],
          }),
        ],
      }),
    ],
  });

  return new Header({ children: [headerTable] });
}

// ─── RECAP ───────────────────────────────────────────────────────────────────
function buildRecap(recapText) {
  if (!recapText || !recapText.trim()) return [];
  const plain = recapText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const paragraphs = plain.split(/\n\n+/).filter(Boolean);
  const paras = [sectionHeader('Daily Recap')];
  paragraphs.forEach(p => {
    paras.push(new Paragraph({
      children: [new TextRun({ text: p.trim(), font: 'Arial', size: 18, color: P3_COLOR })],
      spacing: { before: 40, after: 40 },
    }));
  });
  return paras;
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (_) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const tasks = body.tasks || {};
  const recap = body.recap || '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Denver'
  });

  // ── Build document children ──────────────────────────────────────────────
  const children = [];
  const done = new Set();

  SECTIONS.forEach(sec => {
    if (sec.type === 'split_right') return;

    if (sec.type === 'full') {
      children.push(...buildFullSection(sec, tasks));
    } else if (sec.type === 'split_left' && !done.has(sec.pair)) {
      done.add(sec.pair);
      const rSec = SECTIONS.find(s => s.pair === sec.pair && s.type === 'split_right');
      if (rSec) children.push(...buildSplitSection(sec, rSec, tasks));
    }
  });

  children.push(...buildRecap(recap));

  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'No active tasks.' })] }));
  }

  // ── Assemble document ────────────────────────────────────────────────────
  const header = buildHeader(dateStr);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: header },
      children,
    }],
  });

  // ── Pack and return ───────────────────────────────────────────────────────
  try {
    const buffer = await Packer.toBuffer(doc);
    const today  = now.toLocaleDateString('en-US', { timeZone: 'America/Denver' });
    const [m, d, y] = today.split('/');
    const mm   = String(m).padStart(2, '0');
    const dd   = String(d).padStart(2, '0');
    const yyyy = String(y);
    const filename = `jonathans_task_list_${mm}-${dd}-${yyyy}.docx`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('Export error:', err);
    return { statusCode: 500, body: 'Export failed: ' + err.message };
  }
};
