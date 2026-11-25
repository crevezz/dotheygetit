/* Read-only teacher export for the marketing assistant.
   Off until ADMIN_EXPORT_TOKEN is set. Bearer token only. No writes, no pupils. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.REDIS_URL;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-export-'));
process.env.DATA_DIR = DIR;
process.env.ADMIN_EXPORT_TOKEN = '';
const { exportTokenEqual } = require('./server');

const pass = [], fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

check(exportTokenEqual('same-token', 'same-token') === true, 'equal secrets match');
check(exportTokenEqual('same-token', 'same-tokEn') === false, 'a different character does not match');
check(exportTokenEqual('short', 'same-token') === false, 'a shorter value does not match');
check(exportTokenEqual('same-token-longer', 'same-token') === false, 'a longer value does not match');
check(exportTokenEqual('', 'same-token') === false, 'an empty value does not match');
check(exportTokenEqual('same-token', '') === false, 'an empty secret does not match');

const PORT = 4641;
const B = `http://127.0.0.1:${PORT}`;
const TOKEN = 'export-token-for-the-test';
let srv = null;
let tokenOn = false;

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DATA_DIR: DIR,
      ADMIN_EMAIL: 'owner@test.com',
      SIGNUP_CODE: '',
      REDIS_URL: '',
      API_KEY: 'x',
      ADMIN_EXPORT_TOKEN: tokenOn ? TOKEN : '   '
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => process.stderr.write('  srv: ' + d));
  child._log = () => log;
  return child;
}

const jar = {};
async function call(who, p, opts) {
  const o = opts || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
  if (jar[who]) headers.Cookie = jar[who];
  const r = await fetch(B + p, {
    method: o.method || (o.body === undefined ? 'GET' : 'POST'),
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body)
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) jar[who] = sc.map(c => c.split(';')[0]).join('; ');
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  return { status: r.status, j, text, headers: r.headers };
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
  check(srv._log().includes('Teacher export: off'), 'startup says the export is off, and does not print the token');
  check(!srv._log().includes('export-token'), 'the off log has no token text');

  const offJson = await call('anon', '/api/admin/teachers.json');
  const offCsv = await call('anon', '/api/admin/teachers.csv');
  const offPost = await call('anon', '/api/admin/teachers.json', { method: 'POST', body: { email: 'x@y.z' } });
  check(offJson.status === 404 && offCsv.status === 404 && offPost.status === 404,
    'a blank token disables json, csv, and post', offJson.status + '/' + offCsv.status + '/' + offPost.status);

  await call('owner', '/api/signup', { body: { email: 'owner@test.com', password: 'password123' } });
  await call('out', '/api/signup', { body: { email: 'out@school.example', password: 'password123', marketing_opt_out: true } });
  await call('in', '/api/signup', { body: { email: 'in@northgate.example.sch.uk', password: 'password123', marketing_opt_out: false } });
  const cls = await call('in', '/api/class', { body: { name: 'Year 10 Geography', year: 'Year 10' } });
  if (!cls.j || !cls.j.class) {
    console.error('CLASS FAILED', cls.status, JSON.stringify(cls.j));
    srv.kill();
    process.exit(1);
  }
  await call('in', '/api/session', {
    body: { classId: cls.j.class.id, topic: 'Rivers', questions: ['What is a tributary?'], marks: [['a smaller river']] }
  });
  await call('in', '/api/result', {
    body: { code: cls.j.class.code, name: 'Pupil Secret', transcript: 'a smaller river', topic: 'Rivers' }
  });

  srv.kill();
  await new Promise(r => setTimeout(r, 300));
  tokenOn = true;
  srv = startServer();
  await up();
  check(srv._log().includes('Teacher export: on') && !srv._log().includes(TOKEN),
    'startup says the export is on, without the token');

  const noAuth = await call('anon', '/api/admin/teachers.json');
  check(noAuth.status === 401 && noAuth.j && noAuth.j.error === 'Not allowed.', 'no header is refused', noAuth.status);

  const wrong = await call('anon', '/api/admin/teachers.json', { headers: { Authorization: 'Bearer wrong-token' } });
  check(wrong.status === 401 && !wrong.text.includes('wrong-token'), 'a wrong token is refused and not echoed');

  const shorter = await call('anon', '/api/admin/teachers.csv', { headers: { Authorization: 'Bearer ' + TOKEN.slice(0, 4) } });
  check(shorter.status === 401, 'a prefix is refused', shorter.status);

  const query = await call('anon', '/api/admin/teachers.json?access_token=' + encodeURIComponent(TOKEN));
  check(query.status === 401, 'the token in the URL is ignored', query.status);

  const cookieOnly = await call('owner', '/api/admin/teachers.json');
  check(cookieOnly.status === 401, 'the owner cookie is not enough', cookieOnly.status);

  const badScheme = await call('anon', '/api/admin/teachers.json', { headers: { Authorization: 'Token ' + TOKEN } });
  check(badScheme.status === 401, 'only a bearer token is accepted', badScheme.status);

  const ok = await call('anon', '/api/admin/teachers.json', { headers: { Authorization: 'bearer ' + TOKEN } });
  check(ok.status === 200 && ok.headers.get('cache-control') === 'no-store', 'a bearer token returns json', ok.status);
  const rows = (ok.j && ok.j.teachers) || [];
  const opted = rows.find(t => t.email === 'out@school.example');
  const active = rows.find(t => t.email === 'in@northgate.example.sch.uk');
  check(rows.length === 3, 'every account is in the list', rows.length);
  check(opted && opted.marketing_opt_out === true && active && active.marketing_opt_out === false,
    'the opt-out flag is on the row', JSON.stringify({ out: opted && opted.marketing_opt_out, inn: active && active.marketing_opt_out }));
  const keys = Object.keys(active || {}).sort().join(',');
  check(keys === ['answers', 'checks', 'classes', 'email', 'joined', 'lastActive', 'marketing_opt_out'].sort().join(','),
    'the row has only the export fields', keys);
  check(active && typeof active.classes === 'number' && active.classes === 1 && active.checks === 1 && active.answers === 1,
    'counts are 1 class / 1 check / 1 answer', active && [active.classes, active.checks, active.answers].join('/'));
  check(active && typeof active.joined === 'string' && typeof active.lastActive === 'string' && Date.now() - Date.parse(active.lastActive) < 60000,
    'joined and last active are times', JSON.stringify(active && { joined: active.joined, lastActive: active.lastActive }));
  check(opted && opted.lastActive === null && opted.classes === 0, 'a teacher with nothing has no last active');
  const dumped = JSON.stringify(ok.j);
  check(!dumped.includes('Pupil Secret') && !dumped.includes('transcript') && !dumped.includes(cls.j.class.code),
    'pupil names, transcripts, and join codes stay out');

  const csv = await call('anon', '/api/admin/teachers.csv', { headers: { Authorization: 'Bearer ' + TOKEN } });
  check(csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv'), 'csv is a spreadsheet', csv.headers.get('content-type'));
  check((csv.headers.get('content-disposition') || '').includes('getit-teachers-'), 'csv has a filename', csv.headers.get('content-disposition'));
  const csvText = csv.text.replace(/^\uFEFF/, '');
  check(csvText.startsWith('email,joined,last_active,classes,checks,answers,marketing_opt_out'),
    'csv columns are the export fields', csvText.split('\n')[0]);
  check(csvText.includes('out@school.example') && csvText.includes('true') && !csvText.includes('Pupil Secret'),
    'csv includes the opt-out and no pupil name');

  const before = await call('owner', '/api/admin/overview');
  const post = await call('anon', '/api/admin/teachers.json', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN },
    body: { teacherId: 'nope', email: 'new@school.example' }
  });
  check(post.status === 405, 'post is refused', post.status);
  const after = await call('owner', '/api/admin/overview');
  check(before.j.totals.teachers === after.j.totals.teachers && before.j.totals.students === after.j.totals.students,
    'a refused post changed nothing', JSON.stringify(after.j && after.j.totals));

  let locked = null;
  for (let i = 0; i < 31; i++) {
    locked = await call('anon', '/api/admin/teachers.json', { headers: { Authorization: 'Bearer nope-' + i } });
  }
  check(locked.status === 429 && !locked.text.includes('nope-30'), 'repeated guesses are slowed, and the guess is not echoed', locked.status);
  const still = await call('anon', '/api/admin/teachers.json', { headers: { Authorization: 'Bearer ' + TOKEN } });
  check(still.status === 200 && still.j.teachers.length === 3, 'the real token still works after the guesses', still.status);

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
