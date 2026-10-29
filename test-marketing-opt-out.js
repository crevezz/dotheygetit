/* Sign-up marketing refusal.
   The box on the account form is optional and unticked. A new teacher is stored
   with marketing_opt_out and marketing_choice_at. An older account with neither
   field is treated as not opted out, and logging in does not invent a choice.
   App accounts are not enrolled in the Netlify nurture list. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.REDIS_URL;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-opt-unit-'));
const { refusedMarketing, signupRefusedMarketing } = require('./server');

const pass = [], fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

for (const value of [true, 1, 'true', 'TRUE', ' yes ', '1']) {
  check(refusedMarketing(value) === true, 'refusal yes ' + JSON.stringify(value));
}
for (const value of [undefined, null, false, 0, '', 'false', 'no', '0', 'on', [], {}, 'trueish']) {
  check(refusedMarketing(value) === false, 'refusal no ' + JSON.stringify(value));
}
check(signupRefusedMarketing({}) === false, 'missing body is not a refusal');
check(signupRefusedMarketing({ marketing_opt_out: false }) === false, 'explicit false is not a refusal');
check(signupRefusedMarketing({ marketing_opt_out: true }) === true, 'snake true is a refusal');
check(signupRefusedMarketing({ marketingOptOut: true }) === true, 'camel true is a refusal');
check(signupRefusedMarketing({ marketing_opt_out: false, marketingOptOut: 'yes' }) === true, 'either yes is a refusal');
check(signupRefusedMarketing(null) === false, 'null body is not a refusal');

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const box = html.match(/<input type="checkbox" id="authMarketingOptOut"[^>]*>/);
check(!!box && !/\bchecked\b/.test(box[0]), 'the sign-up box is unticked', box && box[0]);
check(html.includes("Don't send me teaching tips or updates by email"), 'the refusal label is on the form');
check(html.includes("You'll still get account emails. Unsubscribe any time."), 'the helper text is on the form');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
check(app.includes("path === '/api/signup'") && app.includes('body.marketing_opt_out'), 'create account sends the box');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const signupBlock = serverSrc.slice(serverSrc.indexOf("if (p === '/api/signup'"), serverSrc.indexOf("if (p === '/api/login'"));
check(signupBlock.includes('marketing_opt_out') && signupBlock.includes('marketing_choice_at'), 'sign-up stores the choice and the time');
check(!/enrol\(|rememberDownload|nurture/.test(signupBlock), 'app sign-up does not enrol the nurture list');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-opt-'));
const PORT = 4617;
const B = `http://127.0.0.1:${PORT}`;
let srv = null;
const srvEnv = Object.assign({}, process.env, {
  PORT: String(PORT), DATA_DIR: DIR, ADMIN_EMAIL: 'owner@test.com', SIGNUP_CODE: '', REDIS_URL: '', API_KEY: 'x'
});

function startServer() {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: srvEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', d => process.stderr.write('  srv: ' + d));
  return srv;
}

const jar = {};
async function call(who, p, body) {
  const r = await fetch(B + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, jar[who] ? { Cookie: jar[who] } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) jar[who] = sc.map(c => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

function stored(email) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, 'data.json'), 'utf8'));
  return data.teachers.find(t => t.email === email);
}

function recent(ts) {
  return typeof ts === 'number' && Math.abs(Date.now() - ts) < 60 * 1000;
}

async function up() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(B + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}

(async () => {
  srv = startServer();
  await up();

  const owner = await call('owner', '/api/signup', { email: 'owner@test.com', password: 'password123' });
  check(owner.status === 200 && owner.j.teacher.marketing_opt_out === false && recent(owner.j.teacher.marketing_choice_at),
    'a sign-up with no box is not opted out, and the time is kept', JSON.stringify(owner.j && owner.j.teacher));

  const plain = await call('plain', '/api/signup', { email: 'plain@school.sch.uk', password: 'password123', marketing_opt_out: false });
  check(plain.j.teacher.marketing_opt_out === false && recent(plain.j.teacher.marketing_choice_at),
    'an unticked box is stored as not opted out', JSON.stringify(plain.j.teacher));

  const out = await call('out', '/api/signup', { email: 'out@school.sch.uk', password: 'password123', marketing_opt_out: true });
  check(out.j.teacher.marketing_opt_out === true && recent(out.j.teacher.marketing_choice_at),
    'a ticked box is stored as opted out', JSON.stringify(out.j.teacher));

  const camel = await call('camel', '/api/signup', { email: 'camel@school.sch.uk', password: 'password123', marketingOptOut: true });
  check(camel.j.teacher.marketing_opt_out === true, 'marketingOptOut true is the same refusal', JSON.stringify(camel.j.teacher));

  const yes = await call('yes', '/api/signup', { email: 'yes@school.sch.uk', password: 'password123', marketing_opt_out: 'yes' });
  check(yes.j.teacher.marketing_opt_out === true, 'the word yes is a refusal', JSON.stringify(yes.j.teacher));

  const word = await call('word', '/api/signup', { email: 'word@school.sch.uk', password: 'password123', marketing_opt_out: 'false' });
  check(word.j.teacher.marketing_opt_out === false && recent(word.j.teacher.marketing_choice_at),
    'the word false is not a refusal', JSON.stringify(word.j.teacher));

  const diskOut = stored('out@school.sch.uk');
  check(diskOut && diskOut.marketing_opt_out === true && diskOut.marketing_choice_at === out.j.teacher.marketing_choice_at,
    'the refusal is on the user record', JSON.stringify(diskOut && { marketing_opt_out: diskOut.marketing_opt_out, marketing_choice_at: diskOut.marketing_choice_at }));

  const again = await call('again', '/api/signup', { email: 'out@school.sch.uk', password: 'password123', marketing_opt_out: false });
  check(again.status === 400 && stored('out@school.sch.uk').marketing_opt_out === true,
    'signing up twice does not clear a refusal', again.j && again.j.error);

  const loginFlip = await call('out', '/api/login', { email: 'out@school.sch.uk', password: 'password123', marketing_opt_out: false });
  check(loginFlip.j.teacher.marketing_opt_out === true && stored('out@school.sch.uk').marketing_opt_out === true,
    'logging in does not opt someone back in', JSON.stringify(loginFlip.j.teacher));

  const ov = await call('owner', '/api/admin/overview');
  const outRow = ov.j.teachers.find(t => t.email === 'out@school.sch.uk');
  const plainRow = ov.j.teachers.find(t => t.email === 'plain@school.sch.uk');
  check(outRow && outRow.marketing_opt_out === true && plainRow && plainRow.marketing_opt_out === false,
    'the owner list exposes the flag', JSON.stringify({ out: outRow && outRow.marketing_opt_out, plain: plainRow && plainRow.marketing_opt_out }));

  /* An account created before this field existed: drop it, restart, and log in. */
  const dataPath = path.join(DIR, 'data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const legacy = data.teachers.find(t => t.email === 'plain@school.sch.uk');
  delete legacy.marketing_opt_out;
  delete legacy.marketing_choice_at;
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  srv.kill();
  await new Promise(r => setTimeout(r, 300));
  delete jar.plain;
  srv = startServer();
  await up();

  const legacyLogin = await call('plain', '/api/login', { email: 'plain@school.sch.uk', password: 'password123' });
  check(legacyLogin.status === 200 && legacyLogin.j.teacher.marketing_opt_out === false && legacyLogin.j.teacher.marketing_choice_at === null,
    'an older account is not opted out, and has no recorded choice', JSON.stringify(legacyLogin.j.teacher));
  const legacyDisk = stored('plain@school.sch.uk');
  check(legacyDisk && !Object.prototype.hasOwnProperty.call(legacyDisk, 'marketing_opt_out') && !Object.prototype.hasOwnProperty.call(legacyDisk, 'marketing_choice_at'),
    'logging an older account in does not invent the fields', JSON.stringify(legacyDisk));
  const stillOut = stored('out@school.sch.uk');
  check(stillOut && stillOut.marketing_opt_out === true && stillOut.marketing_choice_at === diskOut.marketing_choice_at,
    'a stored refusal survives a restart', JSON.stringify(stillOut && { marketing_opt_out: stillOut.marketing_opt_out, marketing_choice_at: stillOut.marketing_choice_at }));

  const me = await call('plain', '/api/me');
  check(me.j.teacher && me.j.teacher.email === 'plain@school.sch.uk' && me.j.teacher.marketing_opt_out === false,
    'an older account can still sign in', JSON.stringify(me.j.teacher));

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach(x => console.log('  ok   ' + x));
  fail.forEach(x => console.log('  FAIL ' + x));
  srv.kill();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail.length ? 1 : 0);
})().catch(e => {
  console.error('TEST CRASHED: ' + (e.stack || e.message));
  if (srv) srv.kill();
  process.exit(1);
});
