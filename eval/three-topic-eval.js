/* ============================================================================
   Three topics, easy / medium / hard, every answer given a band a teacher would
   have no trouble giving. Runs the real mark writer and the real marking, and
   reports the table and the percentage for each, plus the overall.

     easy    adding fractions with the same denominator   (countable, Year 4)
     medium  photosynthesis                               (science, explanation)
     hard    Macbeth                                      (motive and intent)

   node eval/three-topic-eval.js
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4608;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');

const SETS = [
  {
    level: 'EASY',
    topic: 'Adding fractions with the same denominator',
    questions: ['What is 2/7 + 3/7?', 'Why do you only add the top numbers?'],
    cases: [
      { band: 'green', q: 0, who: 'could teach it', a: '5/7. you only add the tops, the sevenths stay the same. like 2 apples plus 3 apples is 5 apples' },
      { band: 'green', q: 0, who: 'right, clumsy writing', a: '5/7. u dont add the bottom ones only the top' },
      { band: 'green', q: 1, who: 'could teach it - the why', a: 'because the bottom is just what size the pieces are. they are all sevenths so you are counting how many pieces you have. if you added the bottoms you would change what size the pieces are' },
      { band: 'amber', q: 0, who: 'right, no reason at all', a: '5/7' },
      { band: 'amber', q: 1, who: 'right words, thin', a: 'because the bottom stays the same' },
      { band: 'amber', q: 0, who: 'wobbles onto the answer', a: '5/14? no wait you dont do the bottom ones. 5/7 i think because 2 plus 3 is 5' },
      { band: 'red', q: 0, who: 'confidently wrong', a: '5/14. you add the tops together and the bottoms together' },
      { band: 'red', q: 1, who: 'gave nothing', a: 'dunno' }
    ]
  },
  {
    level: 'MEDIUM',
    topic: 'Photosynthesis: how a plant makes its food',
    questions: ['How does a plant get its food?', 'Why does a plant kept in a dark cupboard stop growing?'],
    cases: [
      { band: 'green', q: 0, who: 'could teach it', a: 'it makes its own food in its leaves using light. it takes in air and water from the roots and turns it into sugar. it cant eat like we do' },
      { band: 'green', q: 0, who: 'right, clumsy writing', a: 'it makes its own food with sun and water and air. thats what the green stuff in the leaves is for' },
      { band: 'green', q: 1, who: 'could teach it - the why', a: 'because there is no light so it cant make the sugar it needs for energy. it would use up whatever it stored and then stop growing' },
      { band: 'amber', q: 0, who: 'right idea, big gap', a: 'it uses the sun and water to grow' },
      { band: 'amber', q: 1, who: 'the answer without the reason', a: 'it needs the sun to grow so it stops' },
      { band: 'amber', q: 0, who: 'half of it, misses the light', a: 'it takes water up from the soil and makes its food out of that' },
      { band: 'red', q: 0, who: 'confidently wrong', a: 'it eats the soil through its roots, the same way we eat food with our mouths' },
      { band: 'red', q: 1, who: 'gave nothing', a: 'i dont know' }
    ]
  },
  {
    level: 'HARD',
    topic: 'Macbeth: Lady Macbeth persuading her husband to kill King Duncan',
    questions: ['Why does Lady Macbeth want Macbeth to kill Duncan?', '"Look like the innocent flower, But be the serpent under\'t." What is she telling him to do, and why that way round?'],
    cases: [
      { band: 'green', q: 0, who: 'could teach it', a: 'she knows he wants to be king but she thinks he is too soft to do anything about it. she says he is full of the milk of human kindness. so she has to push him. she wants it for herself too. she calls on the spirits to unsex her' },
      { band: 'green', q: 0, who: 'right, clumsy writing', a: 'coz he is to nice and she is more evil and wants to be queen so she does the pushing. she knows he wont do it on his own' },
      { band: 'green', q: 1, who: 'could teach it - the flower line', a: 'she is telling him to act normal and welcoming to Duncan so nobody suspects, but underneath be planning to kill him. it has to be that way round because Duncan is a guest and everyone is watching, so he has to look loyal first' },
      { band: 'amber', q: 0, who: 'right idea, big gap', a: 'she wants the crown and she is greedy. she wants power' },
      { band: 'amber', q: 1, who: 'gets the surface, misses the why', a: 'she tells him to look nice and be like a snake underneath. she is telling him to kill him in secret' },
      { band: 'amber', q: 1, who: 'rote, quote copied, cannot unpack', a: 'She says look like the innocent flower but be the serpent under it. This shows she is deceptive and manipulative and the theme of appearance versus reality.' },
      { band: 'red', q: 0, who: 'confidently wrong', a: 'she wants him to kill Duncan because Duncan is a bad king ruining Scotland. Macbeth would be a better king so it is the right thing to do' },
      { band: 'red', q: 1, who: 'gave nothing', a: 'i dont know it' }
    ]
  }
];

const log = (s) => console.log(s);
const PROBLEMS = [];
const ok = (name, cond, extra = '') => {
  log((cond ? '  OK   ' : '  FAIL ') + name + (extra ? '  <- ' + extra : ''));
  if (!cond) PROBLEMS.push(name);
};

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

  const rows = [];
  try {
    const su = await post('/api/signup', { email: 'three' + Date.now() + '@test.com', password: 'hunter22' });
    for (const set of SETS) {
      log('\n' + '='.repeat(78));
      log('  ' + set.level + '  -  ' + set.topic);
      log('='.repeat(78));

      const gen = await post('/api/generate', { topic: set.topic, questions: set.questions }, su.cookie);
      const MARKS = (gen.body && gen.body.marks) || [];
      MARKS.forEach((m, i) => {
        log('  Q' + (i + 1) + ': ' + set.questions[i]);
        (m || []).forEach(p => log('      * ' + p));
      });
      const drafted = MARKS.length === set.questions.length && MARKS.every(a => a.length >= 1);

      log('');
      const got = {};
      for (const c of set.cases) {
        const v = await post('/api/verdict', { topic: set.topic, transcript: 'Student: ' + c.a, marks: [MARKS[c.q] || []] });
        const verdict = (v.body && v.body.verdict) || {};
        got[c.who] = verdict.level;
        rows.push({ set: set.level, band: c.band, level: verdict.level, who: c.who });
        log('  ' + (verdict.level === c.band ? 'OK  ' : 'MISS') + '  ' + String(c.who).padEnd(36) +
          'teacher ' + String(c.band).padEnd(6) + 'ai ' + String(verdict.level));
      }
      const order = ['green', 'amber', 'red'];
      const hits = set.cases.filter(c => got[c.who] === c.band).length;
      const twoOut = set.cases.filter(c => Math.abs(order.indexOf(got[c.who]) - order.indexOf(c.band)) >= 2).length;
      ok(set.level + ': marks drafted for every question', drafted, MARKS.map(a => a.length).join('/'));
      ok(set.level + ': no answer two bands out', twoOut === 0, twoOut + ' two out');
      ok(set.level + ': nobody who understood was failed', !set.cases.some(c => c.band === 'green' && got[c.who] === 'red'));
      ok(set.level + ': nobody who gave nothing was passed', !set.cases.some(c => c.band === 'red' && got[c.who] === 'green'));
      log('  ---> ' + set.level + ' ' + hits + '/' + set.cases.length + '  (' + Math.round(100 * hits / set.cases.length) + '%)');
    }

    log('\n' + '='.repeat(78));
    log('  EVERYTHING');
    log('='.repeat(78));
    log('  ' + 'topic'.padEnd(10) + 'right'.padEnd(10) + 'answers   %');
    for (const s of SETS) {
      const rs = rows.filter(r => r.set === s.level);
      const h = rs.filter(r => r.level === r.band).length;
      log('  ' + s.level.padEnd(10) + (h + '/' + rs.length).padEnd(10) + String(rs.length).padEnd(10) + Math.round(100 * h / rs.length) + '%');
    }
    const allHits = rows.filter(r => r.level === r.band).length;
    log('  ' + '-'.repeat(50));
    log('  ' + 'OVERALL'.padEnd(10) + (allHits + '/' + rows.length).padEnd(10) + String(rows.length).padEnd(10) + Math.round(100 * allHits / rows.length) + '%');
    const order = ['green', 'amber', 'red'];
    const wrong = rows.filter(r => r.level !== r.band);
    log('\n  every wrong mark:');
    wrong.forEach(r => log('    ' + r.set.padEnd(7) + String(r.who).padEnd(36) + 'teacher ' + r.band.padEnd(6) + 'ai ' + r.level));
    const danger = rows.filter(r => Math.abs(order.indexOf(r.level) - order.indexOf(r.band)) >= 2);
    log('\n  dangerous marks (two bands out): ' + danger.length);
    log('  ' + '='.repeat(78) + '\n');
  } finally { stop(); }
})();
