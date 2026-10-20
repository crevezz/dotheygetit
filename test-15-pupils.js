/* One teacher, one check, 15 pupils joining and submitting together.

   This boots a throwaway copy of the app on 127.0.0.1 with its own data
   folder. It does not call the live site and it does not write the real
   database. Run it again with:  npm run test:15

   If GEMINI_API_KEY, OPENROUTER_API_KEY or key.txt is present, marking is
   real. If not, the server is started with MOCK_AI=1 so the rest of the
   path (join, chat, save, the teacher dashboard, the owner live count)
   still runs. The report says which one happened.
*/
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const PORT = 4615;
const BASE = 'http://127.0.0.1:' + PORT;
const PUPILS = 15;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-15-'));

const TOPIC = 'Adding fractions with the same bottom number';
const QUESTIONS = [
  'What is 1/4 + 1/4?',
  'What is 1/2 + 1/4?',
  'Why do you only add the top numbers when the bottoms match?'
];
const MARKS = [
  ['says one half', 'adds the top numbers'],
  ['says three quarters', 'adds the top numbers'],
  ['the bottoms already match', 'the bottom is the size of each piece']
];
const NAMES = [
  'Amira K', 'Jack T', 'Callum B', 'Sofia R', 'Noah P',
  'Layla H', 'Rhys D', 'Isla M', 'Omar S', 'Grace L',
  'Tyler W', 'Freya C', 'Kai N', 'Megan F', 'Idris O'
];
const ANSWERS = [
  ['1/2', '3/4', 'Because the bottoms are the same, so you just add the tops.'],
  ['one half', 'three quarters', 'The bottom number stays because the pieces are the same size.'],
  ['2/4', '3/4', 'You add the numerators.'],
  ['a half', 'I think 3/4', 'Not sure, maybe because the bottom is already matching.'],
  ['1/4', '1/2', 'I added the bottoms too and got 2/8.'],
  ['2/4 which is 1/2', '2/6', 'I always add both numbers.'],
  ['one half because 1+1 is 2 and the bottom stays 4', 'three quarters, 1+2 is 3 and the bottom stays 4', 'You only add the top when the bottoms match. The bottom tells you the size of the piece.'],
  ['1/2', '3/4', 'Same bottom.'],
  ['half', 'three quarters', 'The pieces are the same size so you add how many you have.'],
  ['2/4', '3/4', 'The denominator stays the same.'],
  ['1/2', '1/4 + 1/2 = 3/4', 'You cannot add the bottoms. They are the name of the fraction.'],
  ['a half I think', 'bigger than a half', 'dunno miss'],
  ['two quarters', 'three quarters', 'The bottom is how many pieces the whole was cut into.'],
  ['1/2', '3/4', 'If the bottoms match you add the tops and keep the bottom.'],
  ['one over two', 'three over four', 'Adding the bottoms would change the size of the piece, which is wrong.']
];

function hasRealKey() {
  if (String(process.env.GEMINI_API_KEY || '').trim()) return true;
  if (String(process.env.OPENROUTER_API_KEY || '').trim()) return true;
  try { return !!fs.readFileSync(path.join(ROOT, 'key.txt'), 'utf8').trim(); } catch { return false; }
}
const REAL_AI = hasRealKey();
const TIMEOUT_MS = REAL_AI ? 120000 : 20000;

const env = Object.assign({}, process.env, {
  PORT: String(PORT),
  DATA_DIR: DIR,
  ADMIN_EMAIL: 'owner@test.com',
  SIGNUP_CODE: '',
  REDIS_URL: '',
  APP_URL: BASE,
  MOCK_AI: REAL_AI ? '' : '1'
});
if (!REAL_AI) {
  env.GEMINI_API_KEY = '';
  env.OPENROUTER_API_KEY = '';
}

const srv = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
srv.stdout.on('data', d => { logs += d; });
srv.stderr.on('data', d => { logs += d; });
const stop = () => { try { srv.kill(); } catch {} };
process.on('exit', stop);

