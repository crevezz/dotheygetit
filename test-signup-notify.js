/* Sign-up notification.
   A new teacher account asks the existing PDF mailbox to mail support.
   The send is not awaited, an owner account is skipped, and a mail failure
   still leaves the account created. There is no test flag on accounts. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.REDIS_URL;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-notify-unit-'));
const { signupNotice, notifyNewSignup, signupWelcome, welcomeNewSignup, setSignupNoticeDelivery, formatLondon } = require('./server');

const pass = [], fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

const teacher = {
  email: 'Ada@School.sch.uk',
  role: 'teacher',
  createdAt: Date.parse('2026-01-15T12:00:00Z')
};

check(formatLondon(Date.parse('2026-01-15T12:00:00Z')).includes('15 Jan 2026') && formatLondon(Date.parse('2026-01-15T12:00:00Z')).includes('12:00') && /GMT/.test(formatLondon(Date.parse('2026-01-15T12:00:00Z'))),
  'winter instant is UK time, GMT', formatLondon(Date.parse('2026-01-15T12:00:00Z')));
check(formatLondon(Date.parse('2026-07-15T11:00:00Z')).includes('15 Jul 2026') && formatLondon(Date.parse('2026-07-15T11:00:00Z')).includes('12:00') && /BST/.test(formatLondon(Date.parse('2026-07-15T11:00:00Z'))),
  'summer instant is UK time, BST', formatLondon(Date.parse('2026-07-15T11:00:00Z')));

delete process.env.SIGNUP_NOTIFY_TO;
const plain = signupNotice(teacher, {}, { headers: {} });
check(plain && plain.to === 'support@dotheygetit.app', 'recipient defaults to support@', plain && plain.to);
check(plain.subject === 'New Get It? sign-up: ada@school.sch.uk', 'subject names the new email', plain.subject);
check(plain.text.includes('Email: ada@school.sch.uk'), 'body has the email');
check(!plain.text.includes('Name:'), 'a missing name is left out', plain.text);
check(plain.text.includes('Role: teacher'), 'body has the role');
check(plain.text.includes('Signed up (UK time):') && plain.text.includes('15 Jan 2026') && plain.text.includes('12:00'), 'body has the UK time', plain.text);
check(!plain.text.includes('How they arrived'), 'no arrival line when nothing was tracked');
check(plain.html.includes('ada@school.sch.uk') && !plain.html.includes('<script'), 'html is the same note');

const named = signupNotice(Object.assign({}, teacher, { name: 'Ada Lovelace' }), {}, null);
check(named.text.includes('Name: Ada Lovelace'), 'a stored name is included', named.text);

process.env.SIGNUP_NOTIFY_TO = '  hello@example.com  ';
const custom = signupNotice(teacher, {
  name: 'Ada',
  referrer: 'https://dotheygetit.app/toolkit/gcse-maths-misconceptions.pdf',
  utm_source: 'toolkit',
  utm_medium: 'pdf'
}, { headers: { referer: 'https://app.dotheygetit.app/' } });
check(custom.to === 'hello@example.com', 'SIGNUP_NOTIFY_TO overrides the recipient', custom.to);
check(custom.text.includes('Name: Ada'), 'a name on the request is included');
check(custom.text.includes('Referrer: https://dotheygetit.app/toolkit/gcse-maths-misconceptions.pdf'), 'referrer is included');
check(custom.text.includes('utm_source: toolkit') && custom.text.includes('utm_medium: pdf'), 'utm fields are included', custom.text);
check(!custom.text.includes('https://app.dotheygetit.app/'), 'the app sign-in page itself is not an arrival', custom.text);
delete process.env.SIGNUP_NOTIFY_TO;
process.env.SIGNUP_NOTIFY_TO = '';
check(signupNotice(teacher, {}, null).to === 'support@dotheygetit.app', 'a blank recipient falls back to support@');
delete process.env.SIGNUP_NOTIFY_TO;

const fromHeader = signupNotice(teacher, {}, { headers: { referer: 'https://app.dotheygetit.app/?utm_source=pack&utm_campaign=ect' } });
check(fromHeader.text.includes('utm_source: pack') && fromHeader.text.includes('utm_campaign: ect'), 'utm on the page URL is included', fromHeader.text);
check(fromHeader.text.includes('Referrer: https://app.dotheygetit.app/?utm_source=pack&utm_campaign=ect'), 'the page URL is kept when it carries a source');

const outside = signupNotice(teacher, {}, { headers: { referer: 'https://dotheygetit.app/new-teacher-pack/' } });
check(outside.text.includes('Referrer: https://dotheygetit.app/new-teacher-pack/'), 'an outside referrer is included');

const nasty = signupNotice({ email: 'a<b>@school.sch.uk', role: 'teacher', name: 'A & "B"', createdAt: teacher.createdAt }, {}, null);
check(nasty.html.includes('a&lt;b&gt;@school.sch.uk') && nasty.html.includes('A &amp; &quot;B&quot;') && !nasty.html.includes('<b>'),
  'the html note escapes the name and email');
check(signupNotice({ email: 'owner@test.com', role: 'admin', createdAt: teacher.createdAt }, {}, null) === null, 'an owner account is not notified');
check(signupNotice({ email: 'nope', role: 'teacher' }, {}, null) === null, 'a bad email is not notified');

const welcome = signupWelcome(teacher, { name: 'Ada Lovelace' });
check(welcome && welcome.to === 'ada@school.sch.uk', 'welcome goes to the new teacher', welcome && welcome.to);
check(welcome.subject === 'Welcome to Get It?', 'welcome subject', welcome.subject);
check(welcome.text.startsWith('Hi Ada Lovelace,'), 'welcome uses the name', welcome.text.split('\n')[0]);
check(welcome.text.includes("Thanks for signing up.") && welcome.text.includes("It's free while we're in beta."), 'welcome thanks them and says beta is free');
check(welcome.text.includes('Watch the quick tutorials: https://app.dotheygetit.app/help'), 'plain text has the tutorials URL');
check(welcome.text.includes('Open the app: https://app.dotheygetit.app'), 'plain text has the app URL');
check(welcome.text.includes("If anything's clunky, just reply to this email."), 'welcome says they can reply');
check(welcome.text.includes('https://www.facebook.com/dotheygetit'), 'plain text has the Facebook URL');
check(welcome.text.trim().endsWith('Craig'), 'welcome is signed Craig');
check(!welcome.text.includes('\u2014') && !welcome.html.includes('\u2014') && !welcome.text.includes('\u2013'), 'welcome has no em dash');
const buttonAt = welcome.html.indexOf('>Watch the quick tutorials<');
const plainAt = welcome.html.indexOf('style="color:#4f8cff;text-decoration:underline">https://app.dotheygetit.app/help<');
check(buttonAt > 0 && plainAt > buttonAt, 'the tutorials URL sits under the button');
check(welcome.html.includes('background:#4f8cff') && welcome.html.includes('color:#ffffff') && welcome.html.includes('padding:14px 22px') && welcome.html.includes('border-radius:8px'),
  'the tutorials button is blue, white, padded and rounded');
check(welcome.html.includes('style="color:#4f8cff;text-decoration:underline">https://www.facebook.com/dotheygetit<'),
  'the Facebook page is a blue underlined link');
check(welcome.html.includes('style="color:#4f8cff;text-decoration:underline">https://app.dotheygetit.app<'),
  'the app URL is a blue underlined link');
check(signupWelcome(teacher, {}).text.startsWith('Hi there,'), 'a missing name is hi there');
const escapedWelcome = signupWelcome({ email: 'ada@school.sch.uk', role: 'teacher', name: 'A & "B"' }, {});
check(escapedWelcome.html.includes('Hi A &amp; &quot;B&quot;,') && !escapedWelcome.html.includes('A & "B"'), 'the welcome escapes the name');
check(signupWelcome({ email: 'owner@test.com', role: 'admin' }, { name: 'Owner' }) === null, 'an owner gets no welcome');
check(signupWelcome({ email: 'nope', role: 'teacher' }, {}) === null, 'a bad email gets no welcome');

let calls = 0;
let sawReject = false;
let returnedBeforeSend = false;
process.on('unhandledRejection', () => { sawReject = true; });

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-notify-'));
const PORT = 4623;
const B = `http://127.0.0.1:${PORT}`;
let srv = null;
let srvErr = '';
const srvEnv = Object.assign({}, process.env, {
  PORT: String(PORT), DATA_DIR: DIR, ADMIN_EMAIL: 'owner@test.com', SIGNUP_CODE: '', REDIS_URL: '', API_KEY: 'x'
});
delete srvEnv.PRIVATEEMAIL_PASSWORD;
delete srvEnv.SIGNUP_NOTIFY_TO;

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', d => { srvErr += d; });
  return child;
}

async function call(p, body, headers) {
  const r = await fetch(B + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body)
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

async function up() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(B + '/api/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}

(async () => {
  setSignupNoticeDelivery(() => { calls++; throw new Error('mailbox down'); });
  notifyNewSignup(teacher, {}, null);
  notifyNewSignup({ email: 'owner@test.com', role: 'admin', createdAt: teacher.createdAt }, {}, null);
  await new Promise(r => setTimeout(r, 30));
  check(calls === 1, 'a failing mailbox is still called once, and the owner is skipped', String(calls));
  welcomeNewSignup(teacher, { name: 'Ada' });
  welcomeNewSignup({ email: 'owner@test.com', role: 'admin', createdAt: teacher.createdAt }, {});
  await new Promise(r => setTimeout(r, 30));
  check(calls === 2, 'the welcome is sent too, and the owner is skipped', String(calls));
  check(!sawReject, 'a mailbox error is not an unhandled rejection');

  setSignupNoticeDelivery(() => new Promise((resolve) => {
    setTimeout(() => { returnedBeforeSend = true; resolve(); }, 60);
  }));
  const started = Date.now();
  notifyNewSignup({ email: 'slow@school.sch.uk', role: 'teacher', createdAt: teacher.createdAt }, {}, null);
  check(Date.now() - started < 40 && returnedBeforeSend === false, 'notify returns without waiting for the mailbox');
  await new Promise(r => setTimeout(r, 90));
  check(returnedBeforeSend === true, 'the send still runs after notify returns');

  srv = startServer();
  await up();
  const t0 = Date.now();
  const made = await call('/api/signup', {
    email: 'new@school.sch.uk', password: 'password123', name: 'New Teacher',
    utm_source: 'toolkit', source: 'gcse-maths-misconceptions.pdf'
  }, { Referer: 'https://dotheygetit.app/toolkit/gcse-maths-misconceptions.pdf' });
  check(Date.now() - t0 < 1000, 'sign-up answers without waiting for the email', String(Date.now() - t0));
  check(made.status === 200 && made.j.teacher.email === 'new@school.sch.uk' && made.j.teacher.role === 'teacher',
    'the account is created', JSON.stringify(made.j && made.j.teacher));
  const disk = JSON.parse(fs.readFileSync(path.join(DIR, 'data.json'), 'utf8'));
  check(disk.teachers.some(t => t.email === 'new@school.sch.uk'), 'the account is on disk');

  const owner = await call('/api/signup', { email: 'owner@test.com', password: 'password123' });
  check(owner.status === 200 && owner.j.teacher.role === 'admin', 'the owner account is created', owner.j && owner.j.teacher && owner.j.teacher.role);

  const again = await call('/api/signup', { email: 'new@school.sch.uk', password: 'password123' });
  check(again.status === 400, 'a second sign-up is refused', again.status + ' ' + (again.j && again.j.error));

  const login = await call('/api/login', { email: 'new@school.sch.uk', password: 'password123' });
  check(login.status === 200, 'logging in still works', login.status);

  await new Promise(r => setTimeout(r, 200));
  const notifyNotes = srvErr.split('\n').filter(l => l.includes('signup notify failed'));
  const welcomeNotes = srvErr.split('\n').filter(l => l.includes('signup welcome failed'));
  check(notifyNotes.length === 1 && notifyNotes[0].includes('PRIVATEEMAIL_PASSWORD not set'),
    'the teacher sign-up logs the support-mail error once, and the owner does not', JSON.stringify(notifyNotes));
  check(welcomeNotes.length === 1 && welcomeNotes[0].includes('PRIVATEEMAIL_PASSWORD not set'),
    'the teacher sign-up logs the welcome-mail error once, and the owner does not', JSON.stringify(welcomeNotes));

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach(x => console.log('  ok   ' + x));
  fail.forEach(x => console.log('  FAIL ' + x));
  if (srv) srv.kill();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail.length ? 1 : 0);
})().catch(e => {
  console.error('TEST CRASHED: ' + (e.stack || e.message));
  if (srv) srv.kill();
  process.exit(1);
});
