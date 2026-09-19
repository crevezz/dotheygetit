/* ============================================================================
   YEAR GROUP: does it actually reach the grader?

   Creates three classes - Year 5, Year 13, and one with no year at all - and
   grades the SAME bare answer ("1/2", no reasoning) through each.

   What must happen:
     - the COLOUR must not move. A right answer is right at any age.
     - the "reason" flag SHOULD move: a few words can be a reason for a
       nine-year-old, but a seventeen-year-old should say why.
   If the colour moves, the year is doing damage. If the flag does not move,
   the year is not reaching the prompt at all.

   Run:  node eval/year-check.js
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4611;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');

const TOPIC = 'Comparing fractions (easy)';
const QS = ['Which is bigger, 1/2 or 1/4? How do you know?'];
const MARKS = [['1/2 is bigger', 'halves are bigger pieces than quarters']];
/* the bare answer - right, but no reasoning at all */
const TRANSCRIPT = 'Examiner: Which is bigger, 1/2 or 1/4? How do you know?\nStudent: 1/2, because 2 is smaller.';

async function post(p, body, cookie) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: JSON.stringify(body)
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
async function get(p, cookie) {
  const r = await fetch(BASE + p, { headers: cookie ? { Cookie: cookie } : {} });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);

  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { await fetch(BASE + '/api/health'); up = true; } catch {} }
  if (!up) { console.log('server did not start'); stop(); process.exit(1); }

  const ST = Date.now();
  const signup = await post('/api/signup', { email: 'yr' + ST + '@test.com', password: 'hunter22' });
  const teacher = signup.cookie;

  const out = {};
  for (const year of ['Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13', 'College', 'Adult', '']) {
    const cls = await post('/api/class', { name: 'Y' + (year || 'none') + ' ' + ST, year }, teacher);
    const c = cls.body.class;
    await post('/api/session', { classId: c.id, topic: TOPIC, questions: QS, marks: MARKS }, teacher);
    const v = await post('/api/verdict', { topic: TOPIC, transcript: TRANSCRIPT, questions: QS, marks: MARKS, code: c.code }, teacher);
    const vd = v.body.verdict || {};
    out[year || '(not set)'] = { storedYear: c.year, level: vd.level, reason: vd.reason, noReason: vd.noReason };
  }

  const list = await get('/api/classes', teacher);
  console.log('\nclass list -> ' + JSON.stringify((list.body.classes || []).map(c => ({ name: c.name, year: c.year }))));
  console.log('\nbare answer "1/2" (no reasoning), same rubric, only the year changes:');
  for (const k of Object.keys(out)) {
    const o = out[k];
    console.log('  ' + k.padEnd(10) + ' level=' + String(o.level).padEnd(6) + ' reason=' + String(o.reason).padEnd(6) + ' noReason=' + o.noReason);
  }
  const lv = Object.keys(out).map(k => out[k].level);
  const rs = Object.keys(out).map(k => out[k].reason);
  console.log('\n  colour held steady?  ' + (lv.every(x => x === lv[0]) ? 'YES' : 'NO  <-- year is moving the colour, which it must not'));
  console.log('  flag moved with age? ' + (new Set(rs).size > 1 ? 'YES' : 'no  <-- year may not be reaching the prompt'));
  console.log('');
  stop(); process.exit(0);
})().catch(e => { console.log('FAILED: ' + e.message); process.exit(1); });
