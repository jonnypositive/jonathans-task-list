// netlify/functions/export.js
// Jonathan's Daily Task List — .docx export
// Updated: Hot Dates & In-House Groups, Decision Due Date, no Notes section,
//          task due dates in export, per-task notes, 2-page limit (no forced breaks)

const { getStore } = require('@netlify/blobs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, ImageRun, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageBreak
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
// Page: US Letter, 0.5" margins → content width = 12240 - 1440 = 10800 DXA
const PAGE_W   = 12240;
const PAGE_H   = 15840;
const MARGIN   = 720;   // 0.5 inch
const CONTENT_W = PAGE_W - MARGIN * 2; // 10800

const NAVY     = '1F3864';
const WHITE    = 'FFFFFF';
const P1_COLOR = '8B2635';
const P2_COLOR = '92580A';
const P3_COLOR = '1a1d23';
const GRAY_BG  = 'F2F2F2';

// ─── SECTION DEFINITIONS ────────────────────────────────────────────────────
// Must mirror index.html SECTIONS (minus recap, which goes at end)
const SECTIONS = [
  { id:'hotdates',       label:'Hot Dates and In-House Groups', type:'full' },
  { id:'dbr',            label:'DBR',                           type:'full' },
  { id:'proposals_prep', label:'Proposals',  sub:'Prep',        type:'split_left',  pair:'proposals' },
  { id:'proposals_out',  label:'Proposals',  sub:'Out',         type:'split_right', pair:'proposals' },
  { id:'contracts_prep', label:'Contracts',  sub:'Prep',        type:'split_left',  pair:'contracts' },
  { id:'contracts_out',  label:'Contracts',  sub:'Out',         type:'split_right', pair:'contracts' },
  { id:'tasks',          label:'Tasks / Short-Term Projects',   type:'full', hasDueDate:true },
  { id:'prospecting',    label:'Prospecting',                   type:'full' },
  { id:'culture',        label:'Culture Club & Sales Manager Affinity Group', sub:'Culture Club',                 type:'split_left',  pair:'cult_aff' },
  { id:'affinity',       label:'Culture Club & Sales Manager Affinity Group', sub:'Sales Manager Affinity Group', type:'split_right', pair:'cult_aff' },
  { id:'travel',         label:'Travel',                        type:'full' },
  // Notes section REMOVED per update #5
];

// ─── HELPERS ────────────────────────────────────────────────────────────────
function textColor(p) {
  return p === 'P1' ? P1_COLOR : p === 'P2' ? P2_COLOR : P3_COLOR;
}

function noBorder() {
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return { top: none, bottom: none, left: none, right: none };
}

function thinBorder() {
  const b = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
  return { top: b, bottom: b, left: b, right: b };
}

// Standard task text paragraph
function taskPara(text, priority, extraText) {
  const color = textColor(priority);
  const runs = [new TextRun({ text: text || '', font: 'Arial', size: 18, color })]; // 9pt
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

// Due date badge text
function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `Due: ${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
}

// Section header paragraph (navy background, white bold text)
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

// ─── SECTION BUILDERS ───────────────────────────────────────────────────────

// Full-width section
function buildFullSection(sec, tasks) {
  const items = (tasks[sec.id] || []).filter(x => !x.d);
  if (!items.length) return [];

  const paras = [sectionHeader(sec.label)];
  items.forEach(item => {
    // Build extra info string (due date if present)
    const extra = sec.hasDueDate && item.dueDate ? formatDueDate(item.dueDate) : '';
    paras.push(taskPara(item.t, item.p, extra));
    if (item.notes && item.notes.trim()) {
      paras.push(notesPara(item.notes.trim()));
    }
  });
  return paras;
}

// Split (two-column) section using a Table
function buildSplitSection(lSec, rSec, tasks) {
  const lItems = (tasks[lSec.id] || []).filter(x => !x.d);
  const rItems = (tasks[rSec.id] || []).filter(x => !x.d);
  if (!lItems.length && !rItems.length) return [];

  const HALF = Math.floor(CONTENT_W / 2); // 5400 each

  function colParas(items, sub, secDef) {
    const ps = [subLabel(sub)];
    items.forEach(item => {
      const extra = secDef.hasDueDate && item.dueDate ? formatDueDate(item.dueDate) : '';
      ps.push(taskPara(item.t, item.p, extra));
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
function getLogoBase64() {
  // Logo lives at project root as logo.png (white version for dark header)
  const candidates = [
    path.join(__dirname, '../../logo.png'),
    path.join(__dirname, '../logo.png'),
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
  const logoData = getLogoBase64();
  const titleRun = new TextRun({ text: "Jonathan's Daily Task List", font: 'Arial', size: 24, bold: true, color: WHITE });
  const dateRun  = new TextRun({ text: '  ' + dateStr, font: 'Arial', size: 18, color: 'AABBCC', break: 0 });

  const leftPara = new Paragraph({
    children: [titleRun, dateRun],
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    spacing: { before: 0, after: 0 },
  });

  if (!logoData) {
    return new Header({ children: [leftPara] });
  }

  // Two-column header: title left, logo right
  const HEADER_W = CONTENT_W;
  const LOGO_W   = 1440; // ~1 inch
  const TEXT_W   = HEADER_W - LOGO_W;

  const logoPara = new Paragraph({
    children: [new ImageRun({ data: logoData, transformation: { width: 100, height: 40 }, type: 'png' })],
    alignment: AlignmentType.RIGHT,
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    spacing: { before: 0, after: 0 },
  });

  const headerTable = new Table({
    width: { size: HEADER_W, type: WidthType.DXA },
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

  // Strip HTML tags if recap came as innerHTML
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

  const tasks  = body.tasks  || {};
  const recap  = body.recap  || '';

  // Build date string
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Denver'
  });

  // ── Build document children ──────────────────────────────────────────────
  const children = [];
  const done = new Set();

  SECTIONS.forEach(sec => {
    if (sec.type === 'split_right') return; // handled with split_left

    if (sec.type === 'full') {
      children.push(...buildFullSection(sec, tasks));
    } else if (sec.type === 'split_left' && !done.has(sec.pair)) {
      done.add(sec.pair);
      const rSec = SECTIONS.find(s => s.pair === sec.pair && s.type === 'split_right');
      if (rSec) children.push(...buildSplitSection(sec, rSec, tasks));
    }
  });

  // Daily Recap at end
  children.push(...buildRecap(recap));

  // Add at least one paragraph if empty
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
    const mm  = String(m).padStart(2, '0');
    const dd  = String(d).padStart(2, '0');
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
