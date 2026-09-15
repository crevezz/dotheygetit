/* ============================================================================
   Hard-question check: Macbeth.

   Fractions are countable - a pupil either says the bottoms must match or they
   do not. Macbeth is not: the answers are about motive, dramatic intent and
   what a line is doing. If the mark-point system only works on sums, this is
   where it shows.

   Runs the teacher's two questions through the real mark writer, prints the
   mark points it drafted, then marks eight answers whose band a teacher would
   have no trouble giving.
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4607;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');

const TOPIC = 'Macbeth: Lady Macbeth persuading her husband to kill King Duncan';
const QUESTIONS = [
  'Why does Lady Macbeth want Macbeth to kill Duncan?',
  '"Look like the innocent flower, But be the serpent under\'t." What is she telling him to do, and why that way round?'
];

const CASES = [
  { band: 'green', q: 0, who: 'could teach it', a:
    "She knows he wants to be king but she thinks he is too soft to do anything about it. She says he is full of the milk of human kindness. So she has to push him. She also wants it for herself really. She calls on spirits to unsex her because she knows being a woman is meant to stop her.'" },
  { band: 'green', q: 0, who: 'right, clumsy writing', a:
    'coz he is to nice and she is more evil and want to be queen so she does the pushing. she knows he will not do it on is own so she has a go at him' },
  { band: 'green', q: 1, who: 'could teach it - the flower line', a:
    "She is telling him to act normal and welcoming to Duncan so nobody suspects, but underneath be planning to kill him. It has to be that way round because Duncan is there for a visit and everyone will be watching, so he has to look loyal first or they will know straight away." },
  { band: 'amber', q: 0, who: 'right idea, big gap', a:
    'she wants the crown and she is greedy. she wants power' },
  { band: 'amber', q: 1, who: 'gets the surface, misses the why', a:
    'she tells him to look nice and be like a snake underneath. she is telling him to kill him in secret' },
  { band: 'amber', q: 1, who: 'rote, quote copied, cannot unpack', a:
    'She says look like the innocent flower but be the serpent under it. This shows she is deceptive and manipulative and the theme of appearance versus reality.' },
  { band: 'red', q: 0, who: 'confidently wrong', a:
    "She wants him to kill Duncan because Duncan is a bad king and he is ruining Scotland. Macbeth is the good one who would be a better king so it is the right thing to do." },
  { band: 'red', q: 1, who: 'gave nothing', a: "i dont know it" }
];

const log = (s) => console.log(s);
const ok = (name, cond, extra = '') => {
  log((cond ? '  OK   ' : '  FAIL ') + name + (extra ? '  <- ' + extra : ''));
  if (!cond) PROBLEMS.push(name);
};
const PROBLEMS = [];

async function post(p, body, cookie) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: JSON.stringify(body || {})
  });
  let j = null; try { j = await r.json(); } catch { }
  return { status: r.status, body: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(PORT) }) });
  const stop = () => { try { srv.kill(); } catch { } };
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(BASE + '/api/health'); up = true; } catch { }
  }
  if (!up) { log('server did not start'); stop(); process.exit(1); }

  try {
    const STAMP = Date.now();
    const su = await post('/api/signup', { email: 'mac' + STAMP + '@test.com', password: 'hunter22' });
    const teacher = su.cookie;

    const gen = await post('/api/generate', { topic: TOPIC, questions: QUESTIONS }, teacher);
    const MARKS = (gen.body && gen.body.marks) || [];
    log('\n=== the mark points the AI drafted for Macbeth ===');
    MARKS.forEach((m, i) => {
      log('  Q' + (i + 1) + ': ' + QUESTIONS[i]);
      (m || []).forEach(p => log('      - ' + p));
    });
    ok('marks were drafted for both questions', MARKS.length === QUESTIONS.length && MARKS.every(a => a.length >= 2),
      MARKS.map(a => a.length).join('/') + ' ' + JSON.stringify(MARKS));

    log('\n=== marking eight answers ===');
    const results = [];
    for (const c of CASES) {
      const transcript = 'Student: ' + c.a;
      const v = await post('/api/verdict', { topic: TOPIC, transcript, marks: [MARKS[c.q] || []] });
      const verdict = (v.body && v.body.verdict) || {};
      results.push(Object.assign({}, c, { level: verdict.level, gets: verdict.gets, shaky: verdict.shaky }));
      log('  ' + (verdict.level === c.band ? 'OK  ' : 'MISS') + '  ' +
        String(c.who).padEnd(34) + 'teacher ' + c.band.padEnd(6) + 'ai ' + String(verdict.level).padEnd(6));
      if (verdict.gets) log('        ' + String(verdict.gets).slice(0, 110));
    }

    const hits = results.filter(r => r.level === r.band).length;
    const order = ['green', 'amber', 'red'];
    const bad = results.filter(r => Math.abs(order.indexOf(r.level) - order.indexOf(r.band)) >= 2);
    log('');
    ok('no answer is two bands out', bad.length === 0, bad.map(r => r.who + ' ' + r.level).join(', '));
    ok('nobody who understood it was failed', !results.some(r => r.band === 'green' && r.level === 'red'));
    ok('nobody who gave nothing was passed', !results.some(r => r.band === 'red' && r.level === 'green'));

    log('\n  ' + '='.repeat(60));
    log('  Macbeth, ' + CASES.length + ' answers');
    log('  marked to the teacher band   ' + hits + '/' + CASES.length + '  (' + Math.round(100 * hits / CASES.length) + '%)');
    log('  ' + '='.repeat(60) + '\n');
  } finally { stop(); }
})();
