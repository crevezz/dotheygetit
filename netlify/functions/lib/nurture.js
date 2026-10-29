// Follow-up teaching tips after a PDF email.
// Day 0 (the PDF itself) is sent by pdf-mail.js and is not defined here.
// Tips go out on day 2, 5, 9 and 14, then every 14 days.
// Nothing is sent unless NURTURE_ENABLED is on and the person opted in.

const crypto = require('crypto');
const COPY = require('./nurture-copy');
const { updateRecord, openStore } = require('./nurture-store');
const { SITE, TOOLKIT, str, validEmail, firstName, nameForMail, subjectKey } = require('./pdf-mail');

const FIXED_DAYS = [2, 5, 9, 14];
const TIP_START = 28;
const TIP_EVERY = 14;
const LIMITS = { maxSends: 15, budgetMs: 22000, gapMs: 150, pendingMs: 10 * 60 * 1000 };
const SAMPLE_UNSUB = SITE + '/unsubscribe?token=example';

function assertCopy(copy) {
  const days = new Set();
  for (const item of copy) {
    if (!item || !Number.isInteger(item.day)) throw new Error('nurture copy needs a numeric day');
    if (days.has(item.day)) throw new Error('duplicate nurture day ' + item.day);
    days.add(item.day);
    for (const key of ['subject', 'preview', 'body', 'cta_label', 'cta_url']) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) throw new Error('nurture copy missing ' + key);
    }
    if (!String(item.subject).trim() || !String(item.body).trim()) throw new Error('nurture copy missing text for day ' + item.day);
  }
  for (const day of FIXED_DAYS) {
    if (!days.has(day)) throw new Error('nurture copy missing day ' + day);
  }
  if (![...days].some((day) => day >= TIP_START)) throw new Error('nurture copy missing a tip for day ' + TIP_START);
}

assertCopy(COPY);

function nurtureEnabled() {
  const value = String(process.env.NURTURE_ENABLED || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function unsubscribeSecret() {
  const secret = String(process.env.NURTURE_UNSUBSCRIBE_SECRET || '').trim();
  return secret.length >= 16 ? secret : '';
}

function normalizeEmail(value) {
  const email = str(value).trim().toLowerCase();
  if (email.length > 254 || !validEmail(email)) return '';
  return email;
}

function cleanName(value) {
  const first = str(value).replace(/[\r\n\t]+/g, ' ').trim().split(/\s+/)[0] || '';
  return first.slice(0, 80) || 'there';
}

// Opt-in only. Make sends the Facebook checkbox as the string "true", "false", or "".
// "true", "1", and "yes" (any case) count, as do boolean true and the number 1.
// Anything else is no consent. Empty or missing never throws.
function marketingConsent(value) {
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (marketingConsent(item)) return true;
      }
      return false;
    }
    if (value === true || value === 1) return true;
    if (value == null || value === false || value === 0) return false;
    if (typeof value === 'object') {
      const inner = value.value != null ? value.value : value.name;
      if (inner == null || typeof inner === 'object') return false;
      return marketingConsent(inner);
    }
    const text = String(value).trim().toLowerCase();
    return text === 'true' || text === '1' || text === 'yes';
  } catch (e) {
    return false;
  }
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('bad date');
  return date.toISOString();
}

function ukDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('bad date');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function asOf(now) {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) return new Date(now + 'T12:00:00Z');
  return now instanceof Date ? now : new Date(now);
}

function todayKey(now) {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) return now;
  return ukDate(asOf(now));
}

function daysBetween(fromIso, today) {
  const start = Date.parse(ukDate(fromIso) + 'T00:00:00Z');
  const end = Date.parse(today + 'T00:00:00Z');
  return Math.round((end - start) / 86400000);
}

function addDays(ymd, count) {
  return new Date(Date.parse(ymd + 'T00:00:00Z') + count * 86400000).toISOString().slice(0, 10);
}

function nextStepDay(lastStep, age) {
  const last = lastStep || 0;
  for (const day of FIXED_DAYS) {
    if (day > last && day <= age) return day;
  }
  if (age < TIP_START) return null;
  const start = last < TIP_START ? TIP_START : last + TIP_EVERY;
  if (start <= age && (start - TIP_START) % TIP_EVERY === 0) return start;
  return null;
}

