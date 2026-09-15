/* eval/family-eval.js
   The four real answers from the owner's family test (live session b3e209ab,
   "simple maths", 13:41). Three of them answered correctly but explained little, so a
   teacher would call them shaky; one answered everything correctly, so a teacher would
   call that one green. All four came back RED.

   Run against the OLD mark points first - it must fail - and then against the mark points
   the current writer makes from the same five questions. Structure, not vibes.

   node eval/family-eval.js
*/
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 4622;
const BASE = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  OK   ' + name + (info ? '   <- ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? '   <- ' + info : '')); }
}
const log = m => console.log('  .    ' + m);

const TOPIC = 'Simple Maths';
const QUESTIONS = [
  'What is the answer when you add five and seven?',
  'If you have ten apples and eat two, how many are left?',
  'Imagine you have a pizza cut into eight equal slices. If you eat three slices, what fraction of the pizza is left?',
  'Explain why two quarters of a pizza is the same amount as half a pizza.',
  'If you are saving up for a game that costs twenty pounds and you have already saved eight pounds, how many more pounds do you need to save?'
];

/* the mark points the live check actually used - the ones that failed all four */
const OLD_MARKS = [
  ['Addition is combining two amounts together', 'The sum is the total after adding'],
  ['Subtraction takes away from a total', 'The remaining amount is what is left'],
  ['Fractions represent parts of a whole', 'The denominator shows the total number of equal parts'],
  ['Fractions can be equivalent or equal', 'Comparing fractions requires a common understanding of the whole'],
  ['Finding the difference involves subtraction', 'The remaining amount needed is the target minus what is saved']
];

const FAMILY = [
  { name: "Elaine O'Kelly", band: 'amber', notes: 'right answers, "5th" for the fraction, no explaining', a: ['12', '8', '5th', 'Two quarters make a half .', '12'] },
  { name: 'Cole', band: 'amber', notes: 'right answers in words, "D" for the fraction, no explaining', a: ['Twelve', 'Eight', 'D', 'Because two quarters is a half', 'Twelve'] },
  { name: 'Simon', band: 'amber', notes: '"Quarter" for the fraction, one garbled half-explanation', a: ['12', '8', 'Hehrhr Quarter', 'Half of a full amount fur quarters equals one full', '12'] },
  { name: 'craig', band: 'green', notes: 'all five right, with a real reason on the quarters question', a: ['12', '8', '5/8', 'because a pizza is cut into 4, making 4 quaters and 2 halfs. meaning 2 quaters go into 2 halfs', '12'] }
];

function transcriptOf(answers) {
  const lines = ["Examiner: Hi! Let's find out how well you understand this.\n"];
  QUESTIONS.forEach((q, i) => { lines.push('Examiner: ' + q); lines.push('Student: ' + (answers[i] || '')); });
  lines.push('Examiner: Great — that is everything I needed. Thank you for thinking it through!');
  return lines.join('\n');
}

/* the same screen /api/generate now enforces, kept here so the eval carries the gate */
const ASKS_FOR_ANSWER = /^(explain|why|describe|give a reason|how do you know)/i;
const NUMBERED = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|fifty|hundred|thousand|half|quarter|third|fifth|tenth)\b/i;
const ANSWER_WORD = /\b(says|say|states|gives|answers|writes|shows|names|counts|gets|works out)\b/i;
function answerable(question, pts) {
  const q = String(question || '').trim();
  const list = (pts || []).filter(Boolean);
  if (!list.length) return false;
  if (ASKS_FOR_ANSWER.test(q)) return true;
  if (!NUMBERED.test(q)) return true;
  return list.some(p => /\d/.test(p) || NUMBERED.test(p) || ANSWER_WORD.test(p));
}

