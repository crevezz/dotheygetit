/* The override row, tested the way it broke: click green on a pupil the marking already
   called green, then click it again. Before the fix the second click cleared the override
   and the button read as dead. Run: node eval/override-test.js */
const path = require('path');
const { spawn } = require('child_process');
const PORT = 4625;
const BASE = 'http://localhost:' + PORT;
let cookie = '';

async function call(p, body, method) {
  const r = await fetch(BASE + p, {
    method: method || (body ? 'POST' : 'GET'),
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc && sc[0]) cookie = sc[0].split(';')[0];
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
let pass = 0, fail = 0;
const ok = (what, cond, detail) => { if (cond) { pass++; console.log('  OK   ' + what + (detail ? '  <- ' + detail : '')); } else { fail++; console.log('  FAIL ' + what + (detail ? '  <- ' + detail : '')); } };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch {} });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { await fetch(BASE + '/api/health'); up = true; } catch {} }
  if (!up) { console.log('server did not start'); process.exit(1); }

  await call('/api/signup', { email: 'ovr' + Date.now() + '@test.com', password: 'test1234' });
  const cls = await call('/api/class', { name: 'Override test' });
  const code = (cls.j.class || cls.j).code, key = (cls.j.class || cls.j).key;
  ok('a class was made', !!code, code);
  const ses = await call('/api/session', {
    classId: (cls.j.class || cls.j).id, topic: 'Simple addition',
    questions: ['What is 1 + 1?'], marks: [['says 2', 'adds the two numbers']]
  });
  const sid = ses.j.check.id;
  ok('a check was made', !!sid, sid);

  for (const [name, level] of [['amber pupil', 'amber'], ['green pupil', 'green']]) {
    await call('/api/result', { code, key, name, transcript: 'Student: 2', verdict: { level, gets: 'g', shaky: '', nextStep: '' } });
  }

  const before = await call('/api/results?code=' + code + '&key=' + key);
  const pupils = before.j.students || [];
  ok('both pupils are on the card', pupils.length === 2, pupils.map(p => p.name + '=' + p.verdict.level).join(', '));

  // 1. the reported bug: set green on the pupil the marking already called green
  const g = pupils.find(p => p.name === 'green pupil');
  const r1 = await call('/api/override', { sessionId: sid, name: g.name, level: 'green' });
  ok('clicking green on a green pupil answers ok', r1.j.ok === true, JSON.stringify(r1.j));
  const r2 = await call('/api/override', { sessionId: sid, name: g.name, level: 'green' });
  ok('clicking green a SECOND time still answers ok (not cleared)', r2.j.ok === true, JSON.stringify(r2.j));

  // 2. the ordinary case: overrule an amber pupil up to green
  const a = pupils.find(p => p.name === 'amber pupil');
  const r3 = await call('/api/override', { sessionId: sid, name: a.name, level: 'green' });
  ok('an amber pupil can be overruled to green', r3.j.level === 'green', JSON.stringify(r3.j));

  const after = await call('/api/results?code=' + code + '&key=' + key);
  const am = (after.j.students || []).find(p => p.name === 'amber pupil');
  const gr = (after.j.students || []).find(p => p.name === 'green pupil');
  ok('the green overrule stuck on the card', am && am.teacherLevel === 'green', am && JSON.stringify({ teacherLevel: am.teacherLevel, ai: am.aiLevel }));
  ok('the marking is remembered next to it', am && am.aiLevel === 'amber', am && String(am.aiLevel));
  ok('agreeing with the marking is not stored as a correction', gr && !gr.teacherLevel, gr && String(gr.teacherLevel));

  // 3. each button still works. Clicking the marking's OWN level is not a correction, so
  //    it clears the override and the card keeps showing the marking's colour.
  for (const lv of ['amber', 'red', 'green']) {
    const r = await call('/api/override', { sessionId: sid, name: a.name, level: lv });
    const want = lv === 'amber' ? null : lv;
    ok('the ' + lv + ' button sets ' + lv, r.j.level === want, JSON.stringify(r.j));
  }
  const bad = await call('/api/override', { sessionId: sid, name: a.name, level: 'purple' });
  ok('a nonsense level is refused', bad.status === 400, String(bad.status));

  console.log('\nPASS ' + pass + ', FAIL ' + fail);
  srv.kill();
  process.exit(fail ? 1 : 0);
})();
