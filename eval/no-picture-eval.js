/* ============================================================================
   "What is this picture?" - in a chat with no picture in it.

   The AI does not know it is talking to a child through a text box, so it will
   happily ask about a diagram it cannot send. A pupil then sits staring at a
   question they cannot possibly answer, guesses, and the teacher gets a red
   that means nothing.

   This asks for questions on deliberately visual topics and shouts if any of
   them refer to something the pupil cannot see.

   Run:  node eval/no-picture-eval.js
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4606;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');

/* Topics chosen because a question-writer naturally reaches for a picture. */
const TOPICS = [
  'The water cycle', 'Parts of a plant', 'Circuit symbols', 'Reading a map',
  'Fractions on a number line', 'The human skeleton', 'Bar charts',
  'Comparing 3/4 and 4/5', 'The layers of the rainforest', 'Food chains',
  'Telling the time', 'Angles in a triangle'
];

/* Phrases that can only mean "look at something you have not been given". */
const BANNED = [
  /\bpictures?\b/i, /\bphotos?\b/i, /\bimages?\b/i, /\bdiagrams?\b/i, /\bfigures?\b/i,
  /\bworksheets?\b/i, /\bposters?\b/i, /\bcartoons?\b/i, /\bshown below\b/i,
  /\bwhat can you see\b/i, /\bwhat do you see\b/i, /\blook at the\b/i,
  /\blook closely\b/i, /\bthis graph\b/i, /\bthe graph show/i, /\bthe table show/i,
  /\bdraw (a|the|an|your)\b/i, /\blabel (the|a|each)\b/i, /\bcolour in\b/i,
  /\bpoint (to|at) the\b/i, /\bcopy out the\b/i, /\bon the board\b/i, /\bon the screen\b/i
];

const problems = [];
const log = console.log;
const ok = (name, cond, extra = '') => {
  log('  ' + (cond ? 'OK   ' : 'FAIL ') + name + (extra ? '  <- ' + extra : ''));
  if (!cond) problems.push(name);
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

const offend = (text) => BANNED.filter(r => r.test(String(text || ''))).map(r => String(r).replace(/\\b|\//g, ''));

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

  // a fresh class, so we have a real code to chat under
  const STAMP = Date.now();
  const su = await post('/api/signup', { email: 'pic' + STAMP + '@test.com', password: 'hunter22' });
  const cookie = su.cookie;
  const cls = await post('/api/class', { name: 'Picture Test ' + STAMP }, cookie);
  const code = cls.body && cls.body.class && cls.body.class.code;
  ok('a class to test under', !!code, String(code));

  /* Prove the detector can fail before trusting it to pass. Without this the
     "no pictures" result could just mean the regexes never match anything. */
  const KNOWN_BAD = [
    'What is this picture showing?',
    'Look at the diagram below and explain what happens.',
    'Can you label the parts of the plant?',
    'Draw a bar chart of your results.',
    'What can you see in the image?'
  ];
  const caught = KNOWN_BAD.filter(t => offend(t).length);
  ok('the detector actually catches picture-questions', caught.length === KNOWN_BAD.length,
    caught.length + '/' + KNOWN_BAD.length + ' caught');

  let written = 0, badWritten = [], asked = 0, badAsked = [];
  const offenders = [];

  for (const topic of TOPICS) {
    const g = await post('/api/generate', { topic, count: 3 }, cookie);
    const qs = (g.body && g.body.questions) || [];
    ok('wrote questions for "' + topic + '"', qs.length >= 2, g.status + ' got ' + qs.length);
    for (const q of qs) {
      written++;
      const hits = offend(q);
      if (hits.length) { badWritten.push(q); offenders.push([topic, 'teacher questions', q, hits]); }
    }

    // and a vague answer, to force a follow-up question out of the examiner
    const c = await post('/api/chat', {
      code, topic, questions: qs.length ? qs : ['Tell me what you know about ' + topic],
      history: [{ role: 'user', content: 'I think it is something that happens' }], covered: 0, digs: 0
    }, cookie);
    const reply = String((c.body && c.body.reply) || '');
    if (reply) {
      asked++;
      const hits = offend(reply);
      if (hits.length) { badAsked.push(reply); offenders.push([topic, 'the examiner', reply, hits]); }
    }
  }

  const allText = (badWritten.length + badAsked.length);
  log('\n  ' + written + ' teacher questions and ' + asked + ' examiner replies checked');

  ok('no teacher question refers to a picture the pupil cannot see', badWritten.length === 0,
    badWritten.length ? badWritten.length + ' did' : '');
  ok('no examiner reply refers to a picture the pupil cannot see', badAsked.length === 0,
    badAsked.length ? badAsked.length + ' did' : '');
  ok('nothing at all refers to something unseen', allText === 0);

  // it still has to be a usable question, just in words
  ok('questions are still produced (the fix did not just refuse to answer)', written >= TOPICS.length * 2,
    written + ' questions');
  const rough = [];
  for (const topic of TOPICS) {
    const g = await post('/api/generate', { topic, count: 3 }, cookie);
    ((g.body && g.body.questions) || []).forEach(q => { if (!/\?/.test(q) && q.length < 8) rough.push(q); });
  }
  ok('the questions still read like questions', rough.length === 0, rough.join(' | '));

  if (offenders.length) {
    log('\n--- what it said ---');
    for (const [topic, who, text, hits] of offenders) {
      log('  [' + topic + '] ' + who + '  matched ' + hits.join(','));
      log('     "' + text.replace(/\n/g, ' ').slice(0, 220) + '"');
    }
  }

  log('\n' + '='.repeat(64));
  log('  ' + (problems.length ? 'PROBLEMS: ' + problems.join(' | ') : 'no question asks about something the pupil cannot see'));
  log('='.repeat(64));

  stop();
  process.exit(problems.length ? 1 : 0);
})();
