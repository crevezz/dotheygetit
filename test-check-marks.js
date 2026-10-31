/* Edited questions must be marked against points for the text the teacher
   actually published. Unchanged questions keep the points from Generate.
   A removed question loses its points. A pasted or added question is the
   only one sent back to /api/generate.

     node test-check-marks.js
*/
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planCheckMarks } = require('./public/check-marks');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-marks-'));
const PORT = 4631;
const B = 'http://127.0.0.1:' + PORT;

const srv = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: Object.assign({}, process.env, {
    PORT: String(PORT),
    DATA_DIR: DIR,
    ADMIN_EMAIL: 'owner@test.com',
    SIGNUP_CODE: '',
    API_KEY: 'x',
    MOCK_AI: '1'
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let srvLog = '';
srv.stdout.on('data', d => { srvLog += d; });
srv.stderr.on('data', d => { srvLog += d; });

const jar = {};
async function call(p, body, method) {
  const r = await fetch(B + p, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: Object.assign({ 'Content-Type': 'application/json' }, jar.t ? { Cookie: jar.t } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) jar.t = sc.map(c => c.split(';')[0]).join('; ');
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (info ? '   <- ' + info : '')); }
}

const ORIG_Q = [
  'Explain why tenths decide which decimal is bigger',
  'Explain why negative eight is smaller than negative three',
  'Explain why you cannot add the bottoms of two fractions'
];
const ORIG_M = [
  ['seven tenths beats six tenths', 'zero point seven is the same as zero point seven zero'],
  ['negative eight is further below zero', 'a temperature of negative eight is colder'],
  ['the pieces are different sizes', 'make them both sixths first']
];

function sameMarks(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

(async () => {
  const same = planCheckMarks(ORIG_Q, ORIG_M, ORIG_Q.slice());
  check('untouched questions are not sent back to be marked', same.unchanged && same.missing.length === 0);
  check('untouched questions keep their own points', sameMarks(same.marks, ORIG_M));

  const dropped = planCheckMarks(ORIG_Q, ORIG_M, [ORIG_Q[0], ORIG_Q[2]]);
  check('removing a question asks for no new points', dropped.missing.length === 0, JSON.stringify(dropped.missing));
  check('removing a question drops its points and keeps the others',
    sameMarks(dropped.marks, [ORIG_M[0], ORIG_M[2]]), JSON.stringify(dropped.marks));

  const swapped = planCheckMarks(ORIG_Q, ORIG_M, [ORIG_Q[2], ORIG_Q[0], ORIG_Q[1]]);
  check('reordering follows the text, not the old slot',
    swapped.missing.length === 0 && sameMarks(swapped.marks, [ORIG_M[2], ORIG_M[0], ORIG_M[1]]));

  const pasted = 'Explain why a simile uses like or as and a metaphor does not';
  const added = 'Explain why a book on a table stays still';
  const edited = planCheckMarks(ORIG_Q, ORIG_M, [pasted, ORIG_Q[1], added]);
  check('a pasted question and an added question are the only ones remarked',
    edited.missing.length === 2 && edited.missing[0].question === pasted && edited.missing[1].question === added,
    JSON.stringify(edited.missing));
  check('the question left alone keeps the points written for it',
    sameMarks(edited.marks[1], ORIG_M[1]), JSON.stringify(edited.marks[1]));
  check('the pasted question does not inherit the points from that slot',
    edited.marks[0] == null && !sameMarks(edited.marks[0], ORIG_M[0]));

  const dupes = planCheckMarks(['Same question twice here please', 'Same question twice here please'],
    [['first copy of the points only'], ['second copy of the points only']],
    ['Same question twice here please']);
  check('one surviving copy keeps the first unused points',
    sameMarks(dupes.marks, [['first copy of the points only']]));

  const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  check('create check plans marks before it saves', /planCheckMarks\(generatedOriginal, generatedMarks, questions\)/.test(app));
  check('create check does not save the original points array blind', !/marks:\s*generated\.marks/.test(app));
  check('only the missing questions are posted to generate',
    /questions:\s*plan\.missing\.map\(m => m\.question\)/.test(app));

  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(B + '/api/me');
      if (r.status) break;
    } catch { await new Promise(r => setTimeout(r, 100)); }
  }

  const su = await call('/api/signup', { email: 'marks@test.com', password: 'password123' });
  check('teacher can sign up', su.status === 200 && su.j && su.j.teacher, su.status + ' ' + JSON.stringify(su.j));
  const cls = await call('/api/class', { name: '9Ma', year: 'Year 9' });
  check('class exists', !!(cls.j && cls.j.class), JSON.stringify(cls.j));
  const classId = cls.j && cls.j.class && cls.j.class.id;

  const freshQs = [
    'Explain why a half is bigger than a quarter',
    'Explain why a plant cell needs a cell wall',
    'Explain why a gas can be squashed and a solid cannot',
    'Explain why minus eight is smaller than minus three',
    'Explain why a simile is not the same as a metaphor',
    'Explain why balanced forces keep a book still'
  ];
  const gen = await call('/api/generate', { topic: 'first day back revision', questions: freshQs, count: freshQs.length });
  const gotQ = (gen.j && gen.j.questions) || [];
  const gotM = (gen.j && gen.j.marks) || [];
  check('generate keeps every question the teacher sent, past the old cap of five',
    gen.status === 200 && gotQ.length === freshQs.length && freshQs.every((q, i) => gotQ[i] === q),
    gen.status + ' ' + gotQ.length + ' ' + JSON.stringify(gen.j && gen.j.error));
  check('each question comes back with points that mention that question',
    gotM.length === freshQs.length && freshQs.every((q, i) => (gotM[i] || []).join(' ').includes(q.slice(0, 24))),
    JSON.stringify(gotM).slice(0, 500));

  /* The client stitch: two generated questions stay, one is pasted over. */
  const kept = [freshQs[0], freshQs[3]];
  const keptMarks = [gotM[0], gotM[3]];
  const replacement = 'Explain why particles in a solid cannot be pushed closer';
  const plan = planCheckMarks(freshQs, gotM, [replacement, freshQs[3]]);
  check('the stitch only asks for the pasted question',
    plan.missing.length === 1 && plan.missing[0].question === replacement && sameMarks(plan.marks[1], keptMarks[1]));
  const regen = await call('/api/generate', {
    topic: 'first day back revision',
    questions: plan.missing.map(m => m.question),
    count: plan.missing.length
  });
  const backQ = ((regen.j && regen.j.questions) || []).map(q => String(q || '').trim());
  const backM = (regen.j && regen.j.marks) || [];
  plan.missing.forEach(m => {
    const at = backQ.indexOf(m.question);
    plan.marks[m.index] = at >= 0 && Array.isArray(backM[at]) ? backM[at] : null;
  });
  check('the pasted question is marked against its own points',
    plan.marks[0] && plan.marks[0].join(' ').includes(replacement.slice(0, 24)) && !plan.marks[0].join(' ').includes(freshQs[0].slice(0, 24)),
    JSON.stringify(plan.marks[0]));
  check('the question that was not edited still has its original points',
    sameMarks(plan.marks[1], keptMarks[1]));

  const sess = await call('/api/session', {
    classId, topic: 'first day back revision', questions: plan.questions, marks: plan.marks
  });
  const sid = sess.j && sess.j.check && sess.j.check.id;
  const saved = await call('/api/session?id=' + encodeURIComponent(sid || ''), undefined, 'GET');
  const stored = saved.j && saved.j.check;
  check('the saved check stores the realigned points beside the final questions',
    stored && sameMarks(stored.questions, plan.questions) && sameMarks(stored.marks, plan.marks),
    JSON.stringify(stored && { questions: stored.questions, marks: stored.marks }).slice(0, 400));

  const transcript = plan.questions.map(q => 'Examiner: ' + q + '\nStudent: the idea and the reason').join('\n');
  const verdict = await call('/api/verdict', {
    topic: 'first day back revision',
    transcript,
    questions: plan.questions,
    marks: plan.marks,
    year: 'Year 9'
  });
  const ev = (verdict.j && verdict.j.verdict && verdict.j.verdict.evidence) || [];
  const shown = ev.map(e => (e.points || []).map(p => p.t).join(' | '));
  check('grading uses the pasted question\'s points, not the ones from the old slot',
    verdict.status === 200 && shown[0] && shown[0].includes(replacement.slice(0, 24)) && !shown[0].includes('half is bigger'),
    verdict.status + ' ' + JSON.stringify(shown));
  check('grading uses the kept question\'s original points',
    shown[1] && shown[1].includes(freshQs[3].slice(0, 24)),
    JSON.stringify(shown[1]));

  const untouched = await call('/api/session', {
    classId, topic: 'unchanged', questions: kept, marks: keptMarks
  });
  check('a check whose questions were not edited still saves',
    untouched.status === 200 && untouched.j && untouched.j.check && untouched.j.check.id);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  srv.kill();
  if (fail && srvLog) console.log(srvLog.slice(-2000));
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e && e.stack || e);
  if (srvLog) console.log(srvLog.slice(-2000));
  srv.kill();
  process.exit(1);
});
