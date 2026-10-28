// Runs automatically on every verified Netlify Forms submission.
// For the PDF forms it emails the sign-up their download link from
// support@dotheygetit.app via Namecheap Private Email's HTTPS API.
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

function build(form, d) {
  const first = str(d['first-name']).trim().split(/\s+/)[0] || 'there';
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
        "Each misconception comes with a ready-made hinge question. Pop one on the board just before you move on, and within a minute you'll know who's really got it and who's quietly guessing.",
        "I put these together because the hardest part of teaching isn't explaining something, it's knowing whether it actually landed. If there's a topic you'd like covered next, just reply to this email and let me know. I read every reply.",
        'If you ever want to run those checks live, with every pupil answering on their own device, that is what Get It? does. It is free while we are in beta:',
        { url: SITE },
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

function render(lines) {
  const sign = ['Best wishes,', 'Craig', 'Founder, Get It?'];
  const text = lines.map((l) => (typeof l === 'string' ? l : l.url)).concat('', sign.join('\n')).join('\n\n');
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">' +
    lines.map((l) => `<p>${typeof l === 'string' ? esc(l) : link(l.url)}</p>`).join('') +
    `<p>${sign.map(esc).join('<br>')}</p></div>`;
  return { text, html };
}

async function sendMail(to, subject, text, html) {
  const pw = process.env.PRIVATEEMAIL_PASSWORD;
  if (!pw) throw new Error('PRIVATEEMAIL_PASSWORD not set');
  const tok = await fetch(BASE + '/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'getit-site/1.0' },
    body: new URLSearchParams({ client_id: 'privateemail.com', grant_type: 'password', username: USER, password: pw }),
  });
  if (!tok.ok) throw new Error('login failed: HTTP ' + tok.status);
  const { access_token } = await tok.json();
  const r = await fetch(MC + '/sendmessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'getit-site/1.0', Authorization: 'Bearer ' + access_token },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      from: [{ address: USER, name: 'Craig - Get It?' }],
      to: [{ address: to }], cc: [], bcc: [],
      subject, htmlBody: html, textBody: text, importance: 'Normal',
      date: new Date().toUTCString(), composeType: 'New', inReplyTo: null, references: [],
      isSecure: false, password: '', attachments: [],
    }),
  });
  if (r.status >= 300) throw new Error('send failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

exports.handler = async (event) => {
  try {
    const p = JSON.parse(event.body || '{}').payload || {};
    const d = p.data || {};
    const to = str(d.email || p.email).trim();
    const msg = build(p.form_name, d);
    if (!msg || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { statusCode: 200, body: 'skipped' };
    const { text, html } = render(msg.lines);
    await sendMail(to, msg.subject, text, html);
    console.log('pdf email sent for', p.form_name);
    return { statusCode: 200, body: 'sent' };
  } catch (e) {
    console.error('pdf email error:', e.message);
    return { statusCode: 200, body: 'error' };
  }
};
