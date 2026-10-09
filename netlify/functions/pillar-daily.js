// Scheduled function: runs at 12:00 and 13:00 UTC on weekdays (see netlify.toml).
// Only one of those two runs is 8 am Eastern, depending on daylight saving time.
const L = require('./pillar').lib;

exports.handler = async () => {
  try {
    const now = new Date();
    const p = L.etParts(now);
    if (p.hour !== 8) {
      console.log('Not 8 am Eastern (hour ' + p.hour + '), skipping');
      return { statusCode: 200, body: 'skipped' };
    }
    const e = L.effectiveDate(now);
    const cur = await L.readPillar();
    if (cur && cur.date === e.iso) {
      console.log('Already drafted for ' + e.iso);
      return { statusCode: 200, body: 'exists' };
    }
    const next = await L.generateFor(e, cur);
    await L.writePillar(next);
    console.log('Daily pillar drafted for ' + e.iso + ': ' + next.pillar);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('Daily pillar error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
