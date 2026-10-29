// Facebook Lead Ads → the same misconception-bank PDF email as the
// Netlify Form `toolkit-download`.
//
// Make.com: Facebook Lead Ads trigger, then an HTTP module.
//   POST https://dotheygetit.app/.netlify/functions/fb-lead
//   Header: x-lead-secret: <LEAD_WEBHOOK_SECRET>
//   Body: { "full_name": "Jane Smith", "email": "jane@school.sch.uk", "subject": "Maths" }
//
// A raw lead object is also accepted. field_data entries named full_name,
// email (or email_address), and subject fill any of those the flat body omitted.
//
// subject is a human label: Maths, Science, English, History, Geography, or
// Other (any case, or the longer labels the site shows, such as
// "Science (Combined)"). Other, or anything that is not one subject, gets
// all five PDFs instead of an error.
//
//   401  missing or wrong x-lead-secret, or LEAD_WEBHOOK_SECRET is unset
//   400  body is not JSON, or email is missing or invalid (do not retry)
//   405  not a POST
//   200  sent
//   502  the mailbox send failed (retry)
//
// Env (Netlify, never commit the values):
//   LEAD_WEBHOOK_SECRET   shared secret, sent as the x-lead-secret header
//   PRIVATEEMAIL_PASSWORD existing mailbox password used by submission-created
//
// node test-fb-lead.js

const crypto = require('crypto');
const { leadMessage, render, sendMail, str, validEmail } = require('./lib/pdf-mail');

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

function bodyOf(event) {
  let raw = event && event.body;
  if (raw == null || raw === '') return {};
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (typeof raw !== 'string') return raw;
  return JSON.parse(raw);
}

function normKey(s) {
  return str(s).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// Flat {full_name, email, subject} wins. field_data only fills the gaps,
// which is what Make sends if the HTTP module forwards the lead as-is.
function leadFields(data) {
  const out = { full_name: '', email: '', subject: '' };
  const take = (key, value) => {
    if (value == null || value === '') return;
    const k = normKey(key);
    if ((k === 'full_name' || k === 'fullname') && out.full_name === '') out.full_name = value;
    else if ((k === 'email' || k === 'email_address') && out.email === '') out.email = value;
    else if (k === 'subject' && out.subject === '') out.subject = value;
  };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const key of Object.keys(data)) take(key, data[key]);
  const rows = Array.isArray(data.field_data) ? data.field_data : [];
  for (const row of rows) {
    const values = row && (row.values != null ? row.values : row.value);
    const value = Array.isArray(values) ? values[0] : values;
    take(row && row.name, value);
  }
  return out;
}

exports.handler = async (event) => {
  if (!authorized(event)) {
    if (!String(process.env.LEAD_WEBHOOK_SECRET || '').trim()) console.error('LEAD_WEBHOOK_SECRET not set');
    else console.error('fb lead unauthorized');
    return res(401, 'unauthorized');
  }
  if (event.httpMethod && String(event.httpMethod).toUpperCase() !== 'POST') return res(405, 'method');

  let data;
  try {
    data = bodyOf(event || {});
  } catch (e) {
    return res(400, 'bad json');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res(400, 'bad json');

  const fields = leadFields(data);
  const to = str(fields.email).trim();
  if (to.length > 254 || !validEmail(to)) return res(400, 'bad email');

  try {
    const msg = leadMessage(fields.full_name, fields.subject);
    const { text, html } = render(msg.lines);
    await sendMail(to, msg.subject, text, html);
    console.log('fb lead pdf email sent', msg.subject);
    return res(200, 'sent');
  } catch (e) {
    console.error('fb lead pdf email error:', e.message);
    return res(502, 'error');
  }
};