const cookieJar = {};
async function call(p, body, cookie) {
  const h = { 'Content-Type': 'application/json' };
  if (cookie) h.Cookie = cookie;
  const r = await fetch(BASE + p, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, body: j, cookie: (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ') };
}
const verdictFor = async (t, marks) => (await call('/api/verdict', { topic: TOPIC, transcript: t, questions: QUESTIONS, marks })).body.verdict || {};

async function markAll(marks, label) {
  const rows = [];
  for (const f of FAMILY) {
    const v = await verdictFor(transcriptOf(f.a), marks);
    const ev = v.evidence || [];
    const got = ev.reduce((n, e) => n + e.got, 0), tot = ev.reduce((n, e) => n + e.total, 0);
    rows.push({ f, v, ev, got, tot });
    const bad = ev.filter((e, i) => e.points.some(p => p.hit && p.said && !String(f.a[i] || '').toLowerCase().includes(String(p.said).replace(/\.\.\.$/, '').toLowerCase().trim().slice(0, 12))));
    log(label + '  ' + f.name + '  got=' + v.level + '  points ' + got + '/' + tot + '   teacher would say ' + f.band + '  (' + f.notes + ')');
    if (bad.length) log('        quote does not come from the answer to that question: ' + bad.map(e => e.q.slice(0, 40)).join(' | '));
  }
  return rows;
}

(async () => {
  console.log('\nFamily of four: the real answers that all came back red\n');
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);

  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(BASE + '/api/health')).ok; } catch {} if (!up) await sleep(500); }
  if (!up) { console.log('  FAIL the server did not start'); stop(); process.exit(1); }

  /* ---- leg 1: the mark points that shipped. This must fail. ---- */
  console.log('\n1. the mark points that were used on the day (this has to fail)');
  const oldRows = await markAll(OLD_MARKS, 'old');
  const oldDead = QUESTIONS.filter((q, i) => !answerable(q, OLD_MARKS[i])).length;
  ok('it can fail: the old marking hands a red to a pupil who got everything right',
    oldRows.find(r => r.f.name === 'craig').v.level === 'red',
    'craig got all five right and was marked ' + oldRows.find(r => r.f.name === 'craig').v.level);
  ok('it can fail: questions nobody could score on', oldDead >= 3, oldDead + ' of 5 questions ask for an answer but carry no point that is the answer');

  /* ---- leg 2: mark points the current writer makes, same five questions ---- */
  console.log('\n2. mark points the writer makes now, from the same five questions');
  const su = await call('/api/signup', { email: 'fam' + Date.now() + '@test.com', password: 'family1234' });
  ok('a teacher can sign up (the marking harness needs a real writer)', su.status === 200, 'status ' + su.status);
  const gen = await call('/api/generate', { topic: TOPIC, questions: QUESTIONS }, su.cookie);
  const marks = gen.body.marks || [];
  ok('every question came back with 2 or 3 points', marks.length === QUESTIONS.length && marks.every(m => m.length >= 2 && m.length <= 3), marks.map(m => m.length).join('/'));
  const dead = QUESTIONS.filter((q, i) => !answerable(q, marks[i]));
  ok('every question can be scored by a pupil who answers it correctly', dead.length === 0, dead.length ? dead.map(q => q.slice(0, 45)).join(' | ') : 'all 5 reachable');
  marks.forEach((m, i) => log('Q' + (i + 1) + ' -> ' + JSON.stringify(m)));

  const rows = await markAll(marks, 'new');
  console.log('');
  const reds = rows.filter(r => r.v.level === 'red').map(r => r.f.name);
  ok('nobody is failed any more', reds.length === 0, reds.length ? 'still red: ' + reds.join(', ') : 'no reds');
  const right = rows.filter(r => r.f.band === r.v.level).map(r => r.f.name);
  ok('the marks land where a teacher would put them', right.length >= 3, right.length + ' of 4 match: ' + rows.map(r => r.f.name + ' ' + r.v.level + '/' + r.f.band).join(', '));

  const wrongQuote = rows.filter(r => r.ev.some((e, i) => e.points.some(p => p.hit && p.said && !String(r.f.a[i] || '').toLowerCase().includes(String(p.said).replace(/\.\.\.$/, '').toLowerCase().trim().slice(0, 12)))));
  ok('every quote on the card comes from the answer to the question it sits under', wrongQuote.length === 0, wrongQuote.map(r => r.f.name).join(', ') || 'all quotes fit their own question');

  console.log('\nPASS ' + pass + ', FAIL ' + fail + '\n');
  stop();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL harness: ' + e.message); process.exit(1); });
