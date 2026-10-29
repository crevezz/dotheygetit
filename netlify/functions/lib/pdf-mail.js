// Shared PDF email for the Netlify Forms hook (submission-created.js)
// and the Facebook lead webhook (fb-lead.js).
// Not a function: Netlify only deploys files in netlify/functions/ itself.
// Needs the Netlify env var PRIVATEEMAIL_PASSWORD (never commit it).

const BASE = 'https://privateemail.com';
const MC = BASE + '/gateway/api/v1/mailcore';
const USER = 'support@dotheygetit.app';
const SITE = 'https://dotheygetit.app';

const TOOLKIT = {
  maths: ['GCSE Maths', 'gcse-maths-misconceptions.pdf'],
  science: ['GCSE Combined Science', 'gcse-science-misconceptions.pdf'],
  english: ['GCSE English', 'gcse-english-misconceptions.pdf'],
  history: ['GCSE History', 'gcse-history-misconceptions.pdf'],
  geography: ['GCSE Geography', 'gcse-geography-misconceptions.pdf'],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (u) => `<a href="${u}" style="color:#4f8cff;font-weight:600">${u}</a>`;

const str = (v) => (Array.isArray(v) ? str(v[0]) : v && typeof v === 'object' ? str(v.value ?? v.name ?? '') : String(v ?? ''));

const validEmail = (to) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);

function firstName(v) {
  return str(v).trim().split(/\s+/)[0] || 'there';
}

// The site form caps the first name at 80. Only an oversized lead name is
// clipped; a normal full_name is passed through so the greeting matches the form.
function nameForMail(fullName) {
  const raw = str(fullName);
  const first = raw.trim().split(/\s+/)[0] || '';
  if (first.length <= 80) return raw;
  return first.slice(0, 80);
}

function closing() {
  return [
    "Each misconception comes with a ready-made hinge question. Pop one on the board just before you move on, and within a minute you'll know who's really got it and who's quietly guessing.",
    "I put these together because the hardest part of teaching isn't explaining something, it's knowing whether it actually landed. If there's a topic you'd like covered next, just reply to this email and let me know. I read every reply.",
    'If you ever want to run those checks live, with every pupil answering on their own device, that is what Get It? does. It is free while we are in beta:',
    { url: SITE },
  ];
}

function build(form, d) {
  const first = firstName(d['first-name']);
  if (form === 'toolkit-download') {
    const t = TOOLKIT[str(d.subject).toLowerCase()] || TOOLKIT[str(d.subject).toLowerCase().split(/[\s(]/)[0]];
    if (!t) return null;
    const url = `${SITE}/toolkit/${t[1]}`;
    return {
      subject: `Your ${t[0]} misconceptions PDF`,
      lines: [
        `Hi ${first},`,
        `Thanks for grabbing the ${t[0]} misconceptions sheet. Here's your copy:`,
        { url },
        ...closing(),
      ],
    };
  }
  if (form === 'pack-download') {
    const url = `${SITE}/new-teacher-pack/new-teacher-survival-pack.pdf`;
    return {
      subject: 'Your New Teacher Survival Pack',
      lines: [
        `Hi ${first},`,
        "Thanks for grabbing the New Teacher Survival Pack. Here's your copy:",
        { url },
        "It's packed with quick classroom routines, ways to check understanding without a pile of marking, and how to spot a lost pupil before the lesson ends.",
        "If there's anything you'd like added, or something you're stuck on right now, just reply to this email. I read every reply.",
        'If you ever want to see live which pupils have understood, Get It? does that in under a minute. It is free while we are in beta:',
        { url: SITE },
      ],
    };
  }
  return null;
}

// Human labels from the Facebook form: Maths, Science, English, History,
// Geography, or Other. A single subject (including "Science (Combined)" or
// "GCSE Maths") returns that key. Other, two subjects, or anything unknown
// returns null so the lead still gets an email, with every bank linked.
function subjectKey(subject) {
  const s = str(subject).replace(/\u00a0/g, ' ').trim().toLowerCase();
  if (!s || s === 'other' || s.split(/[\s(]/)[0] === 'other') return null;
  if (TOOLKIT[s]) return s;
  const hits = Object.keys(TOOLKIT).filter((k) => new RegExp('\\b' + k + '\\b').test(s));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;
  const first = s.split(/[\s(]/)[0];
  return TOOLKIT[first] ? first : null;
}

function allBanksMessage(fullName) {
  const first = firstName(fullName);
  const lines = [
    `Hi ${first},`,
    'Thanks for grabbing the misconception sheets. Here are all five GCSE banks, so you can pick the one you teach:',
  ];
  for (const key of Object.keys(TOOLKIT)) {
    const t = TOOLKIT[key];
    lines.push(t[0], { url: `${SITE}/toolkit/${t[1]}` });
  }
  lines.push(...closing());
  return { subject: 'Your GCSE misconceptions PDFs', lines };
}

function leadMessage(fullName, subject) {
  const name = nameForMail(fullName);
  const key = subjectKey(subject);
  if (key) return build('toolkit-download', { 'first-name': name, subject: key });
  return allBanksMessage(name);
}

function render(lines) {
  const sign = ['Best wishes,', 'Craig', 'Founder, Get It?'];
  const text = lines.map((l) => (typeof l === 'string' ? l : l.url)).concat('', sign.join('\n')).join('\n\n');
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">' +
    lines.map((l) => `<p>${typeof l === 'string' ? esc(l) : link(l.url)}</p>`).join('') +
    `<p>${sign.map(esc).join('<br>')}</p></div>`;
  return { text, html };
}

async function loginMailbox() {
  const pw = process.env.PRIVATEEMAIL_PASSWORD;
  if (!pw) throw new Error('PRIVATEEMAIL_PASSWORD not set');
  const tok = await fetch(BASE + '/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'getit-site/1.0' },
    body: new URLSearchParams({ client_id: 'privateemail.com', grant_type: 'password', username: USER, password: pw }),
  });
  if (!tok.ok) throw new Error('login failed: HTTP ' + tok.status);
  const { access_token } = await tok.json();
  return access_token;
}

// The sendmessage body has no documented custom-header field. List-Unsubscribe
// is left out: an unknown property can fail the send. Tips put the link in the body.
// opts.idempotencyKey is optional. Day 0 omits it, so each PDF email gets a new id.
async function sendWithToken(accessToken, to, subject, text, html, opts) {
  const r = await fetch(MC + '/sendmessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'getit-site/1.0', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({
      idempotencyKey: (opts && opts.idempotencyKey) || crypto.randomUUID(),
      from: [{ address: USER, name: 'Craig - Get It?' }],
      to: [{ address: to }], cc: [], bcc: [],
      subject, htmlBody: html, textBody: text, importance: 'Normal',
      date: new Date().toUTCString(), composeType: 'New', inReplyTo: null, references: [],
      isSecure: false, password: '', attachments: [],
    }),
  });
  if (r.status >= 300) throw new Error('send failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function sendMail(to, subject, text, html) {
  const accessToken = await loginMailbox();
  await sendWithToken(accessToken, to, subject, text, html);
}

module.exports = {
  SITE,
  TOOLKIT,
  str,
  validEmail,
  firstName,
  nameForMail,
  build,
  render,
  loginMailbox,
  sendWithToken,
  sendMail,
  subjectKey,
  leadMessage,
};
