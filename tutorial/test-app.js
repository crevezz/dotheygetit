/* ============================================================================
   Test the destructive + new endpoints: delete class, delete check, change
   password, export CSV, one-pupil history - INCLUDING that one teacher cannot
   touch another teacher's class.
       node test-app.js
   ========================================================================== */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 4602;
const STAMP = Date.now();
const E1 = 'a' + STAMP + '@test.com';
const E2 = 'b' + STAMP + '@test.com';
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cookieOf(res) {
  const raw = (res.headers.getSetCookie ? res.headers.getSetCookie()[0] : res.headers.get('set-cookie')) || '';
  return (raw.split(';')[0] || '');
}

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(BASE + '/api/health')).ok; } catch { await sleep(250); } }
  if (!up) { console.log('  server did not start'); srv.kill(); process.exit(1); }

  const call = async (p, body, cookie) => {
    const r = await fetch(BASE + p, {
      method: body === undefined ? 'GET' : 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let j = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) { try { j = await r.json(); } catch {} } else { j = await r.text(); }
    return { status: r.status, body: j, res: r };
  };

  /* ---- two teachers ---- */
  const t1 = cookieOf((await call('/api/signup', { email: 'E1', password: 'password1' })).res);
  const t2 = cookieOf((await call('/api/signup', { email: 'E2', password: 'password2' })).res);
  ok('two accounts created', t1.startsWith('sid=') && t2.startsWith('sid='));

  const cls = await call('/api/class', { name: 'Year 8 Maths' }, t1);
  const classId = cls.body.class.id;
  const code = cls.body.class.code;
  ok('class created', !!classId && !!code, JSON.stringify(cls.body));

  await call('/api/roster', { classId, names: 'Aisha Noor\nEthan Clarke' }, t1);
  const chk = await call('/api/session', { classId, topic: 'adding fractions', questions: ['Explain adding fractions.'] }, t1);
  ok('check created', !!chk.body.check.id);

  await call('/api/result', {
    code, name: 'Aisha Noor',
    transcript: 'Q: Explain adding fractions.\nA: You need the same bottom number.',
    verdict: { level: 'amber', gets: 'knows the denominator must match', shaky: 'cannot find a common one', nextStep: 'do three with different denominators', faked: false }
  }, t1);
  await call('/api/result', { code, name: 'Ethan Clarke', transcript: 'Q: A: I do not know', verdict: { level: 'red', gets: '', shaky: 'everything', nextStep: 'start with halves and quarters', faked: false } }, t1);

  /* ---- one-pupil history ---- */
  const pup = await call('/api/pupil?classId=' + classId + '&name=Aisha%20Noor', undefined, t1);
  ok('pupil history returns her result', pup.body.results && pup.body.results.length === 1, JSON.stringify(pup.body).slice(0, 120));
  ok('pupil history keeps the transcript', /same bottom number/.test(pup.body.results[0].transcript || ''));
  ok('pupil history has the verdict', pup.body.results[0].verdict.level === 'amber');

  /* ---- export ---- */
  const ex = await call('/api/export?classId=' + classId, undefined, t1);
  const csv = ex.body;
  /* read the raw bytes too - Response.text() silently strips the BOM */
  const rawExport = Buffer.from(await (await fetch(BASE + '/api/export?classId=' + classId, { headers: { Cookie: t1 } })).arrayBuffer());
  ok('export is a csv attachment', /text\/csv/.test(ex.res.headers.get('content-type')) && /attachment/.test(ex.res.headers.get('content-disposition') || ''));
  ok('export filename is named after the class', /year-8-maths-get-it\.csv/.test(ex.res.headers.get('content-disposition') || ''), ex.res.headers.get('content-disposition'));
  ok('csv has a BOM so Excel opens it right', rawExport[0] === 0xEF && rawExport[1] === 0xBB && rawExport[2] === 0xBF, rawExport.slice(0, 3).toString('hex'));
  const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
  ok('csv has a header + 2 pupils', lines.length === 3, 'got ' + lines.length);
  ok('csv header lists the check with its date', /adding fractions \(\d{4}-\d{2}-\d{2}\)/.test(lines[0]), lines[0]);
  ok('csv row has her level', /"Aisha Noor".*"amber"/.test(lines[1]), lines[1]);
  ok('csv quotes a value containing a comma safely', /"do three with different denominators"/.test(lines[1]), lines[1]);

  /* ---- another teacher must not be able to touch any of it ---- */
  ok('t2 cannot delete t1 class', (await call('/api/class/delete', { classId }, t2)).status === 400);
  ok('t2 cannot delete t1 check', (await call('/api/session/delete', { id: chk.body.check.id }, t2)).status === 400);
  ok('t2 cannot export t1 class', (await call('/api/export?classId=' + classId, undefined, t2)).status === 400);
  ok('t2 cannot read t1 pupil', (await call('/api/pupil?classId=' + classId + '&name=Aisha', undefined, t2)).status === 400);
  ok('logged-out cannot delete', (await call('/api/class/delete', { classId })).status === 401);
  ok('t1 class survived all that', (await call('/api/classes', undefined, t1)).body.classes.length === 1);

  /* ---- change password ---- */
  ok('wrong current password refused', (await call('/api/password', { current: 'nope', next: 'brandnew1' }, t1)).status === 400);
  ok('too-short new password refused', (await call('/api/password', { current: 'password1', next: 'abc' }, t1)).status === 400);
  ok('same password refused', (await call('/api/password', { current: 'password1', next: 'password1' }, t1)).status === 400);
  ok('change accepted', (await call('/api/password', { current: 'password1', next: 'brandnew1' }, t1)).status === 200);
  ok('old password no longer works', (await call('/api/login', { email: 'E1', password: 'password1' })).status === 400);
  const back = await call('/api/login', { email: 'E1', password: 'brandnew1' });
  ok('new password works', back.status === 200);
  const t1b = cookieOf(back.res);
  ok('other teacher unaffected', (await call('/api/login', { email: 'E2', password: 'password2' })).status === 200);

  /* ---- delete the check, then the class ---- */
  ok('delete check works', (await call('/api/session/delete', { id: chk.body.check.id }, t1b)).status === 200);
  ok('class now has no checks', (await call('/api/classes', undefined, t1b)).body.classes[0].checks === 0);
  const del = await call('/api/class/delete', { classId }, t1b);
  ok('delete class works', del.status === 200);
  ok('delete reports how many checks went', del.body.deletedChecks === 0, JSON.stringify(del.body));
  ok('class is gone', (await call('/api/classes', undefined, t1b)).body.classes.length === 0);
  ok('its answers are gone too', (await call('/api/pupil?classId=' + classId + '&name=Aisha%20Noor', undefined, t1b)).status === 400);
  ok('the join code stops working', (await call('/api/join?code=' + code)).status === 400);

  srv.kill();
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
