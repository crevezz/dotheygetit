/* Facebook lead webhook sends the same misconception PDF email as the
   toolkit form, and the form hook itself still skips or swallows errors. */
const crypto = require('crypto');
const { build, render, leadMessage } = require('./netlify/functions/lib/pdf-mail');
const form = require('./netlify/functions/submission-created');
const fb = require('./netlify/functions/fb-lead');

const SECRET = 'lead-secret-test-value';
const MAIL_PW = 'mailbox-password-test-value';
const ADA = 'ada@school.sch.uk';

const pass = [];
const fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

function paras(lines) {
  return lines.join('\n\n') + '\n\n\n\nBest wishes,\nCraig\nFounder, Get It?';
}

const HINGE = "Each misconception comes with a ready-made hinge question. Pop one on the board just before you move on, and within a minute you'll know who's really got it and who's quietly guessing.";
const WHY = "I put these together because the hardest part of teaching isn't explaining something, it's knowing whether it actually landed. If there's a topic you'd like covered next, just reply to this email and let me know. I read every reply.";
const BETA = 'If you ever want to run those checks live, with every pupil answering on their own device, that is what Get It? does. It is free while we are in beta:';

const MATHS_TEXT = paras([
  'Hi Ada,',
  "Thanks for grabbing the GCSE Maths misconceptions sheet. Here's your copy:",
  'https://dotheygetit.app/toolkit/gcse-maths-misconceptions.pdf',
  HINGE,
  WHY,
  BETA,
  'https://dotheygetit.app',
]);

const MATHS_HTML =
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">' +
  '<p>Hi Ada,</p>' +
  "<p>Thanks for grabbing the GCSE Maths misconceptions sheet. Here's your copy:</p>" +
  '<p><a href="https://dotheygetit.app/toolkit/gcse-maths-misconceptions.pdf" style="color:#4f8cff;font-weight:600">https://dotheygetit.app/toolkit/gcse-maths-misconceptions.pdf</a></p>' +
  '<p>' + HINGE + '</p>' +
  '<p>' + WHY + '</p>' +
  '<p>' + BETA + '</p>' +
  '<p><a href="https://dotheygetit.app" style="color:#4f8cff;font-weight:600">https://dotheygetit.app</a></p>' +
  '<p>Best wishes,<br>Craig<br>Founder, Get It?</p></div>';

const PACK_TEXT = paras([
  'Hi Ada,',
  "Thanks for grabbing the New Teacher Survival Pack. Here's your copy:",
  'https://dotheygetit.app/new-teacher-pack/new-teacher-survival-pack.pdf',
  "It's packed with quick classroom routines, ways to check understanding without a pile of marking, and how to spot a lost pupil before the lesson ends.",
  "If there's anything you'd like added, or something you're stuck on right now, just reply to this email. I read every reply.",
  'If you ever want to see live which pupils have understood, Get It? does that in under a minute. It is free while we are in beta:',
  'https://dotheygetit.app',
]);

const PDFS = [
  'gcse-maths-misconceptions.pdf',
  'gcse-science-misconceptions.pdf',
  'gcse-english-misconceptions.pdf',
  'gcse-history-misconceptions.pdf',
  'gcse-geography-misconceptions.pdf',
];

async function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

async function capture(fn) {
  const logs = [];
  const errs = [];
  const log = console.log;
  const err = console.error;
  console.log = (...a) => logs.push(a.map(String).join(' '));
  console.error = (...a) => errs.push(a.map(String).join(' '));
  try {
    return { result: await fn(), logs, errs };
  } finally {
    console.log = log;
    console.error = err;
  }
}

async function withFetch(mode, fn) {
  const calls = [];
  const prev = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/connect/token')) {
      if (mode === 'login-fail') return { ok: false, status: 401, json: async () => ({}), text: async () => 'no' };
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }), text: async () => '' };
    }
    if (mode === 'send-fail') return { ok: false, status: 500, json: async () => ({}), text: async () => 'smtp down' };
    if (mode === 'throw') throw new Error('network down');
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  try {
    return await fn(calls);
  } finally {
    global.fetch = prev;
  }
}

function sendJson(calls) {
  const hit = calls.find((c) => c.url.includes('/sendmessage'));
  return hit ? JSON.parse(hit.opts.body) : null;
}

