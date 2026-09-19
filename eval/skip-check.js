/* See eval/OPEN-FIX.txt - this file also proves the half-finished
   comparison-question fix: Q2 is fixed, Q1 is still 0/2.

   What happens when a pupil skips a question and moves on?
   Three transcripts for the same 2-question check:
     A normal   - answers both
     B skipped  - says nothing to Q1, answers Q2
     C greeted  - same as B, but Q1 was asked with the greeting stuck on the front
                  (which is exactly what the app does on the first turn)
   The colour and the point count should show whether the skipped question is
   treated as blank (right) or the answer to Q2 is credited to Q1 (wrong). */
const path = require('path');
const { spawn } = require('child_process');
const PORT = 4612, BASE = 'http://localhost:' + PORT, ROOT = path.join(__dirname, '..');

const Q1 = 'Which is bigger, 1/2 or 1/4? How do you know?';
const Q2 = 'Which is bigger, 3/4 or 4/5? Tell me how you know.';
const QS = [Q1, Q2];
const MARKS = [['1/2 is bigger', 'halves are bigger pieces than quarters'], ['4/5 is bigger', 'over 20 they are 15/20 and 16/20']];
const A2 = '4/5, over 20 they are 15/20 and 16/20';
const A1 = '1/2 because 2 is smaller';

const CASES = {
  'A normal  ': 'Examiner: ' + Q1 + '\nStudent: ' + A1 + '\nExaminer: ' + Q2 + '\nStudent: ' + A2,
  'B skipped ': 'Examiner: ' + Q1 + '\nExaminer: ' + Q2 + '\nStudent: ' + A2,
  'C greeted ': 'Examiner: Hi there! ' + Q1 + '\nExaminer: ' + Q2 + '\nStudent: ' + A2
};

async function post(p, body, cookie) {
  const r = await fetch(BASE + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}), body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { await fetch(BASE + '/api/health'); up = true; } catch {} }
  if (!up) { console.log('server did not start'); stop(); process.exit(1); }

  const t = await post('/api/signup', { email: 'skip' + Date.now() + '@test.com', password: 'hunter22' });
  const teacher = t.cookie;

  console.log('\n2-question check. Q1 = "' + Q1 + '"');
  console.log('Q2 = "' + Q2 + '"\n');
  for (const k of Object.keys(CASES)) {
    const v = await post('/api/verdict', { topic: 'Comparing fractions', transcript: CASES[k], questions: QS, marks: MARKS }, teacher);
    const vd = (v.body && v.body.verdict) || {};
    const ev = (vd.evidence || []).map(e => e.got + '/' + e.total).join('  ');
    console.log(k + ' level=' + String(vd.level).padEnd(6) + ' points=' + (vd.pointsHit || 0) + '/' + (vd.pointsTotal || 0) + '  blanks=' + (vd.blanks || 0) + '  perQ=[' + ev + ']');
  }
  console.log('\n  Expected: Q1 blank -> not green, and Q2 points NOT credited to Q1.\n');
  stop(); process.exit(0);
})().catch(e => { console.log('FAILED: ' + e.message); process.exit(1); });