function subjectLabel(key) {
  if (TOOLKIT[key]) return TOOLKIT[key][0];
  if (key === 'all') return 'GCSE';
  if (key === 'pack') return 'your classroom';
  return 'your subject';
}

function contentForDay(day, copy) {
  const entries = copy || COPY;
  const exact = entries.find((item) => item.day === day);
  if (exact) return exact;
  const tips = entries.filter((item) => item.day >= TIP_START).sort((a, b) => a.day - b.day);
  if (day < TIP_START || !tips.length) return null;
  const index = (day - TIP_START) / TIP_EVERY;
  if (!Number.isInteger(index) || index < 0) return null;
  return tips[index] || tips[index % tips.length];
}

function fill(text, vars) {
  return String(text == null ? '' : text).replace(/\{\{\s*(first_name|subject|unsubscribe_url)\s*\}\}/g, (_, key) => vars[key] == null ? '' : String(vars[key]));
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function safeUrl(url) {
  const value = String(url || '').trim();
  return /^https:\/\/[^\s"<>]+$/i.test(value) ? value : '';
}

function signToken(email, secret) {
  const payload = Buffer.from(JSON.stringify({ e: email }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifyToken(token, secret) {
  if (!secret || typeof token !== 'string') return '';
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return '';
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return '';
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return normalizeEmail(data && data.e);
  } catch (e) {
    return '';
  }
}

function unsubscribeUrl(email, secret) {
  return SITE + '/unsubscribe?token=' + encodeURIComponent(signToken(email, secret));
}

function nurtureIdempotencyKey(email, day) {
  return crypto.createHash('sha256').update('nurture:' + email + ':' + day).digest('hex').slice(0, 32);
}

function renderTip(entry, vars) {
  const subject = fill(entry.subject, vars).replace(/[\r\n]+/g, ' ').trim();
  const preview = fill(entry.preview, vars).replace(/[\r\n]+/g, ' ').trim();
  const paragraphs = fill(entry.body, vars).replace(/\r\n/g, '\n').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const ctaLabel = fill(entry.cta_label, vars).replace(/[\r\n]+/g, ' ').trim();
  const ctaUrl = safeUrl(fill(entry.cta_url, vars));
  const unsub = safeUrl(vars.unsubscribe_url);
  const sign = ['Best wishes,', 'Craig', 'Founder, Get It?'];
  const text = []
    .concat(paragraphs)
    .concat(ctaLabel && ctaUrl ? [ctaLabel + ': ' + ctaUrl] : [])
    .concat(['', sign.join('\n'), '', unsub ? 'Unsubscribe: ' + unsub : ''])
    .filter((part, index, all) => part !== '' || (all[index - 1] !== '' && index !== all.length - 1))
    .join('\n\n');
  const htmlParts = paragraphs.map((part) => '<p>' + esc(part).replace(/\n/g, '<br>') + '</p>');
  if (ctaLabel && ctaUrl) {
    htmlParts.push('<p><a href="' + esc(ctaUrl) + '" style="color:#4f8cff;font-weight:700">' + esc(ctaLabel) + '</a></p>');
  }
  htmlParts.push('<p>' + sign.map(esc).join('<br>') + '</p>');
  if (unsub) {
    htmlParts.push('<p style="color:#64748b;font-size:13px">Unsubscribe: <a href="' + esc(unsub) + '" style="color:#64748b">' + esc(unsub) + '</a></p>');
  }
  const html =
    '<div style="display:none;max-height:0;overflow:hidden">' + esc(preview) + '</div>' +
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">' +
    htmlParts.join('') +
    '</div>';
  return { subject, preview, text, html };
}

function blankRecord(input, nowIso) {
  const consent = marketingConsent(input.consent);
  return {
    email: input.email,
    firstName: input.firstName,
    subject: input.subject,
    source: input.source,
    signedUpAt: nowIso,
    lastStepSent: 0,
    lastSentAt: null,
    unsubscribed: false,
    unsubscribedAt: null,
    marketingConsent: consent,
    consentedAt: consent ? nowIso : null,
    enrolledAt: consent ? nowIso : null,
    pending: null,
    sent: {},
  };
}

function tombstone(email, nowIso) {
  return {
    email,
    firstName: 'there',
    subject: '',
    source: 'unsubscribe',
    signedUpAt: nowIso,
    lastStepSent: 0,
    lastSentAt: null,
    unsubscribed: true,
    unsubscribedAt: nowIso,
    marketingConsent: false,
    consentedAt: null,
    enrolledAt: null,
    pending: null,
    sent: {},
  };
}

// First sign-up wins. A later download does not restart the sequence or clear an unsubscribe.
// Consent given later, by someone who is still subscribed, starts the clock from that moment.
async function enrol(store, input) {
  const email = normalizeEmail(input.email);
  const subject = String(input.subject || '');
  const source = input.source === 'facebook' ? 'facebook' : input.source === 'site' ? 'site' : '';
  if (!email || !subject || !source) return { ok: false, reason: 'invalid' };
  const nowIso = iso(input.now || new Date());
  const first = cleanName(input.firstName);
  const consent = marketingConsent(input.consent);
  const result = await updateRecord(store, email, (current) => {
    if (!current) return blankRecord({ email, firstName: first, subject, source, consent }, nowIso);
    const next = JSON.parse(JSON.stringify(current));
    let changed = false;
    if (next.firstName === 'there' && first !== 'there') {
      next.firstName = first;
      changed = true;
    }
    if (!next.marketingConsent && consent && !next.unsubscribed) {
      next.marketingConsent = true;
      next.consentedAt = nowIso;
      next.enrolledAt = nowIso;
      changed = true;
    }
    return changed ? next : null;
  });
  return { ok: true, created: !result.record || result.record.signedUpAt === nowIso && result.written, written: result.written, record: result.record };
}

async function rememberDownload(input) {
  try {
    const store = await openStore();
    if (!store) return;
    const result = await enrol(store, input);
    if (result && result.ok === false) console.error('nurture enrol skipped:', result.reason);
  } catch (e) {
    console.error('nurture enrol failed:', e.message);
  }
}

async function unsubscribe(store, email, now) {
  const key = normalizeEmail(email);
  if (!key) return { ok: false };
  const nowIso = iso(now || new Date());
  await updateRecord(store, key, (current) => {
    if (current && current.unsubscribed) return null;
    if (!current) return tombstone(key, nowIso);
    const next = JSON.parse(JSON.stringify(current));
    next.unsubscribed = true;
    next.unsubscribedAt = nowIso;
    next.pending = null;
    return next;
  });
  return { ok: true };
}

function pendingFresh(sub, now, pendingMs) {
  if (!sub.pending || !sub.pending.at || !sub.pending.step) return false;
  const age = asOf(now).getTime() - new Date(sub.pending.at).getTime();
  return age >= 0 && age < pendingMs;
}

function classify(sub, now, copy) {
  const today = todayKey(now);
  const email = normalizeEmail(sub && sub.email);
  if (!email) return { email: str(sub && sub.email), reason: 'invalid email' };
  if (sub.unsubscribed) return { email, reason: 'unsubscribed' };
  if (!sub.marketingConsent) return { email, reason: 'no marketing consent' };
  const anchor = sub.enrolledAt || sub.consentedAt;
  if (!anchor) return { email, reason: 'no marketing consent' };
  const age = daysBetween(anchor, today);
  const due = nextStepDay(sub.lastStepSent || 0, age);
  if (sub.lastSentAt && ukDate(sub.lastSentAt) === today) {
    return due
      ? { email, reason: 'already sent today, day ' + due + ' waits until tomorrow' }
      : { email, reason: 'already sent today' };
  }
  if (pendingFresh(sub, now, LIMITS.pendingMs)) return { email, reason: 'send in progress' };
  if (!due) {
    const upcoming = nextStepDay(sub.lastStepSent || 0, 100000);
    return { email, reason: 'not due until day ' + upcoming + ' on ' + addDays(ukDate(anchor), upcoming) };
  }
  const entry = contentForDay(due, copy);
  if (!entry) return { email, reason: 'no copy for day ' + due };
  return {
    due: true,
    email,
    source: sub.source || '',
    subject: sub.subject || '',
    firstName: sub.firstName || 'there',
    day: due,
    copy: entry,
  };
}

function planPeople(subscribers, now, copy) {
  const entries = copy || COPY;
  const today = todayKey(now);
  const due = [];
  const skipped = [];
  const seen = new Set();
  for (const sub of subscribers || []) {
    const email = normalizeEmail(sub && sub.email);
    if (email && seen.has(email)) {
      skipped.push({ email, reason: 'duplicate' });
      continue;
    }
    if (email) seen.add(email);
    const row = classify(sub, now, entries);
    if (row.due) {
      const vars = {
        first_name: row.firstName,
        subject: subjectLabel(row.subject),
        unsubscribe_url: SAMPLE_UNSUB,
      };
      due.push({
        email: row.email,
        source: row.source,
        subject: row.subject,
        firstName: row.firstName,
        day: row.day,
        mailSubject: renderTip(row.copy, vars).subject,
        copy: row.copy,
      });
    } else {
      skipped.push({ email: row.email, reason: row.reason });
    }
  }
  due.sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
  skipped.sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
  return { date: today, due, skipped };
}

function formatPlan(plan) {
  const lines = [
    'Nurture dry run for ' + plan.date + ' (Europe/London)',
    'No email is sent. This is the plan for that UK date.',
    'Due: ' + plan.due.length + '. Skipped: ' + plan.skipped.length + '.',
    '',
    'DUE',
  ];
  if (!plan.due.length) lines.push('(none)');
  for (const row of plan.due) {
    lines.push(row.email + '  ' + row.source + '  ' + row.subject + '  day ' + row.day + '  ' + row.mailSubject);
  }
  lines.push('', 'SKIPPED');
  if (!plan.skipped.length) lines.push('(none)');
  for (const row of plan.skipped) lines.push(row.email + '  ' + row.reason);
  return lines.join('\n') + '\n';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadAll(store) {
  const page = await store.list();
  const keys = ((page && page.blobs) || []).map((blob) => blob.key).filter((key) => key && validEmail(key));
  const people = [];
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = await Promise.all(keys.slice(i, i + 20).map((key) => store.get(key)));
    for (const row of chunk) if (row && row.email) people.push(row);
  }
  return people;
}

async function runNurture(opts) {
  const now = opts.now || new Date();
  const copy = opts.copy || COPY;
  const max = opts.max == null ? LIMITS.maxSends : opts.max;
  const budgetMs = opts.budgetMs == null ? LIMITS.budgetMs : opts.budgetMs;
  const gapMs = opts.gapMs == null ? LIMITS.gapMs : opts.gapMs;
  const started = Date.now();
  const people = await loadAll(opts.store);
  const plan = planPeople(people, now, copy);
  const base = { enabled: !!opts.enabled, date: plan.date, due: plan.due, skipped: plan.skipped.slice(), sent: [], deferred: [] };
  if (!opts.enabled || !opts.secret) {
    if (!opts.enabled) return base;
    return Object.assign(base, { error: 'no secret' });
  }
  if (plan.due.length && opts.login) {
    try {
      await opts.login();
    } catch (e) {
      return Object.assign(base, { deferred: plan.due, error: e.message });
    }
  }
  const sent = [];
  const deferred = [];
  const skipped = base.skipped;
  for (let i = 0; i < plan.due.length; i++) {
    const item = plan.due[i];
    if (sent.length >= max || Date.now() - started > budgetMs) {
      deferred.push(item);
      continue;
    }
    const stamped = iso(now);
    const claimed = await updateRecord(opts.store, item.email, (current) => {
      if (!current || current.unsubscribed || !current.marketingConsent) return null;
      if ((current.lastStepSent || 0) >= item.day) return null;
      if (current.lastSentAt && ukDate(current.lastSentAt) === plan.date) return null;
      if (pendingFresh(current, now, LIMITS.pendingMs)) return null;
      const next = JSON.parse(JSON.stringify(current));
      next.pending = { step: item.day, at: stamped };
      return next;
    });
    if (!claimed.written) {
      skipped.push({ email: item.email, reason: 'not claimed' });
      continue;
    }
    const vars = {
      first_name: claimed.record.firstName || 'there',
      subject: subjectLabel(claimed.record.subject),
      unsubscribe_url: unsubscribeUrl(item.email, opts.secret),
    };
    const message = renderTip(item.copy, vars);
    try {
      await opts.send({
        to: item.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        idempotencyKey: nurtureIdempotencyKey(item.email, item.day),
      });
      await updateRecord(opts.store, item.email, (current) => {
        if (!current || current.unsubscribed) return null;
        if ((current.lastStepSent || 0) >= item.day) {
          if (!current.pending) return null;
          const next = JSON.parse(JSON.stringify(current));
          next.pending = null;
          return next;
        }
        const next = JSON.parse(JSON.stringify(current));
        next.lastStepSent = item.day;
        next.lastSentAt = stamped;
        next.sent = Object.assign({}, current.sent, { [String(item.day)]: stamped });
        next.pending = null;
        return next;
      });
      sent.push({ email: item.email, source: item.source, subject: item.subject, day: item.day, mailSubject: message.subject });
    } catch (e) {
      await updateRecord(opts.store, item.email, (current) => {
        if (!current || !current.pending || current.pending.step !== item.day) return null;
        const next = JSON.parse(JSON.stringify(current));
        next.pending = null;
        return next;
      }).catch(() => {});
      skipped.push({ email: item.email, reason: 'send failed' });
    }
    if (gapMs && i < plan.due.length - 1 && deferred.length === 0) await sleep(gapMs);
  }
  return { enabled: true, date: plan.date, due: plan.due, sent, deferred, skipped };
}

function page(kind) {
  const copy = {
    ok: ['You\u2019re unsubscribed', 'You won\u2019t get any more teaching tips from Get It?. The PDF you already downloaded is still yours.'],
    bad: ['This link does not work', 'The unsubscribe link is missing or out of date. Email support@dotheygetit.app and we will remove you.'],
    store: ['We could not update that', 'Something went wrong saving your unsubscribe. Email support@dotheygetit.app and we will remove you.'],
    config: ['Unsubscribe is not available', 'Email support@dotheygetit.app and we will remove you.'],
    method: ['That request is not supported', 'Open the unsubscribe link from the email, or write to support@dotheygetit.app.'],
  }[kind] || ['Unsubscribe', 'Email support@dotheygetit.app and we will remove you.'];
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    '<meta name="robots" content="noindex"/>' +
    '<title>' + esc(copy[0]) + '</title></head>' +
    '<body style="margin:0;background:#0b1020;color:#eaf0ff;font-family:Arial,sans-serif">' +
    '<main style="max-width:32rem;margin:12vh auto;padding:24px">' +
    '<p style="margin:0 0 8px;color:#4f8cff;font-weight:700">Get It?</p>' +
    '<h1 style="font-size:1.6rem;line-height:1.25">' + esc(copy[0]) + '</h1>' +
    '<p style="font-size:1.05rem;line-height:1.5">' + esc(copy[1]) + '</p>' +
    '<p><a href="' + SITE + '/" style="color:#8fb4ff">Back to Get It?</a></p>' +
    '</main></body></html>';
}

function downloadSubject(formName, data) {
  if (formName === 'pack-download') return 'pack';
  if (formName === 'toolkit-download') return subjectKey(data && data.subject) || '';
  return '';
}

function storedFirstName(formName, data, fullName) {
  if (formName === 'facebook') return cleanName(firstName(nameForMail(fullName)));
  return cleanName(firstName(data && data['first-name']));
}

module.exports = {
  COPY,
  LIMITS,
  FIXED_DAYS,
  nurtureEnabled,
  unsubscribeSecret,
  normalizeEmail,
  marketingConsent,
  ukDate,
  daysBetween,
  nextStepDay,
  subjectLabel,
  contentForDay,
  renderTip,
  signToken,
  verifyToken,
  unsubscribeUrl,
  nurtureIdempotencyKey,
  enrol,
  rememberDownload,
  unsubscribe,
  planPeople,
  formatPlan,
  runNurture,
  page,
  downloadSubject,
  storedFirstName,
};
