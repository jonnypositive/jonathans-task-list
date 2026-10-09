const https = require('https');
const { getStore } = require('@netlify/blobs');

const TZ = 'America/New_York';
// Cycle starts Monday Jan 5, 2026 on pillar 0 and advances one pillar per weekday.
const ANCHOR = Date.UTC(2026, 0, 5);

const PILLARS = [
  { name: 'Timeless Service',
    about: 'Warm, intuitive, anticipatory hospitality. Associates act as curators who make every guest feel like a resident in the moment, never like a transaction.' },
  { name: 'Local Access Granted',
    about: 'Insider access to the best of Miami Beach and its neighborhood: the people, places and experiences a resident knows and a visitor usually misses.' },
  { name: 'Destination-Worthy Food & Beverage',
    about: 'Food and drink that are a reason to come in their own right, convivial and cocktail-forward, worth a group planning an evening around.' },
  { name: 'Residential Essence',
    about: 'A feeling of home, not a hotel. Rooms and spaces with the ease, character and comfort of a well-kept residence.' },
];

function etParts(d) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' });
  const o = {};
  f.formatToParts(d).forEach(p => { o[p.type] = p.value; });
  return { y: +o.year, m: +o.month, d: +o.day, hour: +o.hour % 24, wd: o.weekday };
}

// Most recent weekday (today if Mon to Fri) in Eastern time, as {iso, y, m, d}
function effectiveDate(now) {
  let t = new Date(now || Date.now());
  for (let i = 0; i < 4; i++) {
    const p = etParts(t);
    if (p.wd !== 'Sat' && p.wd !== 'Sun') {
      return { iso: p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'), y: p.y, m: p.m, d: p.d };
    }
    t = new Date(t.getTime() - 24 * 3600 * 1000);
  }
}

function weekdaysSinceAnchor(y, m, d) {
  let n = 0;
  for (let t = ANCHOR, end = Date.UTC(y, m - 1, d); t < end; t += 86400000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

function pillarIndexFor(e) {
  const n = weekdaysSinceAnchor(e.y, e.m, e.d);
  return ((n % PILLARS.length) + PILLARS.length) % PILLARS.length;
}

function getBlobStore() {
  return getStore({ name: 'tasklist', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN });
}

async function readPillar() {
  const raw = await getBlobStore().get('pillar');
  return raw ? JSON.parse(raw) : null;
}
async function writePillar(obj) {
  await getBlobStore().set('pillar', JSON.stringify(obj));
}

function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.reject(new Error('ANTHROPIC_API_KEY not set'));
  const payload = JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(j.error.message || JSON.stringify(j.error)));
          resolve((j.content && j.content[0] && j.content[0].text) || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildPrompt(p, e, recent) {
  const dateStr = new Date(Date.UTC(e.y, e.m - 1, e.d, 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `You write the short daily brand message that the group sales team of The James Nautilus Miami Beach reads together at the start of the daily DBR meeting. The hotel is a Sonesta property in Miami Beach, a AAA Four-Diamond property currently being renovated and scheduled to reopen in Q4 2026. The brand line is "Right On Timeless".

Today is ${dateStr}. Today's brand pillar is "${p.name}". What it means: ${p.about}

Voice: refined, warm, sincere and quietly clever. Confident and specific, never boastful. The brand promise is that guests feel like residents in the moment, and associates are curators.

Write three parts:
1. A headline of 4 to 9 words.
2. A message of 3 to 4 sentences connecting this pillar to how a group sales manager talks to planners and wins business today.
3. One "Say it this way" line the team can use in a conversation with a client, in quotation marks.

Rules: do not invent facts, amenities, chef or restaurant names, prices, dates or statistics. Speak about the pillar and the guest experience in general terms that are true of the brand. Never use em dashes, en dashes, double hyphens, or semicolons. Do not use exclamation points. Avoid cliches such as "elevate", "curated experience" and "world-class". ${recent ? 'Do not repeat the wording of this earlier message: ' + recent : ''}

Respond ONLY with JSON in this shape and nothing else: {"headline":"...","message":"...","say":"..."}`;
}

function clean(s) {
  return String(s || '').replace(/\s*(?:[‒–—―]|--)\s*/g, ', ').replace(/\s*;\s*/g, ', ').replace(/\s+,/g, ',').trim();
}

async function generateFor(e, previous) {
  const idx = pillarIndexFor(e);
  const p = PILLARS[idx];
  const text = await callClaude(buildPrompt(p, e, previous && previous.text ? previous.text.slice(0, 300) : ''));
  const j = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const say = clean(j.say);
  const body = [clean(j.headline), clean(j.message), say ? 'Say it this way: ' + say : ''].filter(Boolean).join('\n\n');
  return { date: e.iso, idx, pillar: p.name, text: body, edited: false, updatedAt: new Date().toISOString() };
}

const L = { TZ, PILLARS, etParts, effectiveDate, pillarIndexFor, readPillar, writePillar, generateFor };
// Helpers are shared with pillar-daily.js
exports.lib = L;


exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const ok = (o) => ({ statusCode: 200, headers, body: JSON.stringify(o) });
  try {
    const e = L.effectiveDate();
    const cur = await L.readPillar();

    if (event.httpMethod === 'GET') return ok(cur || {});

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      // Save the on-page edit
      if (body.action === 'save') {
        const base = cur || { date: e.iso, idx: L.pillarIndexFor(e), pillar: L.PILLARS[L.pillarIndexFor(e)].name };
        const next = { ...base, text: String(body.text || '').slice(0, 4000), edited: true, updatedAt: new Date().toISOString() };
        await L.writePillar(next);
        return ok(next);
      }

      // Draft (or redraft) today's message. Skips if today's is already drafted, unless forced.
      if (body.action === 'generate') {
        if (cur && cur.date === e.iso && !body.force) return ok(cur);
        const next = await L.generateFor(e, cur);
        await L.writePillar(next);
        return ok(next);
      }
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Pillar error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
