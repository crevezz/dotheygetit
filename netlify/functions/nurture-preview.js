// Sends the five teaching-tip emails once, so they can be read before the
// sequence is switched on. Does not enrol the address and ignores NURTURE_ENABLED.
//
//   POST https://dotheygetit.app/.netlify/functions/nurture-preview
//   Header: x-lead-secret: <LEAD_WEBHOOK_SECRET>
//   Body: { "email": "you@example.com" }
//
// The messages use first name Craig and subject maths. The unsubscribe link
// is a sample (token=preview) and does not remove anyone.

const crypto = require('crypto');
const { sendPreview, normalizeEmail } = require('./lib/nurture');

const res = (statusCode, body) => ({ statusCode, body });

function header(event, name) {
  const headers = (event && event.headers) || {};
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== want) continue;
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
  return '';
}

function authorized(event) {
  const expected = String(process.env.LEAD_WEBHOOK_SECRET || '').trim();
  if (!expected) return false;
  const got = String(header(event, 'x-lead-secret') || '').trim();
  const ha = crypto.createHash('sha256').update(got, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

exports.handler = async (event) => {
  if (!authorized(event)) {
    if (!String(process.env.LEAD_WEBHOOK_SECRET || '').trim()) console.error('LEAD_WEBHOOK_SECRET not set');
    return res(401, 'unauthorized');
  }
  if (event.httpMethod && String(event.httpMethod).toUpperCase() !== 'POST') return res(405, 'method');
  let data;
  try {
    data = JSON.parse((event && event.body) || '{}');
  } catch (e) {
    return res(400, 'bad json');
  }
  const email = normalizeEmail(data && data.email);
  if (!email) return res(400, 'bad email');
  try {
    const subjects = await sendPreview(email);
    console.log('nurture preview sent ' + subjects.length);
    return res(200, 'sent ' + subjects.length);
  } catch (e) {
    console.error('nurture preview failed:', e.message);
    return res(502, 'error');
  }
};
