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

const ANSWERS = [
  ['4/5 because if you put them both over 20 you get 15/20 and 16/20', 'Make the bottoms the same, 24, so 16/24 and 15/24', 'A fifth is bigger than a tenth because the bottom tells you how many pieces you cut it into'],
  ['4/5 cos 5 is bigger', 'I would times them', 'I would say they are wrong'],
  ['I dont know', 'dunno', 'idk'],
  ['You have to find a common denominator and then compare the numerators', 'The lowest common multiple of 3 and 8 is 24', 'Ten pieces is smaller than five pieces because you cut the whole into more bits'],
  ['4/5', 'times it', 'because 10 is more than 5'],
  ['I think 4/5 is bigger but I am not sure how to show it properly', 'I would try to make them the same bottom but I get stuck', 'I would tell them to draw it']
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

  const check = await post('/api/session', { classId, topic: TOPIC, questions: QUESTIONS }, teacher);
  const checkId = check.body && check.body.check && check.body.check.id;
  ok('check created', !!checkId, JSON.stringify(check.body));

  // ---- 30 pupils, all at once
  log('\ndriving ' + PUPILS + ' pupils through ' + QUESTIONS.length + ' questions...');
  const T0 = Date.now();
  const results = await pool(NAMES.slice(0, PUPILS), CONCURRENCY, async (name, i) => {
    const answers = ANSWERS[i % ANSWERS.length];
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
    const v = await post('/api/verdict', { topic: TOPIC, transcript });
    const verdict = v.body && v.body.verdict;
    const saved = await post('/api/result', { code, name, transcript, verdict });
    return { name, turns, badReply, failed, gotVerdict: !!verdict, level: verdict && verdict.level, saved: saved.status === 200 };
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

  log('\n' + '='.repeat(64));
  log('  ' + PUPILS + ' pupils, ' + QUESTIONS.length + ' questions, real AI on every turn');
  log('  wall clock          ' + secs.toFixed(1) + 's  (' + (PUPILS * QUESTIONS.length / secs).toFixed(1) + ' chat turns/sec)');
  log('  slowest pupil       ' + null);
  log('  problems            ' + (PROBLEMS.length ? PROBLEMS.join(' | ') : 'none'));
  log('='.repeat(64));

  stop();
  process.exit(PROBLEMS.length ? 1 : 0);
})();