const jar = {};
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function call(who, p, body) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(BASE + p, {
      method: body === undefined ? 'GET' : 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        jar[who] ? { Cookie: jar[who] } : {}
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal
    });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (who && sc.length) jar[who] = sc.map(c => c.split(';')[0]).join('; ');
    let j = null;
    const text = await r.text();
    try { j = text ? JSON.parse(text) : null; } catch { j = { raw: text.slice(0, 300) }; }
    return { status: r.status, j, ms: Date.now() - t0, error: null, text };
  } catch (e) {
    const timedOut = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { status: 0, j: null, ms: Date.now() - t0, error: timedOut ? 'timeout' : (e.message || String(e)), text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function median(xs) {
  const a = xs.filter(n => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
function worst(xs) {
  const a = xs.filter(n => Number.isFinite(n));
  return a.length ? Math.max.apply(null, a) : null;
}
function ms(n) { return n == null ? 'n/a' : (n >= 1000 ? (n / 1000).toFixed(2) + 's' : n + 'ms'); }

const problems = [];
function fail(what) { problems.push(what); console.log('  FAIL  ' + what); }
function ok(what) { console.log('  ok    ' + what); }

async function onePupil(i) {
  const name = NAMES[i];
  const answers = ANSWERS[i];
  const out = {
    name, joinMs: [], chatMs: [], markMs: null, saveMs: null, totalMs: null,
    errors: [], status: [], answered: 0, gotVerdict: false, level: '', marked: false, saved: false
  };
  const t0 = Date.now();
  const join = await call(null, '/api/join?code=' + encodeURIComponent(code));
  out.joinMs.push(join.ms);
  out.status.push('join ' + join.status + (join.error ? ' ' + join.error : ''));
  if (join.status !== 200) out.errors.push('join ' + (join.error || join.status) + ' ' + ((join.j && join.j.error) || ''));
  const named = await call(null, '/api/join?code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(name));
  out.joinMs.push(named.ms);
  out.status.push('join-name ' + named.status + (named.error ? ' ' + named.error : ''));
  if (named.status !== 200) out.errors.push('join name ' + (named.error || named.status));
  if (named.j && named.j.done) out.errors.push('join said this pupil had already finished');

  const history = [];
  let covered = 0, digs = 0, done = false, guard = 0;
  while (!done && guard < 8) {
    guard++;
    const chat = await call(null, '/api/chat', {
      code, topic: TOPIC, questions: QUESTIONS, history, covered, digs
    });
    out.chatMs.push(chat.ms);
    out.status.push('chat ' + chat.status + (chat.error ? ' ' + chat.error : ''));
    if (chat.error === 'timeout') out.errors.push('chat timeout');
    else if (chat.status === 429) out.errors.push('chat rate limited');
    else if (chat.status !== 200 || !chat.j || !chat.j.reply) {
      out.errors.push('chat ' + (chat.error || chat.status) + ' ' + ((chat.j && chat.j.error) || ''));
      break;
    }
    history.push({ role: 'assistant', content: chat.j.reply });
    covered = chat.j.covered;
    digs = chat.j.digs;
    if (chat.j.done) { done = true; break; }
    const text = answers[Math.min(out.answered, answers.length - 1)];
    history.push({ role: 'user', content: text });
    out.answered++;
  }
  if (!done) out.errors.push('check never finished (turns ' + guard + ')');

  const transcript = history.map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content).join('\n');
  const verdict = await call(null, '/api/verdict', {
    topic: TOPIC, transcript, code, questions: QUESTIONS, marks: MARKS
  });
  out.markMs = verdict.ms;
  out.status.push('verdict ' + verdict.status + (verdict.error ? ' ' + verdict.error : ''));
  if (verdict.error === 'timeout') out.errors.push('marking timeout');
  else if (verdict.status === 429) out.errors.push('marking rate limited');
  else if (verdict.status !== 200 || !verdict.j || !verdict.j.verdict) {
    out.errors.push('verdict ' + (verdict.error || verdict.status) + ' ' + ((verdict.j && verdict.j.error) || ''));
  } else {
    out.gotVerdict = true;
    out.level = verdict.j.verdict.level || '';
    out.marked = !!verdict.j.verdict.marked;
    if (!['green', 'amber', 'red'].includes(out.level)) out.errors.push('verdict level missing (' + out.level + ')');
  }

  const saved = await call(null, '/api/result', {
    code, name, transcript, verdict: (verdict.j && verdict.j.verdict) || null
  });
  out.saveMs = saved.ms;
  out.status.push('save ' + saved.status + (saved.error ? ' ' + saved.error : ''));
  if (saved.error === 'timeout') out.errors.push('save timeout');
  else if (saved.status === 429) out.errors.push('save rate limited');
  else if (saved.status !== 200 || !saved.j || !saved.j.ok) {
    out.errors.push('save ' + (saved.error || saved.status) + ' ' + ((saved.j && saved.j.error) || ''));
  } else out.saved = true;

  out.totalMs = Date.now() - t0;
  return out;
}

let code = '';
let checkId = '';
let classId = '';

(async () => {
  if (/dotheygetit\.app/i.test(BASE)) {
    console.error('Refusing to run this against the live site.');
    process.exit(1);
  }

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await sleep(250);
    try { const r = await fetch(BASE + '/api/health'); up = r.ok; } catch {}
  }
  if (!up) {
    console.error('Local server did not start.\n' + logs);
    stop();
    process.exit(1);
  }
  console.log('Local only. Data folder: ' + DIR);
  console.log(REAL_AI
    ? 'Marking: real model (a key was available).'
    : 'Marking: stand-in. No GEMINI_API_KEY, OPENROUTER_API_KEY or key.txt, so the model call was not made.');
  if (!REAL_AI && !/MOCK/.test(logs)) fail('server did not confirm mock marking is on');
  else if (!REAL_AI) ok('server is using stand-in marking, not the live model');
  if (/Storage:\s+Redis/i.test(logs)) fail('server attached to Redis — this test must use a local throwaway file');
  else ok('storage is a throwaway local file');

  await call('owner', '/api/signup', { email: 'owner@test.com', password: 'password123' });
  await call('teacher', '/api/signup', { email: 'teacher@test.com', password: 'password123' });
  const meO = await call('owner', '/api/me');
  const meT = await call('teacher', '/api/me');
  if (!meO.j || !meO.j.teacher || meO.j.teacher.role !== 'admin') fail('owner account was not created');
  else ok('owner account ready');
  if (!meT.j || !meT.j.teacher || meT.j.teacher.role !== 'teacher') fail('teacher account was not created');
  else ok('teacher account ready');

  const anon = await call(null, '/api/admin/live');
  if (anon.status !== 401) fail('live count was visible while signed out (' + anon.status + ')');
  else ok('live count is hidden when signed out');
  const denied = await call('teacher', '/api/admin/live');
  if (denied.status !== 403) fail('a normal teacher could see the live count (' + denied.status + ')');
  else ok('live count is hidden from a normal teacher');
  const early = await call('owner', '/api/admin/live');
  if (early.status !== 200 || !early.j) fail('owner could not read the live count');
  else ok('owner can read the live count (' + early.j.teachers + ' teachers, ' + early.j.pupils + ' pupils)');
  if (early.j && early.j.pupils !== 0) fail('pupils were counted before anyone joined (' + early.j.pupils + ')');

  const cls = await call('teacher', '/api/class', { name: 'Year 7 test', year: 'Year 7' });
  classId = cls.j && cls.j.class && cls.j.class.id;
  code = cls.j && cls.j.class && cls.j.class.code;
  if (!classId || !code) {
    console.error('Could not make a class', cls.status, JSON.stringify(cls.j));
    stop();
    process.exit(1);
  }
  await call('teacher', '/api/roster', { classId, names: NAMES });
  const sess = await call('teacher', '/api/session', { classId, topic: TOPIC, questions: QUESTIONS, marks: MARKS });
  checkId = sess.j && sess.j.check && sess.j.check.id;
  if (!checkId) {
    console.error('Could not make a check', sess.status, JSON.stringify(sess.j));
    stop();
    process.exit(1);
  }
  ok('teacher started a check, code ' + code);

  console.log('\n15 pupils joining and submitting together...');
  const dashSeen = [];
  let stopPoll = false;
  const poller = (async () => {
    while (!stopPoll) {
      const r = await call('teacher', '/api/session?id=' + encodeURIComponent(checkId));
      const students = (r.j && r.j.check && r.j.check.students) || [];
      dashSeen.push({ n: students.length, status: r.status, ms: r.ms });
      await sleep(200);
    }
  })();

  const wall0 = Date.now();
  const results = await Promise.all(NAMES.map((_, i) => onePupil(i)));
  const wall = Date.now() - wall0;
  /* The class can finish faster than one dashboard refresh. Keep asking the
     way the teacher screen does until it shows everyone, or a second has passed. */
  const settleUntil = Date.now() + 1000;
  while (Date.now() < settleUntil) {
    const r = await call('teacher', '/api/session?id=' + encodeURIComponent(checkId));
    const students = (r.j && r.j.check && r.j.check.students) || [];
    dashSeen.push({ n: students.length, status: r.status, ms: r.ms });
    if (students.length >= PUPILS) break;
    await sleep(40);
  }
  stopPoll = true;
  await poller;

  const finalDash = await call('teacher', '/api/session?id=' + encodeURIComponent(checkId));
  const shown = (finalDash.j && finalDash.j.check && finalDash.j.check.students) || [];
  const list = await call('teacher', '/api/sessions?classId=' + encodeURIComponent(classId));
  const row = ((list.j && list.j.checks) || [])[0] || {};
  const live = await call('owner', '/api/admin/live');
  const liveAgain = await call('owner', '/api/admin/live');
  const errs = await call('owner', '/api/admin/errors');

  console.log('\n--- each pupil ---');
  results.forEach(r => {
    const flag = r.errors.length ? 'FAIL' : 'ok  ';
    console.log('  ' + flag + ' ' + r.name.padEnd(10) +
      ' join ' + ms(r.joinMs.reduce((a, b) => a + b, 0)) +
      '  chat ' + r.chatMs.map(ms).join(', ') +
      '  mark ' + ms(r.markMs) +
      '  save ' + ms(r.saveMs) +
      '  total ' + ms(r.totalMs) +
      (r.level ? '  ' + r.level : '') +
      (r.errors.length ? '  ' + r.errors.join('; ') : ''));
  });

  const savedN = results.filter(r => r.saved).length;
  const markedN = results.filter(r => r.gotVerdict && r.marked && ['green', 'amber', 'red'].includes(r.level)).length;
  const timeouts = results.reduce((n, r) => n + r.errors.filter(e => /timeout/.test(e)).length, 0);
  const limited = results.reduce((n, r) => n + r.errors.filter(e => /rate limited/.test(e)).length, 0);
  const namesShown = shown.map(s => s.name);
  const unique = new Set(namesShown.map(n => n.toLowerCase()));
  const withLevel = shown.filter(s => s.verdict && ['green', 'amber', 'red'].includes(s.verdict.level)).length;
  const dashMax = dashSeen.reduce((m, x) => Math.max(m, x.n), 0);
  const dashErrors = dashSeen.filter(x => x.status !== 200);

  console.log('\n--- did it all land ---');
  if (savedN !== PUPILS) fail(savedN + ' of ' + PUPILS + ' submissions were accepted');
  else ok('all ' + PUPILS + ' submissions were accepted');
  if (markedN !== PUPILS) fail(markedN + ' of ' + PUPILS + ' got a finished mark');
  else ok('marking finished for all ' + PUPILS);
  if (timeouts) fail(timeouts + ' timeout' + (timeouts === 1 ? '' : 's'));
  else ok('no timeouts');
  if (limited) fail(limited + ' rate limit' + (limited === 1 ? '' : 's') + ' (429)');
  else ok('no rate limits');
  results.forEach(r => r.errors.forEach(e => { if (!/timeout|rate limited/.test(e)) fail(r.name + ': ' + e); }));

  if (shown.length !== PUPILS) fail('teacher dashboard showed ' + shown.length + ' pupils, not ' + PUPILS);
  else ok('teacher dashboard showed all ' + PUPILS);
  if (unique.size !== PUPILS) fail('dashboard names were not 15 unique pupils (' + unique.size + ')');
  else ok('all 15 names were on the dashboard once each');
  if (withLevel !== PUPILS) fail('dashboard had a colour for ' + withLevel + ' of ' + PUPILS);
  else ok('every dashboard card had a colour');
  if (row.students !== PUPILS) fail('the check list said ' + row.students + ' finished');
  else ok('the check list said ' + PUPILS + ' finished');
  if (dashMax < PUPILS) fail('a refresh after the class finished still did not show ' + PUPILS + ' (highest was ' + dashMax + ')');
  else ok('dashboard count reached ' + PUPILS + ' (refreshes saw ' + dashSeen.map(x => x.n).join(', ') + ')');
  let diskCount = -1;
  try {
    const disk = JSON.parse(fs.readFileSync(path.join(DIR, 'data.json'), 'utf8'));
    diskCount = (disk.sessions || []).reduce((n, s) => n + ((s.students || []).length), 0);
  } catch (e) { diskCount = -1; }
  if (diskCount !== PUPILS) fail('the saved data file had ' + diskCount + ' answers, not ' + PUPILS);
  else ok('all ' + PUPILS + ' answers were in the saved data file');
  try {
    const disk = JSON.parse(fs.readFileSync(path.join(DIR, 'data.json'), 'utf8'));
    if (disk.presence || disk.pupils || disk.live) fail('the data file has a pupil-activity log');
    else ok('the data file has no pupil-activity log');
  } catch (e) { fail('could not re-read the data file'); }
  if (dashErrors.length) fail(dashErrors.length + ' dashboard refresh' + (dashErrors.length === 1 ? '' : 'es') + ' failed');
  else ok('every dashboard refresh succeeded (' + dashSeen.length + ' refreshes)');

  const missing = NAMES.filter(n => !namesShown.some(s => s.toLowerCase() === n.toLowerCase()));
  if (missing.length) fail('missing from the dashboard: ' + missing.join(', '));

  console.log('\n--- owner live count ---');
  if (!live.j || live.status !== 200) fail('owner live count failed at the end');
  else {
    ok('right now: ' + live.j.teachers + ' teachers, ' + live.j.pupils + ' pupils, ' + live.j.checksRunning + ' check running');
    /* Anonymous total of answers that arrived in the last few minutes.
       It must be one number, equal to the 15 answers, and never a list of names. */
    if (typeof live.j.pupils !== 'number' || Array.isArray(live.j.pupils)) fail('pupil count was not a single number');
    else if (live.j.pupils !== PUPILS) fail('anonymous pupil count was ' + live.j.pupils + ', not ' + PUPILS);
    else ok('anonymous pupil count is ' + PUPILS + ' (a number, not a list of children)');
    if (live.j.teachers < 2) fail('live teacher count was ' + live.j.teachers + ' (owner and the teacher should both be on)');
    else ok('live teacher count includes the owner and the teacher (' + live.j.teachers + ')');
    if (live.j.checksRunning < 1) fail('no check showed as running');
    else ok('a check shows as running');
    const today = live.j.today || {};
    if (today.checks < 1 || today.answers !== PUPILS) fail('today was ' + today.checks + ' checks and ' + today.answers + ' answers');
    else ok('today: ' + today.checks + ' check started, ' + today.answers + ' answers in, ' + today.teachers + ' teacher ran a check');
    const blob = JSON.stringify(live.j);
    const leaked = NAMES.filter(n => blob.toLowerCase().includes(n.toLowerCase()));
    if (leaked.length) fail('live count included pupil names: ' + leaked.join(', '));
    else ok('live count is numbers only, no pupil names');
  }
  if (!liveAgain.j || liveAgain.status !== 200) fail('live count did not refresh');
  else ok('live count answered again when asked (' + liveAgain.ms + 'ms)');
  const stillDenied = await call('teacher', '/api/admin/live');
  if (stillDenied.status !== 403) fail('teacher could read the live count after the check (' + stillDenied.status + ')');
  else ok('still hidden from a normal teacher');

  const serverErrors = (errs.j && errs.j.errors) || [];
  if (serverErrors.length) fail('server recorded ' + serverErrors.length + ' error(s): ' + serverErrors.map(e => e.where + ' ' + e.message).join(' | '));
  else ok('server error log was empty');

  const joinAll = results.flatMap(r => r.joinMs);
  const chatAll = results.flatMap(r => r.chatMs);
  const markAll = results.map(r => r.markMs);
  const saveAll = results.map(r => r.saveMs);
  const totalAll = results.map(r => r.totalMs);

  console.log('\n' + '='.repeat(64));
  console.log('  15 pupils, one teacher, one check');
  console.log('  marking             ' + (REAL_AI ? 'real model' : 'STAND-IN — model was not called'));
  console.log('  wall clock          ' + ms(wall));
  console.log('  join                median ' + ms(median(joinAll)) + '   worst ' + ms(worst(joinAll)));
  console.log('  chat reply          median ' + ms(median(chatAll)) + '   worst ' + ms(worst(chatAll)));
  console.log('  marking             median ' + ms(median(markAll)) + '   worst ' + ms(worst(markAll)));
  console.log('  save answer         median ' + ms(median(saveAll)) + '   worst ' + ms(worst(saveAll)));
  console.log('  one pupil, start to finish   median ' + ms(median(totalAll)) + '   worst ' + ms(worst(totalAll)));
  console.log('  submissions         ' + savedN + '/' + PUPILS);
  console.log('  marks finished      ' + markedN + '/' + PUPILS);
  console.log('  dashboard           ' + shown.length + ' shown, ' + withLevel + ' with a colour');
  console.log('  timeouts            ' + timeouts);
  console.log('  rate limits         ' + limited);
  console.log('  problems            ' + (problems.length ? problems.length : 'none'));
  console.log('='.repeat(64));
  if (!REAL_AI) {
    console.log('\nNot tested for real: how long Gemini or OpenRouter takes to mark,');
    console.log('whether the model provider rate-limits 15 pupils at once, and whether');
    console.log('the model itself returns a mark for every pupil. The times above are');
    console.log('the app doing the work around the model call.');
  }

  stop();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(problems.length ? 1 : 0);
})().catch(e => {
  console.error('TEST CRASHED: ' + (e && e.stack || e));
  console.error(logs.slice(-2000));
  stop();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
