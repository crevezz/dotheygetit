/* ============================================================================
   A whole lesson, 30 pupils, at once.

   Boots the real server, makes a real class with a real roster, then drives 30
   pupils through a 3-question check simultaneously - every chat turn and every
   verdict is a real AI call. Then it checks the boring part that actually
   breaks: that all 30 answers were stored, that the results page and the CSV
   agree with reality, and that nothing silently vanished.

   Run:  node eval/lesson-sim.js            (30 pupils)
         node eval/lesson-sim.js 8          (quicker)
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4605;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const PUPILS = Number(process.argv[2]) || 30;
const CONCURRENCY = 6;

const TOPIC = 'Comparing fractions';
const QUESTIONS = [
  'Which is bigger, 3/4 or 4/5? Tell me how you know.',
  'What would you do to compare 2/3 and 5/8?',
  'A pupil says one tenth is bigger than one fifth because 10 is bigger than 5. What would you tell them?'
];

/* Deliberately mixed ability, like a real class. */
const NAMES = ['Amira', 'Jack', 'Callum', 'Sofia', 'Noah', 'Layla', 'Rhys', 'Isla', 'Omar', 'Grace',
  'Tyler', 'Freya', 'Kai', 'Megan', 'Idris', 'Elsie', 'Ravi', 'Nia', 'Dylan', 'Ava',
  'Jonah', 'Priya', 'Leon', 'Maya', 'Charlie', 'Zara', 'Bilal', 'Erin', 'Max', 'Iris'];

/* Ten pupils, ten standards, from "could teach it" down to "said nothing".
   Each one has a band a teacher would give. Three children share each profile,
   so 30 pupils = every standard represented, and we can check whether the
   grades actually track the quality of the answer. */
const PROFILES = [
  {
    band: 'green', who: 'could teach it',
    a: ['4/5. Fifteenths of twenty: 3/4 is 15/20 and 4/5 is 16/20, so 4/5 is one twentieth bigger.',
      'Find the lowest common multiple of the bottoms, 24, so 16/24 against 15/24. So 2/3 is bigger.',
      'A tenth is smaller than a fifth. The bottom is how many pieces you cut the whole into, so more pieces means each one is smaller.']
  },
  {
    band: 'green', who: 'right, clumsy writing',
    a: ['4/5 is bigger. I done it by doing 4x5 and 5x4 to get 20 then times the tops.',
      'Same as before, make the botums the same, I think 24 works for 3 and 8.',
      'I would tell them that is rong and show them with the peices of a cake.'] 
  },
  {
    band: 'green', who: 'gets there after a wobble',
    a: ['3/4 cos 4 is bigger than 5, no wait that is backwards. It has to be 4/5, I need to make the bottoms the same to check.',
      'Make them both something they share, then look at the tops.',
      'You cut it into ten and you cut it into five. The ten pieces are smaller, so a fifth is bigger.'] 
  },
  {
    band: 'amber', who: 'right idea, one real gap',
    a: ['4/5 because 5 is bigger than 4.',
      'I would times them together.',
      'I would say they are wrong but I could not show them why properly.'] 
  },
  {
    band: 'amber', who: 'right answer, no method',
    a: ['4/5. I done it on a calculator, 3 divide 4 and 4 divide 5.',
      'I would use the calculator again.',
      'I know it is wrong but I would just tell them the answer.'] 
  },
  {
    band: 'amber', who: 'thin but correct',
    a: ['4/5 I think, because the bits are bigger.',
      'I would make them the same but I dont know the number.',
      'The bottom is how many bits you cut it into.'] 
  },
  {
    band: 'amber', who: 'rote, cannot unpack it',
    a: ['You convert both fractions to a common denominator and compare the resulting numerators.',
      'You would determine the least common multiple of the denominators, which is 24.',
      'They are incorrect because a larger denominator denotes a smaller unit fraction.'] 
  },
  {
    band: 'red', who: 'confidently wrong',
    a: ['3/4 because 3 and 4 are smaller numbers.',
      'Whatever the biggest numbers are is the biggest one.',
      'I would say ten is more than five so they are right.'] 
  },
  {
    band: 'red', who: 'gave nothing',
    a: ['dunno', 'idk miss', 'I dont know'] 
  },
  {
    band: 'red', who: 'chatty, off the question',
    a: ['I like maths when it is not fractions. My brother is better at it than me.',
      'Do we get to go out at break after this?',
      'Once I got a certificate in assembly for good reading.'] 
  }
];

const PROBLEMS = [];
const log = (s) => console.log(s);
const ok = (name, cond, extra = '') => {
  log('  ' + (cond ? 'OK   ' : 'FAIL ') + name + (extra ? '  <- ' + extra : ''));
  if (!cond) PROBLEMS.push(name);
};

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

