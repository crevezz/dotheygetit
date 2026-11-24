/* Forgotten password.
   The reply is the same for an email we have and one we do not.
   The link in the mail is clickable, lasts an hour, works once, and a
   successful reset kills every other link for that account. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

delete process.env.REDIS_URL;
delete process.env.PRIVATEEMAIL_PASSWORD;
delete process.env.SIGNUP_CODE;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-reset-'));
const PORT = 4637;
process.env.DATA_DIR = DIR;
process.env.ADMIN_EMAIL = 'owner@test.com';
process.env.APP_URL = 'http://127.0.0.1:' + PORT;
process.env.RESET_QUIET_MS = '0';
process.env.RESET_IP_MAX = '100';
process.env.RESET_EMAIL_MAX = '50';

const { server, passwordResetMail, setResetMailDelivery, RESET_SENT, RESET_BAD } = require('./server');

const pass = [], fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));
const B = 'http://127.0.0.1:' + PORT;
const mails = [];

setResetMailDelivery((mail) => {
  mails.push(mail);
  return new Promise((resolve) => setTimeout(resolve, 80));
});

function tokenOf(mail) {
  const m = String(mail && mail.text || '').match(/https?:\/\/\S+/);
  if (!m) return '';
  return new URL(m[0]).searchParams.get('token') || '';
}
function sha(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function teacherRow(email) {
  const disk = JSON.parse(fs.readFileSync(path.join(DIR, 'data.json'), 'utf8'));
  return disk.teachers.find(t => t.email === email);
}

async function call(p, body, headers) {
  const r = await fetch(B + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body || {})
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j, cookie: r.headers.get('set-cookie') || '' };
}
function cookieOf(res) {
  const m = String(res.cookie || '').match(/sid=([^;]+)/);
  return m ? m[1] : '';
}

(async () => {
  const plain = passwordResetMail('Ada@School.sch.uk', 'http://127.0.0.1:' + PORT + '/reset?token=abc');
  check(plain && plain.to === 'ada@school.sch.uk', 'reset mail goes to the teacher, lowercased', plain && plain.to);
  check(plain.subject === 'Reset your Get It? password', 'subject', plain.subject);
  check(plain.text.includes('http://127.0.0.1:' + PORT + '/reset?token=abc'), 'plain text has the link');
  check(plain.text.trim().endsWith('Craig'), 'the mail is signed Craig');
  check(!plain.text.includes('\u2014') && !plain.html.includes('\u2014') && !plain.text.includes('\u2013'), 'no em dash');
  const href = 'href="http://127.0.0.1:' + PORT + '/reset?token=abc"';
  check(plain.html.includes(href) && plain.html.includes('>Reset password<'), 'the link is a clickable button', plain.html);
  const buttonAt = plain.html.indexOf('>Reset password<');
  const urlAt = plain.html.indexOf('>' + 'http://127.0.0.1:' + PORT + '/reset?token=abc<');
  check(buttonAt > 0 && urlAt > buttonAt, 'the URL sits under the button');
  const nasty = passwordResetMail('a@b.co', 'https://app.example/reset?token=a&b="c"');
  check(nasty.html.includes('token=a&amp;b=&quot;c&quot;') && !nasty.html.includes('a&b="c"'), 'the link is escaped in html');
  check(nasty.text.includes('token=a&b="c"'), 'the plain text keeps the raw link');
  check(passwordResetMail('nope', 'https://app.example/reset?token=abc') === null, 'a bad address is not mailed');

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  const home = await (await fetch(B + '/')).text();
  check(home.includes('id="forgotLink"') && home.includes('Forgot password?') && home.includes('href="/reset"'), 'sign-in page has the link');
  const requestPage = await (await fetch(B + '/reset')).text();
  check(requestPage.includes('id="resetRequest"') && requestPage.includes('Email me a link'), 'request page is served');
  check(requestPage.includes('id="resetChoose"') && requestPage.includes('Save password'), 'reset page is served');
  check(requestPage.includes('window.__resetToken'), 'the page lifts the token out of the address bar');
  const slash = await fetch(B + '/reset/?token=abc', { redirect: 'manual' });
  check(slash.status === 302 && slash.headers.get('location') === '/reset?token=abc', 'a trailing slash keeps the token', slash.status + ' ' + slash.headers.get('location'));

  const made = await call('/api/signup', { email: 'Ada@School.sch.uk', password: 'password123', marketing_opt_out: true });
  check(made.status === 200, 'account created', made.status + ' ' + JSON.stringify(made.j));
  const sid = cookieOf(made);
  const other = await call('/api/signup', { email: 'other@school.sch.uk', password: 'otherpass' });
  check(other.status === 200, 'second teacher created');
  const owner = await call('/api/signup', { email: 'owner@test.com', password: 'ownerpass' });
  check(owner.status === 200 && owner.j.teacher.role === 'admin', 'owner account created');

  const before = mails.length;
  const t0 = Date.now();
  const known = await call('/api/forgot', { email: '  ADA@school.sch.uk  ' });
  const knownMs = Date.now() - t0;
  const unknown = await call('/api/forgot', { email: 'nobody@school.sch.uk' });
  check(known.status === 200 && unknown.status === 200, 'both replies are 200', known.status + ' ' + unknown.status);
  check(JSON.stringify(known.j) === JSON.stringify(unknown.j), 'the body is the same either way', JSON.stringify(known.j) + ' vs ' + JSON.stringify(unknown.j));
  check(known.j && known.j.message === RESET_SENT && known.j.ok === true, 'the message does not say the account exists', known.j && known.j.message);
  check(!JSON.stringify(known.j).includes('token') && !JSON.stringify(known.j).includes('ADA'), 'the reply has no token and no email');
  check(knownMs < 1000, 'the reply does not wait for the mailbox', String(knownMs));
  await new Promise(r => setTimeout(r, 30));
  check(mails.length === before + 1, 'only the real account is mailed', String(mails.length - before));
  const mail = mails[mails.length - 1];
  check(mail.to === 'ada@school.sch.uk', 'the mail uses the stored address', mail.to);
  const tokenA = tokenOf(mail);
  check(tokenA && tokenA.length >= 20 && mail.html.includes('href="http://127.0.0.1:' + PORT + '/reset?token=' + tokenA + '"'),
    'the mailed link is clickable and carries the token');
  const row = teacherRow('ada@school.sch.uk');
  check(row && Array.isArray(row.resets) && row.resets.length === 1, 'one reset is stored', JSON.stringify(row && row.resets));
  check(row.resets[0].hash === sha(tokenA) && !JSON.stringify(row).includes(tokenA), 'the store keeps the hash, not the token');
  check(row.resets[0].exp > Date.now() + 50 * 60 * 1000 && row.resets[0].exp < Date.now() + 70 * 60 * 1000, 'it lasts about an hour');
  check(!JSON.stringify(made.j).includes('resets') && !JSON.stringify(made.j).includes('hash'), 'sign-up does not reveal the hash');

  const bad = await call('/api/forgot', { email: 'not-an-email' });
  check(bad.status === 400, 'a nonsense address is refused', bad.status + ' ' + (bad.j && bad.j.error));
  check(mails.length === before + 1, 'a nonsense address sends nothing');

  const short = await call('/api/reset', { token: tokenA, password: 'abc' });
  check(short.status === 400 && short.j.error === 'The new password must be at least 6 characters.', 'a short password is refused', short.j && short.j.error);
  const same = await call('/api/reset', { token: tokenA, password: 'password123' });
  check(same.status === 400 && /already your password/.test(same.j.error), 'the same password is refused', same.j && same.j.error);
  check(teacherRow('ada@school.sch.uk').resets.length === 1, 'a refused reset leaves the link alive');

  const againMailAt = mails.length;
  const second = await call('/api/forgot', { email: 'ada@school.sch.uk' });
  check(second.status === 200 && second.j.message === RESET_SENT, 'a second request gets the same reply');
  await new Promise(r => setTimeout(r, 20));
  check(mails.length === againMailAt + 1, 'a second request sends another mail');
  const tokenB = tokenOf(mails[mails.length - 1]);
  check(tokenB && tokenB !== tokenA, 'the second link is a different token');
  check(teacherRow('ada@school.sch.uk').resets.length === 2, 'both links stay valid until one is used', String(teacherRow('ada@school.sch.uk').resets.length));

  const garbage = await call('/api/reset', { token: 'this-token-is-not-real-at-all', password: 'brandnew1' });
  check(garbage.status === 400 && garbage.j.error === RESET_BAD, 'a made-up link is refused', garbage.j && garbage.j.error);
  check((await call('/api/login', { email: 'ada@school.sch.uk', password: 'password123' })).status === 200, 'a made-up link does not change the password');

  const saved = await call('/api/reset', { token: tokenB, password: 'brandnew1' });
  check(saved.status === 200 && saved.j.ok === true, 'the link sets the new password', saved.status + ' ' + JSON.stringify(saved.j));
  check(/Max-Age=0/.test(saved.cookie), 'the old sign-in cookie is cleared');
  const me = await call('/api/me', null, { Cookie: 'sid=' + sid });
  check(me.status === 200 && me.j.teacher === null, 'the previous sign-in no longer works', JSON.stringify(me.j));
  check((await call('/api/login', { email: 'ada@school.sch.uk', password: 'password123' })).status === 400, 'the old password no longer works');
  const back = await call('/api/login', { email: 'ada@school.sch.uk', password: 'brandnew1' });
  check(back.status === 200 && back.j.teacher.email === 'ada@school.sch.uk', 'the new password signs in');
  check((await call('/api/login', { email: 'other@school.sch.uk', password: 'otherpass' })).status === 200, 'the other teacher is untouched');
  check((await call('/api/reset', { token: tokenB, password: 'thirdpass1' })).status === 400, 'the used link does not work again');
  check((await call('/api/reset', { token: tokenA, password: 'thirdpass1' })).j.error === RESET_BAD, 'the older link dies after a successful reset');
  check(!teacherRow('ada@school.sch.uk').resets, 'no reset hash is left on the account');
  check((await call('/api/login', { email: 'ada@school.sch.uk', password: 'brandnew1' })).status === 200, 'a dead link does not change the new password');

  const fresh = await call('/api/forgot', { email: 'ada@school.sch.uk' });
  check(fresh.status === 200, 'a new link can be requested after a reset');
  await new Promise(r => setTimeout(r, 20));
  const tokenC = tokenOf(mails[mails.length - 1]);
  const authed = cookieOf(await call('/api/login', { email: 'ada@school.sch.uk', password: 'brandnew1' }));
  const changed = await call('/api/password', { current: 'brandnew1', next: 'fromtheapp1' }, { Cookie: 'sid=' + authed });
  check(changed.status === 200, 'changing the password while signed in still works', changed.status + ' ' + JSON.stringify(changed.j));
  check((await call('/api/reset', { token: tokenC, password: 'stolenlink1' })).j.error === RESET_BAD, 'that change kills the outstanding link');
  check((await call('/api/login', { email: 'ada@school.sch.uk', password: 'fromtheapp1' })).status === 200, 'the password from the app is the one that works');

  process.env.RESET_QUIET_MS = '60000';
  const quietBefore = mails.length;
  const q1 = await call('/api/forgot', { email: 'other@school.sch.uk' });
  const q2 = await call('/api/forgot', { email: 'other@school.sch.uk' });
  await new Promise(r => setTimeout(r, 20));
  check(q1.status === 200 && q2.status === 200 && q1.j.message === q2.j.message, 'a quick second click gets the same reply');
  check(mails.length === quietBefore + 1, 'a quick second click does not send a second email', String(mails.length - quietBefore));
  const quietToken = tokenOf(mails[mails.length - 1]);
  check(teacherRow('other@school.sch.uk').resets.length === 1, 'the first link is still the one that works');
  process.env.RESET_QUIET_MS = '0';

  const capAccount = await call('/api/signup', { email: 'cap@school.sch.uk', password: 'cappass1' });
  check(capAccount.status === 200, 'cap account created', capAccount.status);
  process.env.RESET_EMAIL_MAX = '2';
  const capIp = { 'X-Forwarded-For': '198.51.100.20' };
  const capBefore = mails.length;
  const c1 = await call('/api/forgot', { email: 'cap@school.sch.uk' }, capIp);
  const c2 = await call('/api/forgot', { email: 'cap@school.sch.uk' }, capIp);
  const c3 = await call('/api/forgot', { email: 'cap@school.sch.uk' }, capIp);
  await new Promise(r => setTimeout(r, 20));
  check(c1.j.message === RESET_SENT && c2.j.message === RESET_SENT && c3.j.message === RESET_SENT, 'a capped address still gets the same reply');
  check(mails.length === capBefore + 2, 'only two emails go out in the window', String(mails.length - capBefore));
  const capped = teacherRow('cap@school.sch.uk');
  check(capped.resets.length === 2, 'the extra request does not throw away the links already sent', String(capped.resets.length));
  const capToken = tokenOf(mails[mails.length - 1]);
  const capFirst = tokenOf(mails[mails.length - 2]);
  check(capToken && capFirst && capToken !== capFirst, 'the second email has its own link');
  process.env.RESET_EMAIL_MAX = '50';

  process.env.RESET_TTL_MS = '300';
  const expIp = { 'X-Forwarded-For': '198.51.100.21' };
  await call('/api/forgot', { email: 'owner@test.com' }, expIp);
  await new Promise(r => setTimeout(r, 20));
  const expMail = mails[mails.length - 1];
  const expToken = tokenOf(expMail);
  check(expMail && expMail.to === 'owner@test.com' && expToken, 'the owner can be sent a reset too', expMail && expMail.to);
  await new Promise(r => setTimeout(r, 400));
  const expired = await call('/api/reset', { token: expToken, password: 'ownernew1' });
  check(expired.status === 400 && expired.j.error === RESET_BAD, 'an hour-old link is refused once it has expired', expired.j && expired.j.error);
  check((await call('/api/login', { email: 'owner@test.com', password: 'ownerpass' })).status === 200, 'the expired link does not change the password');
  delete process.env.RESET_TTL_MS;

  process.env.RESET_IP_MAX = '3';
  const ip = { 'X-Forwarded-For': '203.0.113.9' };
  const r1 = await call('/api/forgot', { email: 'ghost@school.sch.uk' }, ip);
  const r2 = await call('/api/forgot', { email: 'ghost2@school.sch.uk' }, ip);
  const r3 = await call('/api/forgot', { email: 'ghost3@school.sch.uk' }, ip);
  const r4 = await call('/api/forgot', { email: 'ada@school.sch.uk' }, ip);
  check(r1.status === 200 && r2.status === 200 && r3.status === 200, 'three reset requests from one place are allowed');
  check(r4.status === 429 && r4.j.error === 'Too many reset requests from here just now. Try again shortly.', 'the fourth is limited', r4.status + ' ' + (r4.j && r4.j.error));
  check(!JSON.stringify(r4.j).includes('ada@'), 'the limit message does not say whether the account exists');
  const still = await call('/api/forgot', { email: 'ada@school.sch.uk' }, { 'X-Forwarded-For': '203.0.113.10' });
  check(still.status === 200 && still.j.message === RESET_SENT, 'a different place is not limited by that');

  const notes = [];
  const orig = console.error;
  console.error = (...args) => { notes.push(args.join(' ')); orig.apply(console, args); };
  setResetMailDelivery(null);
  const viaMailbox = await call('/api/forgot', { email: 'cap@school.sch.uk' }, { 'X-Forwarded-For': '203.0.113.11' });
  await new Promise(r => setTimeout(r, 30));
  console.error = orig;
  check(viaMailbox.status === 200 && viaMailbox.j.message === RESET_SENT, 'a mailbox failure still returns the same reply');
  check(notes.some(l => l.includes('password reset mail failed') && l.includes('PRIVATEEMAIL_PASSWORD not set')),
    'the real mailbox is what sends the mail', notes.join(' | '));

  const usedQuiet = await call('/api/reset', { token: quietToken, password: 'othernew1' });
  check(usedQuiet.status === 200, 'the link from the single quiet email works', usedQuiet.status + ' ' + JSON.stringify(usedQuiet.j));
  check((await call('/api/login', { email: 'other@school.sch.uk', password: 'othernew1' })).status === 200, 'that teacher signs in with the new password');
  const usedCap = await call('/api/reset', { token: capToken, password: 'capnew1' });
  check(usedCap.status === 200, 'one of the capped links sets the password', usedCap.status + ' ' + JSON.stringify(usedCap.j));
  check((await call('/api/reset', { token: capFirst, password: 'capnew2' })).j.error === RESET_BAD, 'the other outstanding link died with it');
  check((await call('/api/login', { email: 'cap@school.sch.uk', password: 'capnew1' })).status === 200, 'that teacher signs in with the new password');

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach(x => console.log('  ok   ' + x));
  fail.forEach(x => console.log('  FAIL ' + x));
  server.close();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail.length ? 1 : 0);
})().catch(e => {
  console.error('TEST CRASHED: ' + (e.stack || e.message));
  try { server.close(); } catch {}
  process.exit(1);
});
