/* scratch: proves /api/admin/teacher/delete is owner-only and takes everything with it */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-'));
const PORT = 4599;
const B = `http://127.0.0.1:${PORT}`;

const srv = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: DIR, ADMIN_EMAIL: 'owner@test.com', SIGNUP_CODE: '', API_KEY: 'x'
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stderr.on('data', d => process.stderr.write('  srv: ' + d));

const jar = {};
async function call(who, p, body, method) {
  const r = await fetch(B + p, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: Object.assign({ 'Content-Type': 'application/json' }, jar[who] ? { Cookie: jar[who] } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) jar[who] = sc.map(c => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

const pass = [], fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

(async () => {
  await new Promise(r => setTimeout(r, 900));

  await call('a', '/api/signup', { email: 'owner@test.com', password: 'password123' });
  await call('b', '/api/signup', { email: 'teacher@test.com', password: 'password123' });
  const meA = await call('a', '/api/me');
  const meB = await call('b', '/api/me');
  check(meA.j.teacher.role === 'admin', 'owner is admin', meA.j.teacher.role);
  check(meB.j.teacher.role === 'teacher', 'other is teacher', meB.j.teacher.role);

  // teacher b makes a class and a check with two answers in it
  const cls = await call('b', '/api/class', { name: 'Year 9 Maths', year: 'Year 9' });
  if (!cls.j || !cls.j.class) { console.error('CLASS FAILED', cls.status, JSON.stringify(cls.j), 'meB', JSON.stringify(meB.j)); srv.kill(); process.exit(1); }
  const classId = cls.j.class.id;
  const sess = await call('b', '/api/session', { classId, topic: 'Fractions', questions: ['What is 1/2 + 1/4?'], marks: [['two quarters', 'adds the tops']] });
  const sid = sess.j.check.id;
  await call('b', '/api/result', { code: cls.j.class.code, name: 'Pupil One', transcript: 'one half plus one quarter is three quarters', topic: 'Fractions' });
  await call('b', '/api/result', { code: cls.j.class.code, name: 'Pupil Two', transcript: 'three quarters', topic: 'Fractions' });
  const ov1 = await call('a', '/api/admin/overview');
  const bRow = ov1.j.teachers.find(t => t.email === 'teacher@test.com');
  if (!bRow) { console.error('OVERVIEW FAILED', ov1.status, JSON.stringify(ov1.j).slice(0, 400)); srv.kill(); process.exit(1); }
  check(bRow && bRow.classes.length === 1 && bRow.checkCount === 1 && bRow.studentCount === 2,
    'overview counts the teacher 1 class / 1 check / 2 answers', bRow && `${bRow.classes.length}/${bRow.checkCount}/${bRow.studentCount}`);

  // a plain teacher must not be able to remove anyone
  const denied = await call('b', '/api/admin/teacher/delete', { teacherId: bRow.id });
  check(denied.status === 403, 'a teacher is refused (403)', denied.status + ' ' + (denied.j && denied.j.error));
  const stillThere = await call('a', '/api/admin/overview');
  check(stillThere.j.teachers.length === 2, 'refused call changed nothing', stillThere.j.teachers.length);

  // signed out is refused too
  const anon = await fetch(B + '/api/admin/teacher/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId: bRow.id }) });
  check(anon.status === 401, 'signed out is refused (401)', anon.status);

  // the owner cannot remove themselves or another owner
  const self = await call('a', '/api/admin/teacher/delete', { teacherId: meA.j.teacher.id });
  check(self.j.error && self.status !== 200, 'owner cannot remove self', self.status + ' ' + self.j.error);

  // the real thing
  const del = await call('a', '/api/admin/teacher/delete', { teacherId: bRow.id });
  check(del.status === 200 && del.j.ok, 'owner removes the teacher', del.status);
  check(del.j.deletedClasses === 1 && del.j.deletedChecks === 1 && del.j.deletedAnswers === 2,
    'it reports 1 class / 1 check / 2 answers deleted', `${del.j.deletedClasses}/${del.j.deletedChecks}/${del.j.deletedAnswers}`);

  const ov2 = await call('a', '/api/admin/overview');
  check(ov2.j.teachers.length === 1, 'the teacher is gone from the owner view', ov2.j.teachers.length);
  check(ov2.j.totals.classes === 0 && ov2.j.totals.checks === 0 && ov2.j.totals.students === 0,
    'their class, check and answers are gone too', JSON.stringify(ov2.j.totals));

  // their browser is signed out
  const bAfter = await call('b', '/api/me');
  check(bAfter.j.teacher === null, 'their session is dead', JSON.stringify(bAfter.j));

  // the join code is dead
  const join = await call('b', '/api/join?code=' + cls.j.class.code);
  check(join.status >= 400 || join.j.error, 'the join code stops working', join.status);

  // and a second attempt is a clean error, not a crash
  const again = await call('a', '/api/admin/teacher/delete', { teacherId: bRow.id });
  check(again.j.error && !again.j.ok, 'removing twice is a clean error', again.j.error);

  // the owner is still signed in and the server is still up
  const meA2 = await call('a', '/api/me');
  check(meA2.j.teacher && meA2.j.teacher.role === 'admin', 'owner still signed in afterwards', JSON.stringify(meA2.j));
  const health = await call('a', '/api/health');
  check(health.j.ok, 'server still healthy', health.status);

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach(x => console.log('  ok   ' + x));
  fail.forEach(x => console.log('  FAIL ' + x));
  srv.kill();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASHED: ' + e.message); srv.kill(); process.exit(1); });
