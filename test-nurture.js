/* Teaching-tip sequence: consent, schedule, dedupe, unsubscribe, and a dry run.
   Day 0 PDF emails stay the same, including when marketing_consent is empty. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { build, render, leadMessage } = require('./netlify/functions/lib/pdf-mail');
const form = require('./netlify/functions/submission-created');
const fb = require('./netlify/functions/fb-lead');
const sender = require('./netlify/functions/nurture-send');
const unsubFn = require('./netlify/functions/nurture-unsubscribe');
const { setStoreForTests, memoryStore } = require('./netlify/functions/lib/nurture-store');
const {
  marketingConsent, ukDate, nextStepDay, contentForDay, COPY, planPeople, formatPlan,
  enrol, runNurture, signToken, verifyToken, nurtureEnabled, unsubscribeSecret,
  nurtureIdempotencyKey, LIMITS, renderTip,
} = require('./netlify/functions/lib/nurture');

const SECRET = 'nurture-test-secret-value';
const LEAD = 'lead-secret-test-value';
const MAIL = 'mailbox-password-test-value';
const ADA = 'ada@school.sch.uk';

const pass = [];
const fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

async function withEnv(vars, fn) {
  const prev = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
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
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  try {
    return await fn(calls);
  } finally {
    global.fetch = prev;
  }
}

function sendJson(calls) {
  const hit = calls.find((call) => call.url.includes('/sendmessage'));
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
      payload: { form_name: formName || 'toolkit-download', email: data.email, data },
    }),
  };
}

function fbEvent(body, extra) {
  return Object.assign({
    httpMethod: 'POST',
    headers: { 'x-lead-secret': LEAD },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }, extra || {});
}

function formInner(html, formName) {
  const marker = 'name="' + formName + '"';
  const at = html.indexOf(marker);
  if (at < 0) return '';
  const start = html.lastIndexOf('<form', at);
  const end = html.indexOf('</form>', at);
  if (start < 0 || end < 0) return '';
  return html.slice(start, end);
}

(async () => {
  const yes = [true, 1, 'true', 'TRUE', ' True ', '1', 'yes', 'YES', ' Yes '];
  for (const value of yes) check(marketingConsent(value) === true, 'consent yes ' + JSON.stringify(value));
  const no = [false, 0, null, undefined, '', 'false', 'FALSE', 'no', 'on', 'y', 'Yes, send me tips', 'yesterday', '2'];
  for (const value of no) check(marketingConsent(value) === false, 'consent no ' + JSON.stringify(value));
  check(marketingConsent([]) === false, 'empty consent list is no');
  check(marketingConsent(['', 'false']) === false, 'list of nos is no');
  check(marketingConsent(['false', 'yes']) === true, 'list containing yes is yes');
  check(marketingConsent({ value: '' }) === false, 'empty wrapped consent is no');
  check(marketingConsent({ value: 'true' }) === true, 'wrapped true is yes');
  check(marketingConsent(Symbol('x')) === false, 'odd consent value does not throw');

  check(ukDate('2026-06-30T23:30:00.000Z') === '2026-07-01', 'BST date rolls forward');
  check(ukDate('2026-10-29T23:30:00.000Z') === '2026-10-29', 'GMT date stays put');
  check(nextStepDay(0, 1) === null && nextStepDay(0, 2) === 2, 'day 2 is the first tip');
  check(nextStepDay(2, 4) === null && nextStepDay(2, 5) === 5, 'day 5 waits until day 5');
  check(nextStepDay(9, 30) === 14, 'a late run still sends the next unsent step');
  check(nextStepDay(14, 28) === 28 && nextStepDay(28, 42) === 42 && nextStepDay(42, 56) === 56, 'tips every 14 days after day 14');
  check(contentForDay(42) === contentForDay(28), 'a tip with no entry of its own reuses the day 28 copy');
  check(contentForDay(42, COPY.concat([{ day: 42, subject: 'own', preview: 'p', body: 'b', cta_label: 'c', cta_url: 'https://dotheygetit.app/' }])).subject === 'own', 'an exact later day wins');
  check(COPY.every((item) => String(item.subject).includes('[PLACEHOLDER]') && String(item.body).includes('[PLACEHOLDER]')), 'copy is still placeholder');

  const escaped = renderTip(COPY[0], {
    first_name: 'A"<da',
    subject: 'GCSE Maths',
    unsubscribe_url: 'https://dotheygetit.app/unsubscribe?token=abc',
  });
  check(escaped.html.includes('A&quot;&lt;da') && !escaped.html.includes('A"<da'), 'tip html escapes the name');
  check(escaped.text.includes('A"<da'), 'tip text keeps the name');
  check(escaped.html.includes('https://dotheygetit.app/unsubscribe?token=abc') && escaped.text.includes('Unsubscribe:'), 'tip includes the unsubscribe link');

  const store = memoryStore();
  setStoreForTests(store);
  await enrol(store, { email: 'Ada@School.sch.uk', firstName: 'Ada', subject: 'maths', source: 'site', consent: 'yes', now: '2026-10-27T09:00:00.000Z' });
  await enrol(store, { email: ADA, firstName: 'Grace', subject: 'science', source: 'facebook', consent: 'yes', now: '2026-11-01T09:00:00.000Z' });
  let ada = await store.get(ADA);
  check(ada && ada.subject === 'maths' && ada.source === 'site' && ada.marketingConsent === true, 're-signup does not restart');
  check(ada.signedUpAt === '2026-10-27T09:00:00.000Z' && ada.enrolledAt === '2026-10-27T09:00:00.000Z', 're-signup keeps the original clock');
  ada.lastStepSent = 5;
  await store.setJSON(ADA, ada);
  await enrol(store, { email: ADA, firstName: 'Ada', subject: 'english', source: 'site', consent: 'true', now: '2026-11-02T09:00:00.000Z' });
  ada = await store.get(ADA);
  check(ada.lastStepSent === 5 && ada.subject === 'maths', 're-signup keeps progress and the first subject');

  await enrol(store, { email: 'bob@school.sch.uk', firstName: 'Bob', subject: 'science', source: 'site', consent: '', now: '2026-10-01T09:00:00.000Z' });
  await enrol(store, { email: 'bob@school.sch.uk', firstName: 'Bob', subject: 'science', source: 'site', consent: 'true', now: '2026-10-27T09:00:00.000Z' });
  const bob = await store.get('bob@school.sch.uk');
  check(bob.marketingConsent === true && bob.signedUpAt === '2026-10-01T09:00:00.000Z' && bob.enrolledAt === '2026-10-27T09:00:00.000Z', 'later consent starts the clock then');
  check(bob.consentedAt === '2026-10-27T09:00:00.000Z', 'consent time is stored');

  const summer = planPeople([
    { email: 'sam@school.sch.uk', firstName: 'Sam', subject: 'maths', source: 'site', marketingConsent: true, enrolledAt: '2026-06-30T23:30:00.000Z', consentedAt: '2026-06-30T23:30:00.000Z', lastStepSent: 0, unsubscribed: false },
  ], '2026-07-02');
  check(summer.due.length === 0 && summer.skipped[0].reason.includes('2026-07-03'), 'day 2 uses the London date', summer.skipped[0] && summer.skipped[0].reason);
  const summerDue = planPeople([
    { email: 'sam@school.sch.uk', firstName: 'Sam', subject: 'maths', source: 'site', marketingConsent: true, enrolledAt: '2026-06-30T23:30:00.000Z', consentedAt: '2026-06-30T23:30:00.000Z', lastStepSent: 0, unsubscribed: false },
  ], '2026-07-03');
  check(summerDue.due.length === 1 && summerDue.due[0].day === 2, 'day 2 is due on the London day 2');

  const fixtures = JSON.parse(fs.readFileSync(path.join('scripts', 'nurture-fixtures.json'), 'utf8'));
  const plan = planPeople(fixtures, '2026-10-29');
  const printed = formatPlan(plan);
  check(plan.date === '2026-10-29' && plan.due.length === 5 && plan.skipped.length === 4, 'sample plan counts', plan.due.length + '/' + plan.skipped.length);
  check(printed.includes('ada@school.sch.uk  site  maths  day 2  [PLACEHOLDER] Day 2: GCSE Maths for Ada'), 'ada day 2');
  check(printed.includes('grace@school.sch.uk  facebook  all  day 5  [PLACEHOLDER] Day 5: GCSE for Grace'), 'grace day 5');
  check(printed.includes('eve@school.sch.uk  site  geography  day 28  [PLACEHOLDER] Tip: GCSE Geography for Eve'), 'eve fortnightly tip');
  check(printed.includes('gus@school.sch.uk  site  pack  day 2  [PLACEHOLDER] Day 2: your classroom for Gus'), 'pack download day 2');
  check(printed.includes('helen@school.sch.uk  site  english  day 2  [PLACEHOLDER] Day 2: GCSE English for Helen'), 'later consent is not back-dated');
  check(printed.includes('bob@school.sch.uk  not due until day 2 on 2026-10-31'), 'same-day signup is not due');
  check(printed.includes('cara@school.sch.uk  no marketing consent'), 'no consent is skipped');
  check(printed.includes('dan@school.sch.uk  unsubscribed'), 'unsubscribed is skipped');
  check(printed.includes('fay@school.sch.uk  already sent today, day 28 waits until tomorrow'), 'one tip per UK day');
  check(printed.includes('No email is sent'), 'dry run says it does not send');

  const dry = spawnSync(process.execPath, ['scripts/nurture-dry-run.js', '--date', '2026-10-29'], { encoding: 'utf8' });
  check(dry.status === 0, 'dry run exits 0', dry.stderr);
  check(dry.stdout.includes('ada@school.sch.uk  site  maths  day 2') && dry.stdout.includes('at most ' + LIMITS.maxSends), 'dry run script lists ada and the cap');
  check(dry.stdout.includes('sample, not the live list'), 'dry run is not the live list');

  await withEnv({ NURTURE_ENABLED: undefined }, async () => {
    check(nurtureEnabled() === false, 'nurture defaults to off');
  });
  for (const off of ['', 'false', '0', 'no', 'off']) {
    await withEnv({ NURTURE_ENABLED: off }, async () => check(nurtureEnabled() === false, 'off ' + JSON.stringify(off)));
  }
  for (const on of ['true', 'TRUE', 'yes', '1', 'on']) {
    await withEnv({ NURTURE_ENABLED: on }, async () => check(nurtureEnabled() === true, 'on ' + JSON.stringify(on)));
  }
  await withEnv({ NURTURE_UNSUBSCRIBE_SECRET: undefined }, async () => {
    check(unsubscribeSecret() === '', 'unset unsubscribe secret is ignored');
  });
  await withEnv({ NURTURE_UNSUBSCRIBE_SECRET: 'too-short' }, async () => {
    check(unsubscribeSecret() === '', 'short unsubscribe secret is ignored');
  });

  const live = memoryStore();
  await enrol(live, { email: ADA, firstName: 'Ada', subject: 'maths', source: 'site', consent: 'yes', now: '2026-10-27T09:00:00.000Z' });
  await enrol(live, { email: 'zoe@school.sch.uk', firstName: 'Zoe', subject: 'english', source: 'facebook', consent: 'true', now: '2026-10-27T09:00:00.000Z' });
  await enrol(live, { email: 'no@school.sch.uk', firstName: 'No', subject: 'maths', source: 'site', consent: 'false', now: '2026-10-01T09:00:00.000Z' });
  const sentTo = [];
  const held = await runNurture({
    store: live, now: '2026-10-29', secret: SECRET, enabled: false, gapMs: 0, max: 10,
    send: async (msg) => sentTo.push(msg),
  });
  check(held.enabled === false && sentTo.length === 0 && held.due.length === 2, 'disabled run sends nothing', String(held.due.length));

  const first = await runNurture({
    store: live, now: '2026-10-29', secret: SECRET, enabled: true, gapMs: 0, max: 1, budgetMs: 60000,
    send: async (msg) => sentTo.push(msg),
  });
  check(first.sent.length === 1 && first.sent[0].email === ADA && first.sent[0].day === 2, 'cap sends the first due person');
  check(first.deferred.length === 1 && first.deferred[0].email === 'zoe@school.sch.uk', 'cap defers the rest');
  check((await live.get(ADA)).lastStepSent === 2 && (await live.get('zoe@school.sch.uk')).lastStepSent === 0, 'only the sent row advances');
  check(sentTo[0].idempotencyKey === nurtureIdempotencyKey(ADA, 2), 'idempotency key is stable for that step');
  check(nurtureIdempotencyKey(ADA, 2) !== nurtureIdempotencyKey(ADA, 5), 'a later step gets its own key');
  const second = await runNurture({
    store: live, now: '2026-10-29', secret: SECRET, enabled: true, gapMs: 0, max: 10, budgetMs: 60000,
    send: async (msg) => sentTo.push(msg),
  });
  check(second.sent.length === 1 && second.sent[0].email === 'zoe@school.sch.uk', 'the same day sends the person who was deferred');
  check(sentTo.filter((msg) => msg.to === ADA).length === 1, 'ada is not mailed twice the same day');
  check((await live.get('no@school.sch.uk')).lastStepSent === 0, 'no consent is never advanced');

  const flaky = memoryStore();
  await enrol(flaky, { email: ADA, firstName: 'Ada', subject: 'maths', source: 'site', consent: 'yes', now: '2026-10-27T09:00:00.000Z' });
  let blows = 0;
  const failed = await runNurture({
    store: flaky, now: '2026-10-29', secret: SECRET, enabled: true, gapMs: 0,
    send: async () => { blows += 1; throw new Error('smtp down'); },
  });
  check(failed.sent.length === 0 && (await flaky.get(ADA)).lastStepSent === 0 && !(await flaky.get(ADA)).pending, 'a failed send does not advance');
  const retried = await runNurture({
    store: flaky, now: '2026-10-29', secret: SECRET, enabled: true, gapMs: 0,
    send: async () => { blows += 1; },
  });
  check(retried.sent.length === 1 && blows === 2 && (await flaky.get(ADA)).lastStepSent === 2, 'the next run retries a failed send once');

  setStoreForTests(flaky);
  const token = signToken(ADA, SECRET);
  check(verifyToken(token, SECRET) === ADA, 'token round trip');
  check(verifyToken(token, SECRET + 'x') === '', 'wrong secret is rejected');
  check(verifyToken(token.slice(0, -2) + (token.endsWith('a') ? 'b' : 'a'), SECRET) === '', 'tampered token is rejected');
  check(verifyToken('not-a-token', SECRET) === '', 'garbage token is rejected');

  await withEnv({ NURTURE_UNSUBSCRIBE_SECRET: SECRET }, async () => {
    const ok = await unsubFn.handler({ httpMethod: 'GET', queryStringParameters: { token } });
    check(ok.statusCode === 200 && ok.body.includes('unsubscribed') && !ok.body.includes(ADA), 'unsubscribe page does not echo the address');
    check((await flaky.get(ADA)).unsubscribed === true, 'unsubscribe is stored');
    const again = await unsubFn.handler({ httpMethod: 'POST', rawQuery: 'token=' + encodeURIComponent(token) });
    check(again.statusCode === 200 && (await flaky.get(ADA)).unsubscribed === true, 'unsubscribe is idempotent');
    await enrol(flaky, { email: ADA, firstName: 'Ada', subject: 'science', source: 'facebook', consent: 'true', now: '2026-11-01T09:00:00.000Z' });
    check((await flaky.get(ADA)).unsubscribed === true && (await flaky.get(ADA)).subject === 'maths', 'a later opt-in does not undo unsubscribe');
    const bad = await unsubFn.handler({ httpMethod: 'GET', queryStringParameters: { token: 'nope' } });
    check(bad.statusCode === 400, 'bad unsubscribe link is 400');
    const method = await unsubFn.handler({ httpMethod: 'DELETE', queryStringParameters: { token } });
    check(method.statusCode === 405, 'other methods are rejected');
  });
  await withEnv({ NURTURE_UNSUBSCRIBE_SECRET: '' }, async () => {
    const blocked = await unsubFn.handler({ httpMethod: 'GET', queryStringParameters: { token } });
    check(blocked.statusCode === 500 && blocked.body.includes('support@dotheygetit.app'), 'missing secret does not pretend it worked');
  });

  let late = 0;
  const stopped = await runNurture({
    store: flaky, now: '2026-11-03', secret: SECRET, enabled: true, gapMs: 0,
    send: async () => { late += 1; },
  });
  check(stopped.sent.length === 0 && late === 0, 'unsubscribed people get nothing further');

  setStoreForTests(store);
  await withEnv({ LEAD_WEBHOOK_SECRET: LEAD, PRIVATEEMAIL_PASSWORD: MAIL }, async () => {
    await withFetch('ok', async (calls) => {
      const plain = await capture(() => form.handler(formEvent({
        'first-name': 'Ada Lovelace', email: ADA, subject: 'maths', consent: 'yes',
      })));
      const opted = await capture(() => form.handler(formEvent({
        'first-name': 'Ada Lovelace', email: ADA, subject: 'maths', consent: 'yes', marketing_consent: 'yes',
      })));
      check(plain.result.body === 'sent' && opted.result.body === 'sent', 'form still returns sent');
      check(plain.logs.join('\n') === 'pdf email sent for toolkit-download', 'form log line unchanged');
      const a = sendJson(calls);
      const b = sendJson(calls.slice(2));
      check(JSON.stringify(calm(a)) === JSON.stringify(calm(b)), 'ticking the optional box does not change the PDF email');
      check(a.subject === 'Your GCSE Maths misconceptions PDF' && !Object.prototype.hasOwnProperty.call(a, 'headers'), 'day 0 payload has no header field');
      const expected = render(build('toolkit-download', { 'first-name': 'Ada Lovelace', subject: 'maths' }).lines);
      check(a.htmlBody === expected.html && a.textBody === expected.text, 'day 0 body still matches the PDF mailer');
      check(a.from[0].address === 'support@dotheygetit.app' && a.from[0].name === 'Craig - Get It?' && a.password === '' && a.attachments.length === 0, 'day 0 envelope unchanged');
    });

    const fresh = memoryStore();
    setStoreForTests(fresh);
    await withFetch('ok', async (calls) => {
      const empty = await capture(() => fb.handler(fbEvent({
        full_name: 'Ada Lovelace', email: ADA, subject: 'Maths', marketing_consent: '',
      })));
      check(empty.result.statusCode === 200 && empty.result.body === 'sent', 'empty marketing_consent still sends the PDF', empty.result.body);
      check(empty.logs.join('\n') === 'fb lead pdf email sent Your GCSE Maths misconceptions PDF', 'fb log line unchanged');
      check(calls.length === 2, 'empty consent still called the mailbox', String(calls.length));
      check(!empty.errs.join('\n'), 'empty consent does not log an error', empty.errs.join('\n'));
      const row = await fresh.get(ADA);
      check(row && row.marketingConsent === false && row.source === 'facebook' && row.subject === 'maths', 'empty consent is stored as no');
      const absent = await capture(() => fb.handler(fbEvent({
        full_name: 'Bea', email: 'bea@school.sch.uk', subject: 'Maths',
      })));
      check(absent.result.body === 'sent' && (await fresh.get('bea@school.sch.uk')).marketingConsent === false, 'missing consent still sends and does not opt in');
      const falsy = await capture(() => fb.handler(fbEvent({
        full_name: 'Cid', email: 'cid@school.sch.uk', subject: 'Maths', marketing_consent: 'false',
      })));
      check(falsy.result.body === 'sent' && (await fresh.get('cid@school.sch.uk')).marketingConsent === false, 'the string false is not consent');
      const truthy = await capture(() => fb.handler(fbEvent({
        full_name: 'Dee', email: 'dee@school.sch.uk', subject: 'Other', marketing_consent: 'TRUE',
      })));
      const dee = await fresh.get('dee@school.sch.uk');
      check(truthy.result.body === 'sent' && dee.marketingConsent === true && dee.subject === 'all' && dee.consentedAt, 'TRUE opts in and keeps the all-banks PDF subject');
      check(sendJson(calls.slice(-2)).subject === 'Your GCSE misconceptions PDFs', 'other still gets every PDF');
      const tips = await capture(() => fb.handler(fbEvent({
        full_name: 'Eve', email: 'eve@school.sch.uk', subject: 'Maths', marketing_consent: 'Yes, send me tips',
      })));
      check(tips.result.body === 'sent' && (await fresh.get('eve@school.sch.uk')).marketingConsent === false, 'only true, 1, and yes count');
      const one = await capture(() => fb.handler(fbEvent({
        full_name: 'Fay', email: 'fay@school.sch.uk', subject: 'History', marketing_consent: '1',
      })));
      check(one.result.body === 'sent' && (await fresh.get('fay@school.sch.uk')).marketingConsent === true, 'the string 1 is consent');
      const override = await capture(() => fb.handler(fbEvent({
        full_name: 'Gus',
        email: 'gus@school.sch.uk',
        subject: 'Geography',
        marketing_consent: '',
        field_data: [{ name: 'marketing_consent', values: ['true'] }],
      })));
      check(override.result.body === 'sent' && (await fresh.get('gus@school.sch.uk')).marketingConsent === false, 'a flat empty consent wins over field_data');
      const fromFields = await capture(() => fb.handler(fbEvent({
        full_name: 'Hal',
        email: 'hal@school.sch.uk',
        subject: 'English',
        field_data: [{ name: 'marketing_consent', values: ['true'] }],
      })));
      check(fromFields.result.body === 'sent' && (await fresh.get('hal@school.sch.uk')).marketingConsent === true, 'field_data true is consent when the flat field is absent');
    });

    await withFetch('ok', async () => {
      const site = await capture(() => form.handler(formEvent({
        'first-name': 'Ivy', email: 'ivy@school.sch.uk', subject: 'maths', consent: 'yes',
      })));
      check(site.result.body === 'sent' && (await fresh.get('ivy@school.sch.uk')).marketingConsent === false, 'the required emails box is not the tips box');
      const pack = await capture(() => form.handler(formEvent({
        'first-name': 'Jay', email: 'jay@school.sch.uk', subject: 'History', marketing_consent: 'yes',
      }, 'pack-download')));
      const jay = await fresh.get('jay@school.sch.uk');
      check(pack.result.body === 'sent' && jay.marketingConsent === true && jay.subject === 'pack', 'pack opt-in is stored as pack');
      check(pack.logs.join('\n') === 'pdf email sent for pack-download', 'pack log line unchanged');
    });

    const boom = memoryStore();
    boom.setJSON = async () => { throw new Error('blobs down'); };
    setStoreForTests(boom);
    await withFetch('send-fail', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({
        full_name: 'Ada', email: ADA, subject: 'Maths', marketing_consent: '',
      })));
      check(seen.result.statusCode === 502 && seen.result.body === 'error', 'a failed PDF send is still 502');
      check(calls.length === 2, 'failure still attempted the send');
      check((await boom.list()).blobs.length === 0, 'a failed PDF send stores nobody');
    });
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => fb.handler(fbEvent({
        full_name: 'Ada', email: ADA, subject: 'Maths', marketing_consent: 'true',
      })));
      check(seen.result.statusCode === 200 && seen.result.body === 'sent', 'a store failure still returns sent', seen.result.body);
      check(seen.errs.join('\n').includes('nurture enrol failed:') && seen.errs.join('\n').includes('blobs down'), 'store failure is logged');
      check(calls.length === 2, 'the PDF was still handed to the mailbox');
      const site = await capture(() => form.handler(formEvent({
        'first-name': 'Ada', email: ADA, subject: 'maths', marketing_consent: 'yes',
      })));
      check(site.result.body === 'sent', 'a store failure does not turn the form into an error', site.result.body);
    });
  });

  setStoreForTests(null);
  await withEnv({ NURTURE_ENABLED: undefined, NURTURE_UNSUBSCRIBE_SECRET: undefined, PRIVATEEMAIL_PASSWORD: undefined }, async () => {
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => sender.handler({}));
      check(seen.result.body === 'disabled' && calls.length === 0, 'the scheduled job does nothing while the switch is off');
    });
  });
  await withEnv({ NURTURE_ENABLED: 'true', NURTURE_UNSUBSCRIBE_SECRET: undefined }, async () => {
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => sender.handler({}));
      check(seen.result.body === 'no secret' && calls.length === 0, 'the job refuses to send without an unsubscribe secret');
    });
  });

  const jobStore = memoryStore();
  setStoreForTests(jobStore);
  await enrol(jobStore, { email: ADA, firstName: 'Ada', subject: 'maths', source: 'site', consent: 'yes', now: '2026-10-27T09:00:00.000Z' });
  sender.setClockForTests(() => new Date('2026-10-29T09:00:00.000Z'));
  await withEnv({ NURTURE_ENABLED: 'true', NURTURE_UNSUBSCRIBE_SECRET: SECRET, PRIVATEEMAIL_PASSWORD: MAIL }, async () => {
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => sender.handler({}));
      check(seen.result.body === 'ok', 'scheduled job sends when enabled', seen.errs.join('\n'));
      const msg = sendJson(calls);
      const keys = Object.keys(msg).sort();
      check(keys.join() === ['attachments', 'bcc', 'cc', 'composeType', 'date', 'from', 'htmlBody', 'idempotencyKey', 'importance', 'inReplyTo', 'isSecure', 'password', 'references', 'subject', 'textBody', 'to'].sort().join(), 'tip payload uses the same mailbox fields');
      check(msg.idempotencyKey === nurtureIdempotencyKey(ADA, 2), 'the job uses the stable key');
      check(msg.from[0].name === 'Craig - Get It?' && msg.to[0].address === ADA, 'tip is from Craig to the subscriber');
      check(msg.htmlBody.includes('Unsubscribe:') && msg.textBody.includes('Unsubscribe:'), 'the link is in the body');
      check(!JSON.stringify(msg).includes('List-Unsubscribe'), 'no List-Unsubscribe field is sent to the mailbox API');
      check((await jobStore.get(ADA)).lastStepSent === 2, 'the job records the step');
    });
    await withFetch('ok', async (calls) => {
      const seen = await capture(() => sender.handler({}));
      check(seen.result.body === 'ok' && calls.length === 0, 'the same morning does not send ada again');
    });
  });
  sender.setClockForTests(null);

  function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else if (name.endsWith('.html')) out.push(full);
    }
    return out;
  }
  const pages = walk('landing-site');
  const toolkitPages = pages.filter((file) => fs.readFileSync(file, 'utf8').includes('name="toolkit-download"'));
  check(toolkitPages.length >= 15, 'toolkit forms found', String(toolkitPages.length));
  for (const file of toolkitPages) {
    const html = fs.readFileSync(file, 'utf8');
    const chunk = formInner(html, 'toolkit-download');
    const at = chunk.indexOf('name="marketing_consent"');
    const tag = chunk.slice(chunk.lastIndexOf('<input', at), chunk.indexOf('>', at));
    check(chunk.includes('Send me occasional teaching tips from Get It? (unsubscribe anytime)'), 'label on ' + file);
    check(!tag.includes('required') && !tag.includes('checked'), 'optional and unticked on ' + file, tag);
    check(formInner(html, 'newsletter') === '' || !formInner(html, 'newsletter').includes('marketing_consent'), 'newsletter form untouched on ' + file);
  }
  const packHtml = fs.readFileSync('landing-site/new-teacher-pack/index.html', 'utf8');
  const pack = formInner(packHtml, 'pack-download');
  check(pack.includes('name="marketing_consent"') && pack.includes('Send me occasional teaching tips from Get It? (unsubscribe anytime)'), 'pack form has the optional box');
  const packAt = pack.indexOf('name="marketing_consent"');
  const packTag = pack.slice(pack.lastIndexOf('<input', packAt), pack.indexOf('>', packAt));
  check(!packTag.includes('required') && !packTag.includes('checked'), 'pack box is optional and unticked', packTag);

  const toml = fs.readFileSync('netlify.toml', 'utf8');
  check(toml.includes('schedule = "*/15 9 * * *"'), 'daily schedule is configured');
  check(toml.includes('from = "/unsubscribe"'), 'unsubscribe redirect is configured');

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach((line) => console.log('  ok   ' + line));
  fail.forEach((line) => console.log('  FAIL ' + line));
  setStoreForTests(null);
  sender.setClockForTests(null);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('TEST CRASHED: ' + (e && e.stack || e));
  setStoreForTests(null);
  process.exit(1);
});
