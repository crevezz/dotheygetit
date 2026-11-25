/* Owner directory data.
   lastActive is the newest check or answer already stored. A later answer
   beats an older check. recentChecks carries the check, not the pupil. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-overview-'));
const PORT = 4633;
const B = `http://127.0.0.1:${PORT}`;
const srvEnv = Object.assign({}, process.env, {
  PORT: String(PORT), DATA_DIR: DIR, ADMIN_EMAIL: 'owner@test.com', SIGNUP_CODE: '', REDIS_URL: '', API_KEY: 'x'
});
let srv = null;

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: srvEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', d => process.stderr.write('  srv: ' + d));
  return child;
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

const pass = [], fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

(async () => {
  srv = startServer();
  await up();

  await call('owner', '/api/signup', { email: 'owner@test.com', password: 'password123' });
  await call('active', '/api/signup', { email: 'active@northgate.example.sch.uk', password: 'password123' });
  await call('empty', '/api/signup', { email: 'empty@gmail.com', password: 'password123' });

  const denied = await call('active', '/api/admin/overview');
  check(denied.status === 403, 'a teacher is refused the overview', denied.status);

  const anon = await fetch(B + '/api/admin/overview');
  check(anon.status === 401, 'signed out is refused the overview', anon.status);

  const cls = await call('active', '/api/class', { name: 'Year 10 Geography', year: 'Year 10' });
  if (!cls.j || !cls.j.class) {
    console.error('CLASS FAILED', cls.status, JSON.stringify(cls.j));
    srv.kill();
    process.exit(1);
  }
  const sess = await call('active', '/api/session', {
    classId: cls.j.class.id,
    topic: 'Rivers',
    questions: ['What is a tributary?'],
    marks: [['a smaller river', 'joins a larger one']]
  });
  await call('active', '/api/result', {
    code: cls.j.class.code, name: 'Pupil One', transcript: 'a smaller river joining a bigger one', topic: 'Rivers'
  });
  await call('active', '/api/result', {
    code: cls.j.class.code, name: 'Pupil Two', transcript: 'it flows into the main river', topic: 'Rivers'
  });

  const ov = await call('owner', '/api/admin/overview');
  check(ov.status === 200 && ov.j && ov.j.totals && ov.j.totals.teachers === 3, 'totals still count every account', JSON.stringify(ov.j && ov.j.totals));
  const row = (ov.j.teachers || []).find(t => t.email === 'active@northgate.example.sch.uk');
  const blank = (ov.j.teachers || []).find(t => t.email === 'empty@gmail.com');
  if (!row || !blank) {
    console.error('ROWS MISSING', JSON.stringify(ov.j && ov.j.teachers));
    srv.kill();
    process.exit(1);
  }
  check(row.classes.length === 1 && row.checkCount === 1 && row.studentCount === 2,
    'counts stay 1 class / 1 check / 2 answers', row.classes.length + '/' + row.checkCount + '/' + row.studentCount);
  check(row.classes[0].year === 'Year 10' && row.classes[0].code === cls.j.class.code,
    'the class keeps its year and code', JSON.stringify(row.classes[0]));
  check(typeof row.lastActive === 'number' && Date.now() - row.lastActive < 60000,
    'last active is the check just run', row.lastActive);
  check(blank.lastActive === null && Array.isArray(blank.recentChecks) && blank.recentChecks.length === 0,
    'a teacher with nothing has no last active', JSON.stringify({ lastActive: blank.lastActive, recent: blank.recentChecks }));
  check(typeof blank.marketing_opt_out === 'boolean', 'the marketing flag is still on the row', blank.marketing_opt_out);
  const recent = row.recentChecks || [];
  const keys = Object.keys(recent[0] || {}).sort().join(',');
  check(recent.length === 1 && keys === ['answers', 'at', 'className', 'code', 'lastAnswerAt', 'topic'].sort().join(','),
    'a recent check has only check fields', keys);
  check(recent[0].topic === 'Rivers' && recent[0].answers === 2 && recent[0].code === cls.j.class.code,
    'the recent check is Rivers with 2 answers', JSON.stringify(recent[0]));
  const dumped = JSON.stringify(row);
  check(!dumped.includes('Pupil One') && !dumped.includes('Pupil Two') && !dumped.includes('transcript'),
    'pupil names and transcripts stay out of the row');

  const answerAt = Date.now() - 10 * 86400000;
  const checkAt = Date.now() - 40 * 86400000;
  const dataPath = path.join(DIR, 'data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const session = data.sessions.find(s => s.topic === 'Rivers');
  session.createdAt = checkAt;
  session.students[0].at = checkAt + 1000;
  session.students[1].at = answerAt;
  fs.writeFileSync(dataPath, JSON.stringify(data));
  srv.kill();
  await new Promise(r => setTimeout(r, 300));
  srv = startServer();
  await up();

  const again = await call('owner', '/api/admin/overview');
  const moved = (again.j.teachers || []).find(t => t.email === 'active@northgate.example.sch.uk');
  check(moved && moved.lastActive === answerAt, 'a later answer beats the older check', moved && moved.lastActive);
  check(moved && moved.classes[0].lastAt === answerAt, 'the class last time follows the answer', moved && moved.classes[0].lastAt);
  check(moved && moved.recentChecks[0].at === checkAt && moved.recentChecks[0].lastAnswerAt === answerAt,
    'the check keeps both times', JSON.stringify(moved && moved.recentChecks[0]));
  check(again.j.totals.students === 2 && again.j.totals.checks === 1, 'totals survive the restart', JSON.stringify(again.j.totals));

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