function calm(msg) {
  const copy = JSON.parse(JSON.stringify(msg));
  delete copy.idempotencyKey;
  delete copy.date;
  return copy;
}

function formEvent(data, formName) {
  return {
    body: JSON.stringify({
      payload: {
        form_name: formName || 'toolkit-download',
        email: data.email,
        data,
      },
    }),
  };
}

function fbEvent(body, extra) {
  return Object.assign({
    httpMethod: 'POST',
    headers: { 'X-Lead-Secret': SECRET },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }, extra || {});
}

(async () => {
  const maths = build('toolkit-download', { 'first-name': 'Ada', subject: 'maths' });
  const mathsMail = render(maths.lines);
  check(maths.subject === 'Your GCSE Maths misconceptions PDF', 'maths subject line');
  check(mathsMail.text === MATHS_TEXT, 'maths text unchanged', mathsMail.text === MATHS_TEXT ? '' : JSON.stringify(mathsMail.text));
  check(mathsMail.html === MATHS_HTML, 'maths html unchanged', mathsMail.html === MATHS_HTML ? '' : mathsMail.html);
  check((mathsMail.html.match(/href="[^"]+\.pdf"/g) || []).length === 1, 'one pdf link on a maths email');

  const science = build('toolkit-download', { 'first-name': 'Ada', subject: 'Science (Combined)' });
  check(science && science.subject === 'Your GCSE Combined Science misconceptions PDF', 'form still maps Science (Combined)');
  const english = build('toolkit-download', { 'first-name': 'Ada', subject: 'English (Language and Literature)' });
  check(english && english.subject === 'Your GCSE English misconceptions PDF', 'form still maps the long English label');

  const odd = build('toolkit-download', { 'first-name': ['Ada Grace'], subject: [{ value: 'History' }] });
  check(odd && odd.subject === 'Your GCSE History misconceptions PDF' && odd.lines[0] === 'Hi Ada,', 'non-string form fields still work');

  const pack = render(build('pack-download', { 'first-name': 'Ada', subject: 'maths' }).lines);
  check(pack.text === PACK_TEXT, 'pack text unchanged', pack.text === PACK_TEXT ? '' : JSON.stringify(pack.text));
  check(!pack.text.includes('hinge question') && pack.text.includes('New Teacher Survival Pack'), 'pack copy was not swapped with the toolkit');
  check(build('toolkit-download', { 'first-name': 'Ada', subject: 'Drama' }) === null, 'unknown form subject still has no email');
  check(build('newsletter', { 'first-name': 'Ada' }) === null, 'other forms still have no email');
  check(build('toolkit-download', { subject: 'maths' }).lines[0] === 'Hi there,', 'missing first name is still there');

  const escaped = render(build('toolkit-download', { 'first-name': 'A"<da', subject: 'maths' }).lines);
  check(escaped.text.includes('Hi A"<da,'), 'text keeps the raw first name');
  check(escaped.html.includes('Hi A&quot;&lt;da,'), 'html escapes the first name');
  check(!escaped.html.includes('Hi A"<da'), 'html does not include the raw first name');

  check(JSON.stringify(leadMessage('Ada Lovelace', 'MATHS')) === JSON.stringify(build('toolkit-download', { 'first-name': 'Ada Lovelace', subject: 'maths' })), 'FB Maths is the form maths email');
  check(JSON.stringify(leadMessage('Ada', 'Science')) === JSON.stringify(build('toolkit-download', { 'first-name': 'Ada', subject: 'science' })), 'FB Science is the form science email');
  check(JSON.stringify(leadMessage('Ada', 'Science (Combined)')) === JSON.stringify(build('toolkit-download', { 'first-name': 'Ada', subject: 'science' })), 'FB combined science label');
  check(JSON.stringify(leadMessage('Ada', 'English (Language and Literature)')) === JSON.stringify(build('toolkit-download', { 'first-name': 'Ada', subject: 'english' })), 'FB long english label');
  check(JSON.stringify(leadMessage('Ada', 'GCSE Maths')) === JSON.stringify(build('toolkit-download', { 'first-name': 'Ada', subject: 'maths' })), 'GCSE Maths label maps to maths');
  check(JSON.stringify(leadMessage('  Grace Hopper  ', ' geography ')) === JSON.stringify(build('toolkit-download', { 'first-name': '  Grace Hopper  ', subject: 'geography' })), 'trimmed label, first name Grace');
  check(JSON.stringify(leadMessage('Ada', 'Maths\u00a0')) === JSON.stringify(build('toolkit-download', { 'first-name': 'Ada', subject: 'maths' })), 'nbsp after the label still maps');

  for (const label of ['Other', 'other', 'OTHER', 'Other (please say)', 'Drama', 'Mathematics', 'Maths and Science', '', null]) {
    const msg = leadMessage('Ada', label);
    const text = render(msg.lines).text;
    check(msg.subject === 'Your GCSE misconceptions PDFs', 'fallback subject for ' + JSON.stringify(label));
    const order = PDFS.map((f) => text.indexOf(f));
    check(order.every((n, i) => n > (i ? order[i - 1] : -1)), 'all five pdfs in order for ' + JSON.stringify(label), order.join(','));
    check(text.includes(HINGE) && text.includes('Hi Ada,'), 'fallback keeps the shared close for ' + JSON.stringify(label));
    check(!text.includes('Drama') && !text.includes('<script'), 'fallback does not echo the label');
  }

  const nasty = render(leadMessage('<script>', 'Drama <script>alert(1)</script>').lines).html;
  check(nasty.includes('Hi &lt;script&gt;,') && !nasty.includes('<script'), 'fallback escapes the name and drops the label');

  const huge = 'A'.repeat(90) + ' Lovelace';
  check(leadMessage(huge, 'Maths').lines[0] === 'Hi ' + 'A'.repeat(80) + ',', 'lead first name is clipped at 80');
  check(build('toolkit-download', { 'first-name': huge, subject: 'maths' }).lines[0] === 'Hi ' + 'A'.repeat(90) + ',', 'form first name is not clipped');

  await withEnv({ LEAD_WEBHOOK_SECRET: SECRET, PRIVATEEMAIL_PASSWORD: MAIL_PW }, async () => {
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => form.handler(formEvent({
        'first-name': 'Ada Lovelace',
        email: '  ' + ADA + '  ',
        subject: 'maths',
      })));
      check(seen.result.statusCode === 200 && seen.result.body === 'sent', 'form maths sends', seen.result.body);
      check(seen.logs.join('\n') === 'pdf email sent for toolkit-download', 'form log line');
      const msg = sendJson(calls);
      check(msg && msg.subject === 'Your GCSE Maths misconceptions PDF', 'form mailed the maths subject');
      check(msg && msg.to[0].address === ADA, 'form trims the email');
      check(msg && msg.from[0].address === 'support@dotheygetit.app' && msg.from[0].name === 'Craig - Get It?', 'from Craig');
      check(msg && msg.password === '' && msg.composeType === 'New' && msg.importance === 'Normal', 'send payload shape');
      check(msg && Array.isArray(msg.cc) && msg.cc.length === 0 && msg.attachments.length === 0, 'no cc or attachments');
      check(msg && msg.htmlBody === render(leadMessage('Ada Lovelace', 'Maths').lines).html, 'form html matches the FB Maths html');
      const token = calls[0];
      check(token.url === 'https://privateemail.com/connect/token', 'token url');
      check(token.opts.body.get('password') === MAIL_PW, 'mailbox password goes to the token call');
      check(token.opts.body.get('username') === 'support@dotheygetit.app', 'mailbox user');
      check(token.opts.headers['User-Agent'] === 'getit-site/1.0', 'token user agent');
      check(calls[1].opts.headers.Authorization === 'Bearer tok', 'bearer token');
      check(calls[1].opts.headers['User-Agent'] === 'getit-site/1.0', 'send user agent');
      check(!JSON.stringify(msg).includes(MAIL_PW), 'mailbox password is not in the send body');
      check(!seen.logs.join('\n').includes(MAIL_PW) && !seen.errs.join('\n').includes(MAIL_PW), 'password is not logged');
      const again = await capture(() => form.handler(formEvent({
        'first-name': 'Ada Lovelace',
        email: ADA,
        subject: 'maths',
      })));
      check(again.result.body === 'sent', 'second form send');
      check(sendJson(calls.slice(2)).idempotencyKey !== msg.idempotencyKey, 'each send gets its own idempotency key');
    });

    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({
        full_name: 'Ada Lovelace',
        email: '  ' + ADA + ' ',
        subject: 'Maths',
        ad_id: '123',
      })));
      check(seen.result.statusCode === 200 && seen.result.body === 'sent', 'fb maths sends', JSON.stringify(seen.result));
      check(seen.logs.join('\n') === 'fb lead pdf email sent Your GCSE Maths misconceptions PDF', 'fb log line');
      check(!seen.logs.join('\n').includes(ADA) && !seen.logs.join('\n').includes(SECRET), 'fb log skips the address and the secret');
      const formCalls = [];
      const prev = global.fetch;
      global.fetch = async (url, opts) => {
        formCalls.push({ url: String(url), opts });
        return prev(url, opts);
      };
      await capture(() => form.handler(formEvent({ 'first-name': 'Ada Lovelace', email: ADA, subject: 'maths' })));
      global.fetch = prev;
      const samePayload = JSON.stringify(calm(sendJson(calls))) === JSON.stringify(calm(sendJson(formCalls)));
      check(samePayload, 'fb maths payload matches the form', samePayload ? '' : JSON.stringify(calm(sendJson(calls))));
    });

    await withFetch('ok', async (calls) => {
      const raw = {
        id: 'lead-1',
        field_data: [
          { name: 'full_name', values: ['Grace Hopper'] },
          { name: 'email', values: [ADA] },
          { name: 'subject', values: ['History'] },
        ],
      };
      const seen = await capture(() => fb.handler(fbEvent(raw)));
      check(seen.result.body === 'sent', 'raw field_data lead sends', seen.result.body);
      const msg = sendJson(calls);
      check(msg.subject === 'Your GCSE History misconceptions PDF', 'field_data history');
      check(msg.textBody.startsWith('Hi Grace,'), 'field_data first name', msg.textBody.slice(0, 20));
      check(msg.to[0].address === ADA, 'field_data email');
    });

    await withFetch('ok', async (calls) => {
      const mixed = {
        email: ADA,
        'Full Name': 'Grace Hopper',
        field_data: [
          { name: 'email', values: ['other@school.sch.uk'] },
          { name: 'subject', values: ['Geography'] },
        ],
      };
      const seen = await capture(() => fb.handler(fbEvent(mixed)));
      check(seen.result.body === 'sent', 'mixed flat and field_data sends');
      const msg = sendJson(calls);
      check(msg.to[0].address === ADA, 'flat email wins over field_data');
      check(msg.textBody.startsWith('Hi Grace,'), 'Full Name key is accepted');
      check(msg.subject === 'Your GCSE Geography misconceptions PDF', 'subject filled from field_data');
    });

    await withFetch('ok', async (calls) => {
      const body = Buffer.from(JSON.stringify({
        full_name: 'Ada Lovelace',
        email_address: ADA,
        subject: 'English',
      })).toString('base64');
      const seen = await capture(() => fb.handler(fbEvent(body, {
        isBase64Encoded: true,
        headers: { 'x-lead-secret': [SECRET] },
      })));
      check(seen.result.statusCode === 200 && seen.result.body === 'sent', 'base64 body and header array', seen.result.body);
      check(sendJson(calls).subject === 'Your GCSE English misconceptions PDF', 'email_address and English label');
    });

    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({
        full_name: 'Ada Lovelace',
        email: ADA,
        subject: 'Other',
      })));
      check(seen.result.statusCode === 200 && seen.result.body === 'sent', 'Other sends');
      const msg = sendJson(calls);
      check(msg.subject === 'Your GCSE misconceptions PDFs', 'Other subject line');
      check(PDFS.every((f) => msg.htmlBody.includes(f) && msg.textBody.includes(f)), 'Other links every pdf');
      check(!msg.htmlBody.includes('>Other<') && !msg.textBody.includes('Other'), 'Other is not echoed');
    });

    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler({
        headers: { 'x-lead-secret': SECRET },
        body: JSON.stringify({ full_name: 'Ada', email: ADA, subject: 'Maths' }),
      }));
      check(seen.result.statusCode === 200 && seen.result.body === 'sent', 'missing http method still sends');
      check(calls.length === 2, 'missing method still called the mailbox', String(calls.length));
    });

    const longOk = 'a'.repeat(60) + '@' + 'b'.repeat(190) + '.co';
    check(longOk.length === 254, 'fixture is 254 chars', String(longOk.length));
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({ email: longOk, subject: 'Maths', full_name: 'Ada' })));
      check(seen.result.statusCode === 200, '254-char email is accepted', seen.result.body);
      check(sendJson(calls).to[0].address === longOk, '254-char email is the recipient');
    });

    await withFetch('ok', async (calls) => {
      const cases = [
        [fbEvent({ email: 'not-an-email', subject: 'Maths', full_name: 'Ada' }), 'bad email'],
        [fbEvent({ email: 'ada@school', subject: 'Maths' }), 'bad email'],
        [fbEvent({ email: longOk + 'x', subject: 'Maths' }), 'bad email'],
        [fbEvent({ full_name: 'Ada', subject: 'Maths' }), 'bad email'],
        [fbEvent('{'), 'bad json'],
        [fbEvent('null'), 'bad json'],
        [fbEvent('[1,2]'), 'bad json'],
        [fbEvent(''), 'bad email'],
      ];
      for (const [event, body] of cases) {
        const seen = await capture(() => fb.handler(event));
        check(seen.result.statusCode === 400 && seen.result.body === body, '400 ' + body + ' for ' + event.body, seen.result.statusCode + ' ' + seen.result.body);
      }
      check(calls.length === 0, 'invalid leads do not call the mailbox', String(calls.length));
    });

    await withFetch('ok', async (calls) => {
      const noSecret = await capture(() => fb.handler(fbEvent({ email: ADA, subject: 'Maths' }, { headers: {} })));
      check(noSecret.result.statusCode === 401 && noSecret.result.body === 'unauthorized', 'missing header is 401');
      const wrong = await capture(() => fb.handler(fbEvent({ email: ADA }, { headers: { 'x-lead-secret': 'lead-secret-test-valuX' } })));
      check(wrong.result.statusCode === 401, 'same-length wrong secret is 401');
      const short = await capture(() => fb.handler(fbEvent({ email: ADA }, { headers: { 'x-lead-secret': 'nope' } })));
      check(short.result.statusCode === 401, 'short secret is 401');
      const get = await capture(() => fb.handler(fbEvent({ email: ADA }, { httpMethod: 'GET' })));
      check(get.result.statusCode === 405 && get.result.body === 'method', 'GET with the secret is 405', get.result.body);
      const anonGet = await capture(() => fb.handler({ httpMethod: 'GET', headers: {}, body: '' }));
      check(anonGet.result.statusCode === 401, 'GET without the secret is 401');
      check(calls.length === 0, 'rejected calls do not send', String(calls.length));
      check(!noSecret.errs.join('\n').includes(SECRET) && !wrong.errs.join('\n').includes(SECRET), 'rejected secret is not logged');
    });

    await withFetch('send-fail', async () => {
      const seen = await capture(() => fb.handler(fbEvent({ full_name: 'Ada', email: ADA, subject: 'Maths' })));
      check(seen.result.statusCode === 502 && seen.result.body === 'error', 'send failure is 502', seen.result.statusCode + ' ' + seen.result.body);
      check(seen.errs.join('\n').includes('send failed: HTTP 500') && seen.errs.join('\n').includes('smtp down'), 'send failure is logged');
      check(!seen.result.body.includes('smtp'), 'upstream error is not returned to the caller');
    });

    await withFetch('login-fail', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({ email: ADA, subject: 'Maths', full_name: 'Ada' })));
      check(seen.result.statusCode === 502 && seen.result.body === 'error', 'login failure is 502');
      check(calls.length === 1, 'login failure does not send', String(calls.length));
      check(seen.errs.join('\n').includes('login failed: HTTP 401'), 'login failure is logged');
    });

    await withFetch('throw', async () => {
      const seen = await capture(() => fb.handler(fbEvent({ email: ADA, subject: 'Science', full_name: 'Ada' })));
      check(seen.result.statusCode === 502 && seen.result.body === 'error', 'network failure is 502');
      check(seen.errs.join('\n').includes('network down'), 'network failure is logged');
    });

    await withFetch('send-fail', async (calls) => {
      const seen = await capture(() => form.handler(formEvent({ 'first-name': 'Ada', email: ADA, subject: 'maths' })));
      check(seen.result.statusCode === 200 && seen.result.body === 'error', 'form send failure stays 200', seen.result.statusCode + ' ' + seen.result.body);
      check(seen.errs.join('\n').includes('pdf email error:'), 'form error log unchanged');
      check(calls.length === 2, 'form still tried to send', String(calls.length));
    });

    await withFetch('ok', async (calls) => {
      const skipped = [
        formEvent({ 'first-name': 'Ada', email: ADA, subject: 'Other' }),
        formEvent({ 'first-name': 'Ada', email: ADA, subject: 'Drama' }),
        formEvent({ 'first-name': 'Ada', email: 'not-an-email', subject: 'maths' }),
        formEvent({ 'first-name': 'Ada', email: ADA }, 'newsletter'),
      ];
      for (const event of skipped) {
        const seen = await capture(() => form.handler(event));
        check(seen.result.statusCode === 200 && seen.result.body === 'skipped', 'form skips ' + event.body.slice(0, 80), seen.result.body);
      }
      const bad = await capture(() => form.handler({ body: '{' }));
      check(bad.result.statusCode === 200 && bad.result.body === 'error', 'form bad json stays 200', bad.result.body);
      check(calls.length === 0, 'skipped form submissions do not send', String(calls.length));
    });
  });

  await withEnv({ LEAD_WEBHOOK_SECRET: SECRET + '\n', PRIVATEEMAIL_PASSWORD: MAIL_PW }, async () => {
    await withFetch('ok', async (calls) => {
      const padded = await capture(() => fb.handler(fbEvent(
        { email: ADA, subject: 'Maths', full_name: 'Ada' },
        { headers: { 'x-lead-secret': '  ' + SECRET + '  ' } }
      )));
      check(padded.result.statusCode === 200 && padded.result.body === 'sent', 'surrounding whitespace on the secret is ignored', padded.result.body);
      check(calls.length === 2, 'trimmed secret still sends');
    });
  });

  await withEnv({ LEAD_WEBHOOK_SECRET: '   ', PRIVATEEMAIL_PASSWORD: MAIL_PW }, async () => {
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({ email: ADA, subject: 'Maths' }, { headers: { 'x-lead-secret': '   ' } })));
      check(seen.result.statusCode === 401, 'blank secret env rejects everyone');
      check(seen.errs.join('\n').includes('LEAD_WEBHOOK_SECRET not set'), 'blank secret is logged as unset');
      check(calls.length === 0, 'blank secret does not send');
    });
  });

  await withEnv({ LEAD_WEBHOOK_SECRET: undefined, PRIVATEEMAIL_PASSWORD: MAIL_PW }, async () => {
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({ email: ADA, subject: 'Maths' })));
      check(seen.result.statusCode === 401 && seen.result.body === 'unauthorized', 'unset secret is 401');
      check(seen.errs.join('\n').includes('LEAD_WEBHOOK_SECRET not set'), 'unset secret is logged');
      check(calls.length === 0, 'unset secret does not send');
    });
  });

  await withEnv({ LEAD_WEBHOOK_SECRET: SECRET, PRIVATEEMAIL_PASSWORD: undefined }, async () => {
    await withFetch('ok', async (calls) => {
      const lead = await capture(() => fb.handler(fbEvent({ email: ADA, subject: 'Maths', full_name: 'Ada' })));
      check(lead.result.statusCode === 502 && lead.result.body === 'error', 'missing mailbox password is 502 for a lead');
      check(lead.errs.join('\n').includes('PRIVATEEMAIL_PASSWORD not set'), 'missing password is logged');
      const site = await capture(() => form.handler(formEvent({ 'first-name': 'Ada', email: ADA, subject: 'maths' })));
      check(site.result.statusCode === 200 && site.result.body === 'error', 'missing mailbox password stays 200 for the form');
      check(calls.length === 0, 'missing password does not call the mailbox');
    });
  });

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach((x) => console.log('  ok   ' + x));
  fail.forEach((x) => console.log('  FAIL ' + x));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('TEST CRASHED: ' + (e && e.stack || e));
  process.exit(1);
});
