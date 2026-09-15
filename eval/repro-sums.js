/* Reproduce one card, exactly. The teacher showed a card where the two mark points say
   the same thing - "The sum of 15 and 23 is 38" and "Correctly adds 15 and 23" - and the
   answer "38" was marked NO for one and YES for the other. Same shape, two verdicts.
   Run: node eval/repro-sums.js                                                    */
const path = require('path');
const { spawn } = require('child_process');
const PORT = 4624;
const BASE = 'http://localhost:' + PORT;

const QUESTIONS = [
  'What is 3 + 9?',
  'What is 15 + 23?',
  'What is 105 + 7?',
  'You have 12 sweets. You get 5 more. How many do you have now?',
  'Explain why adding 10 and 20 is the same as adding 20 and 10.'
];
const MARKS = [
  ['The sum of 3 and 9 is 12', 'Correctly adds 3 and 9'],
  ['The sum of 15 and 23 is 38', 'Correctly adds 15 and 23'],
  ['The sum of 105 and 7 is 112', 'Correctly adds 105 and 7'],
  ['The total number of sweets is 17', 'Correctly adds 12 and 5'],
  ['Adding numbers can be done in any order', 'The order of adding numbers does not change the answer']
];
const ANSWERS = ['12', '38', '112', '17',
  'its just the numbers reversed, they add up to the same amount either way.'];

const transcript = ANSWERS.map(a => 'Student: ' + a).join('\n');

(async () => {
  const srv = spawn(process.execPath, ['server.js'],
    { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch {} });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(BASE + '/api/health'); up = true; } catch {}
  }
  if (!up) { console.log('server did not start'); process.exit(1); }

  for (let run = 1; run <= 2; run++) {
    const r = await fetch(BASE + '/api/verdict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Simple addition', transcript, marks: MARKS, questions: QUESTIONS })
    });
    const j = (await r.json()).verdict || {};
    console.log('\nrun ' + run + '  level=' + j.level + '  points ' + j.pointsHit + '/' + j.pointsTotal +
      '  questions ' + j.shown + '/' + j.qs);
    (j.evidence || []).forEach((e, i) => {
      console.log('  Q' + (i + 1) + ' ' + e.got + '/' + e.total);
      e.points.forEach(p => console.log('     ' + (p.hit ? 'YES' : 'no ') + '  ' + p.t +
        (p.said ? '   <- "' + p.said + '"' : '')));
    });
  }
  srv.kill();
  process.exit(0);
})();
