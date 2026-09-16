// Re-grade Elaine's exact card: does the correct answer 8 and 14 get credited now?
const { spawn } = require('child_process');
const path = require('path');
const PORT = 4671;

const QUESTIONS = [
  'What is 2 x 8?',
  'What is 4 multiplied by 2?',
  'How many groups of 2 are in 16?',
  'Explain why 2 x 5 is the same as 5 x 2.',
  'If you have 7 pairs of socks, how many socks do you have altogether?'
];
const MARKS = [
  ['multiplies 2 by 8', 'says 16,doubles 8'],
  ['multiplies 4 by 2', 'adds 4 and 4'],
  ['divides 16 by 2', 'says 16 is made of eight groups of 2'],
  ['explains multiplication is commutative', 'says the order of numbers does not matter in multiplication', 'says 2 groups of 5 is the same as 5 groups of 2'],
  ['multiplies 7 by 2', 'adds 7 and 7']
];
const TRANSCRIPT = [
  'Examiner: What is 2 x 8?', 'Student: 16',
  'Examiner: What is 4 multiplied by 2?', 'Student: 8',
  'Examiner: How many groups of 2 are in 16?', 'Student: 8',
  'Examiner: Explain why 2 x 5 is the same as 5 x 2.', 'Student: Same numbers just turned round',
  'Examiner: Why does turning them round not change the answer?', 'Student: Because the numbers are the same',
  'Examiner: If you have 7 pairs of socks, how many socks do you have altogether?', 'Student: 14'
].join('\n');

const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 30; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/verdict`); break; } catch { await wait(300); } }
  const r = await fetch(`http://127.0.0.1:${PORT}/api/verdict`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'the 2 times table', marks: MARKS, questions: QUESTIONS, transcript: TRANSCRIPT })
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt).verdict || JSON.parse(txt); } catch { console.log('RAW:', txt.slice(0, 500)); srv.kill(); process.exit(1); }
  console.log('LEVEL:', j.level, '| points', j.pointsHit + '/' + j.pointsTotal, '| shown', j.shown);
  (j.evidence || []).forEach((e, i) => {
    console.log(`Q${i + 1} ${e.got}/${e.total}  ${e.question}`);
    (e.points || []).forEach(p => console.log(`   ${p.hit ? 'yes' : 'no '} ${p.text}${p.quote ? '  "' + p.quote + '"' : ''}`));
  });
  srv.kill();
  process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