/* run tasks with a ceiling on how many are in flight at once */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(BASE + '/api/health'); up = true; } catch {}
  }
  if (!up) { log('server did not start'); stop(); process.exit(1); }

  // ---- teacher sets up: account, class, roster, check
  const STAMP = Date.now();
  const signup = await post('/api/signup', { email: 'sim' + STAMP + '@test.com', password: 'hunter22' });
  const teacher = signup.cookie;
  ok('teacher signed up', signup.status === 200 && !!teacher, signup.status + ' ' + JSON.stringify(signup.body));

  const cls = await post('/api/class', { name: 'Sim Class ' + STAMP }, teacher);
  const classId = cls.body && cls.body.class && cls.body.class.id;
  const code = cls.body && cls.body.class && cls.body.class.code;
  ok('class created with a join code', !!classId && /^[a-z0-9]{4,12}$/.test(String(code)), 'code=' + code);

  const roster = await post('/api/roster', { classId, names: NAMES.slice(0, PUPILS) }, teacher);
  ok('roster of ' + PUPILS + ' saved', roster.status === 200, roster.status + ' ' + JSON.stringify(roster.body));

  /* the mark points - the AI drafts them, the teacher approves them, and from then on
     every pupil is marked against the teacher's standard */
  const gen = await post('/api/generate', { topic: TOPIC, questions: QUESTIONS }, teacher);
  const MARKS = (gen.body && gen.body.marks) || [];
  ok('every question carries mark points', MARKS.length === QUESTIONS.length && MARKS.every(a => a.length >= 2),
    MARKS.map(a => a.length).join('/') + ' ' + JSON.stringify(MARKS));

  const check = await post('/api/session', { classId, topic: TOPIC, questions: QUESTIONS, marks: MARKS }, teacher);
  const checkId = check.body && check.body.check && check.body.check.id;
  ok('check created', !!checkId, JSON.stringify(check.body));

  // ---- 30 pupils, all at once
  log('\ndriving ' + PUPILS + ' pupils through ' + QUESTIONS.length + ' questions...');
  const T0 = Date.now();
  const results = await pool(NAMES.slice(0, PUPILS), CONCURRENCY, async (name, i) => {
    const prof = PROFILES[i % PROFILES.length];
    const answers = prof.a;
    const history = [];
    let turns = 0, badReply = 0, failed = 0;
    for (let q = 0; q < QUESTIONS.length; q++) {
      history.push({ role: 'user', content: answers[q] });
      const r = await post('/api/chat', { code, topic: TOPIC, questions: QUESTIONS, history, digs: 0, covered: q });
      if (r.status !== 200) { failed++; continue; }
      const reply = String((r.body && r.body.reply) || '').trim();
      history.push({ role: 'assistant', content: reply });
      turns++;
      if (!reply || /Could not|error/i.test(reply)) badReply++;
      if (r.body && r.body.done) break;
    }
    const transcript = history.map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content).join('\n');
    const v = await post('/api/verdict', { topic: TOPIC, transcript, marks: MARKS });
    const verdict = v.body && v.body.verdict;
    const saved = await post('/api/result', { code, name, transcript, verdict });
    return { name, turns, badReply, failed, gotVerdict: !!verdict, level: verdict && verdict.level,
      saved: saved.status === 200, band: prof.band, who: prof.who,
      note: verdict && verdict.gets, next: verdict && verdict.nextStep };
  });
  const secs = (Date.now() - T0) / 1000;

  log('\n--- what came back ---');
  ok('every pupil got a reply on every question', results.every(r => r.turns === QUESTIONS.length),
    results.filter(r => r.turns !== QUESTIONS.length).map(r => r.name + ':' + r.turns).join(', ') || '');
  ok('no chat call failed', results.every(r => r.failed === 0));
  ok('no empty or error replies', results.every(r => r.badReply === 0),
    results.filter(r => r.badReply).map(r => r.name).join(', '));
  ok('every pupil got a verdict', results.every(r => r.gotVerdict));
  ok('every result was accepted', results.every(r => r.saved));
  const spread = results.reduce((a, r) => (a[r.level] = (a[r.level] || 0) + 1, a), {});
  log('  levels: ' + JSON.stringify(spread) + '   wall clock: ' + secs.toFixed(1) + 's');
  ok('the levels are not all identical (the AI is actually reading them)',
    Object.keys(spread).length > 1, JSON.stringify(spread));

  // ---- the boring part that actually breaks
  log('\n--- did it all get stored ---');
  const res = await get('/api/results?code=' + code + '&key=' + (cls.body.class.key || ''), teacher);
  const stored = (res.body && res.body.students) || [];
  ok('results page shows ' + PUPILS + ' pupils', stored.length === PUPILS, 'shows ' + stored.length);
  ok('every stored pupil has a verdict', stored.every(s => s.verdict && s.verdict.level));
  ok('no pupil name lost or duplicated',
    new Set(stored.map(s => s.name)).size === PUPILS, [...new Set(stored.map(s => s.name))].length + ' unique');

  const sessions = await get('/api/sessions?classId=' + classId, teacher);
  const one = (sessions.body && sessions.body.checks && sessions.body.checks[0]) || {};
  ok('the check reports ' + PUPILS + ' answers', one.students === PUPILS, 'reports ' + one.students);
  ok('the check reports a spread of levels, not one colour',
    Object.keys(one.levels || {}).length > 1, JSON.stringify(one.levels));

  const pupils = await get('/api/pupils?classId=' + classId, teacher);
  ok('per-pupil history has all ' + PUPILS, (((pupils.body || {}).pupils) || []).length === PUPILS,
    (((pupils.body || {}).pupils) || []).length + '');

  const csvRes = await fetch(BASE + '/api/export?classId=' + classId, { headers: { Cookie: teacher } });
  const csv = Buffer.from(await csvRes.arrayBuffer()).toString('utf8');
  const rows = csv.trim().split('\r\n');
  ok('CSV has a header plus ' + PUPILS + ' rows', rows.length === PUPILS + 1, rows.length + ' lines');
  ok('CSV first column is the pupil name', /^"?Pupil"?/.test(rows[0]), rows[0].slice(0, 40));
  ok('CSV has one column per question set', rows[0].includes(TOPIC));

  // ---- the nasty ones
  log('\n--- trying to break it ---');
  const dupe = await post('/api/result', { code, name: NAMES[0], transcript: 'Student: again', verdict: { level: 'green' } });
  const after = await get('/api/results?code=' + code + '&key=' + (cls.body.class.key || ''), teacher);
  const dupes = ((after.body || {}).students || []).filter(s => s.name === NAMES[0]).length;
  ok('a second submission does not overwrite the first', dupes >= 2,
    'the same pupil now has ' + dupes + ' records for one check - a re-send double-counts');

  const noCode = await post('/api/chat', { code: 'zzzzzz', topic: TOPIC, questions: QUESTIONS, history: [{ role: 'user', content: 'hi' }] });
  ok('a wrong class code is refused', noCode.status !== 200 || !noCode.body.reply || noCode.body.reply === '', noCode.status + '');

  const other = await post('/api/signup', { email: 'other' + STAMP + '@test.com', password: 'hunter22' });
  const stolen = await get('/api/export?classId=' + classId, other.cookie);
  ok('another teacher cannot export this class', stolen.status === 403 || stolen.status === 404 || stolen.status === 400,
    stolen.status + '');

  // ---- does the grade track the answer
  log('\n--- did the grade match the pupil ---');
  const order = ['green', 'amber', 'red'];
  const seenByProfile = {};
  for (const r of results) {
    const k = r.who;
    if (!seenByProfile[k]) seenByProfile[k] = { band: r.band, got: [], names: [], notes: [] };
    seenByProfile[k].got.push(r.level);
    seenByProfile[k].names.push(r.name);
    seenByProfile[k].notes.push(r.note);
  }
  const hits = results.filter(r => r.level === r.band).length;
  const bad = results.filter(r => Math.abs(order.indexOf(r.level) - order.indexOf(r.band)) >= 2);
  for (const [who, p] of Object.entries(seenByProfile)) {
    const tally = p.got.reduce((a, l) => (a[l] = (a[l] || 0) + 1, a), {});
    const allRight = p.got.every(l => l === p.band);
    log('  ' + (allRight ? 'OK  ' : 'MISS') + ' ' + who.padEnd(28) + 'teacher: ' + p.band.padEnd(6) +
      'ai: ' + JSON.stringify(tally));
  }
  log('  graded to the teacher\'s band: ' + hits + '/' + results.length +
    '  (' + (hits / results.length * 100).toFixed(0) + '%)');
  ok('no pupil is two bands out', bad.length === 0, bad.map(r => r.name + ' ' + r.level + ' vs ' + r.band).join(', '));
  ok('nobody who clearly understood was failed', !results.some(r => r.band === 'green' && r.level === 'red'));
  ok('nobody who gave nothing was passed', !results.some(r => r.band === 'red' && r.level === 'green'));
  ok('the class got a real spread of grades', new Set(results.map(r => r.level)).size >= 2);

  const misses = results.filter(r => r.level !== r.band);
  if (misses.length) {
    log('\n  misses:');
    for (const m of misses.slice(0, 8)) log('    ' + m.name + ' (' + m.who + ') teacher ' +
      m.band + ' -> ai ' + m.level + '   "' + String(m.note || '').slice(0, 70) + '"');
    if (misses.length > 8) log('    ... and ' + (misses.length - 8) + ' more');
  }

  log('\n' + '='.repeat(64));
  log('  ' + PUPILS + ' pupils, ' + QUESTIONS.length + ' questions, real AI on every turn');
  log('  wall clock          ' + secs.toFixed(1) + 's  (' + (PUPILS * QUESTIONS.length / secs).toFixed(1) + ' chat turns/sec)');
  log('  graded right        ' + hits + '/' + results.length);
  log('  problems            ' + (PROBLEMS.length ? PROBLEMS.join(' | ') : 'none'));
  log('='.repeat(64));

  stop();
  process.exit(PROBLEMS.length ? 1 : 0);
})();
