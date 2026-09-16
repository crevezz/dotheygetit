/* Three questions - easy, medium, hard - 10 pupils each. Real marking, real verdicts.
   For every pupil we say what the mark SHOULD be, and print where the app disagreed. */
const { spawn } = require('child_process');
const path = require('path');
const PORT = 4677;

const CHECKS = [
  {
    name: 'EASY  (one-point sum)',
    topic: 'adding within 20',
    questions: ['What is 5 + 7?'],
    marks: [['says 12']],
    pupils: [
      ['12', 'green'],
      ['12', 'green'],
      ['12.', 'green'],
      ['5 + 7 = 12', 'green'],
      ['12 because you add them', 'green'],
      ['12', 'green'],
      ['thirteen', 'red'],
      ['7', 'red'],
      ['I dont know', 'red'],
      ['12', 'green']
    ]
  },
  {
    name: 'MEDIUM  (two points, one method)',
    topic: 'adding fractions with the same bottom number',
    questions: ['What is 1/4 + 2/4?'],
    marks: [['says 3/4', 'adds the top numbers']],
    pupils: [
      ['3/4', 'green'],
      ['3/4', 'green'],
      ['3/4, you add the top numbers', 'green'],
      ['3/4 because the bottom stays the same', 'green'],
      ['3/4', 'green'],
      ['3/8', 'red'],
      ['3/8 you add everything', 'amber'],
      ['1/4 + 2/4 is 3/4', 'green'],
      ['three quarters', 'green'],
      ['you add 1 and 2 and keep the 4', 'green']
    ]
  },
  {
    name: 'HARD  (why, reasons to give)',
    topic: 'the 2 times table',
    questions: ['Explain why 2 x 5 is the same as 5 x 2.'],
    marks: [['explains the order does not matter', 'says 2 groups of 5 is the same as 5 groups of 2']],
    pupils: [
      ['2 groups of 5 is the same as 5 groups of 2', 'green'],
      ['because 2 groups of 5 makes 10 and 5 groups of 2 makes 10 too', 'green'],
      ['the order does not matter in timesing', 'amber'],
      ['because 2 x 5 and 5 x 2 both make 10', 'green'],
      ['its 10 either way', 'amber'],
      ['same numbers just turned round', 'amber'],
      ['because they are the same numbers', 'amber'],
      ['I dont know', 'red'],
      ['because 5 is bigger than 2', 'red'],
      ['you just swap them', 'amber']
    ]
  }
];

const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function grade(c, answer) {
  const transcript = ['Examiner: ' + c.questions[0], 'Student: ' + answer].join('\n');
  const r = await fetch(`http://127.0.0.1:${PORT}/api/verdict`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: c.topic, marks: c.marks, questions: c.questions, transcript })
  });
  const j = JSON.parse(await r.text());
  return j.verdict || j;
}

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/verdict`); break; } catch { await wait(300); } }
  let agree = 0, total = 0;
  const jobs = [];
  for (const c of CHECKS) c.pupils.forEach(p => jobs.push({ c, p }));
  const done = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      const { c, p } = jobs[i];
      try { done[i] = await grade(c, p[0]); } catch (e) { done[i] = { level: 'ERR', pointsHit: 0, pointsTotal: 0, shown: 0 }; }
    }
  };
  await Promise.all([...Array(6)].map(worker));

  jobs.forEach((job, i) => {
    const v = done[i];
    const ok = v.level === job.p[1];
    total++; if (ok) agree++;
    if (!job.expectedShown) job.expectedShown = true;
  });

  for (const c of CHECKS) {
    console.log('\n=== ' + c.name + ' ===');
    console.log('   Q: ' + c.questions[0]);
    c.pupils.forEach((p, k) => {
      const v = done[jobs.findIndex(j => j.c === c && j.p === p)];
      const mark = v.level === p[1] ? 'ok  ' : 'MISS';
      console.log(`  ${mark} ${p[1].padEnd(5)} got ${String(v.level || '?').padEnd(5)} ${v.pointsHit}/${v.pointsTotal} shown:${v.shown}  "${p[0]}"`);
    });
  }
  console.log('\nAGREED ' + agree + '/' + total);
  srv.kill();
  process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
