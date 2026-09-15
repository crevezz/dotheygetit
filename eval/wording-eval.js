/* ============================================================================
   Can a ten-year-old read the question once and know what is being asked?

   This is the test the user's mum failed. She is a post office manager - numerate,
   used to dealing with people all day - and she had to go back over the questions.
   Nothing in that check was beyond a Year 6 child. The wording was the bug.

   Two instruments, and neither is trusted until it has been shown to fail:
     1. a mechanical screen - length, one question mark, scene-setting, numbers
        spelled out in words, rambling sentences.
     2. an independent reader - a second model call, given nothing but the
        question, told to answer as a busy primary teacher: could a 10-year-old
        answer this straight off?

   The mechanical screen is deliberately narrow, and it carries the pass/fail. It catches
   shape, not register: "Explain why two quarters of a pizza is the same amount as half a
   pizza." is short and clean and still a bit stiff. That was the reader's job - and the
   reader turned out not to be usable: with a lenient prompt it cleared the pizza question
   off the real card, and with a strict one it failed my own careful rewrites of the same
   question. An AI judging "would a person understand this" is a coin with two faces, so
   it is printed as a second opinion and never counted as the result.

   That leaves the honest position: the hard rules are the guarantee, and the only real
   judge of whether a question reads plainly is a person - which is exactly how this
   started.

   Run:  node eval/wording-eval.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4609;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const MODEL = cfg.model || 'google/gemini-2.5-flash-lite';

let KEY = '';
try { KEY = fs.readFileSync(path.join(ROOT, 'key.txt'), 'utf8').trim(); }
catch { KEY = process.env.OPENROUTER_API_KEY || ''; }

let pass = 0, fail = 0;
const ok = (what, cond, detail) => {
  console.log((cond ? '  PASS ' : '  FAIL ') + what + (detail ? '   <- ' + detail : ''));
  cond ? pass++ : fail++;
};
const log = (s) => console.log(s);

/* --------------------------------------------------------------- the screen
   Two tiers, because they mean different things and lumping them would let me tune
   the bar until it agreed with me.

   HARD - shape. A child cannot read past these: too long, two questions in one,
   a scene to imagine, a sentence that runs on. A failure here is a failure.
   SOFT - register and taste: numbers spelled out, an instruction where a question
   would do. Worth a teacher's eye, not a verdict. */
const NUM_WORD = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand)\b/gi;
/* fraction language is allowed to stay as words - "two quarters" is how it is said */
const FRACTION_PHRASE = /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(quarters?|halves|half|thirds?|fifths?|eighths?|tenths?|ninths?)\b/gi;

function screen(text) {
  const hard = [], soft = [];
  const t = String(text || '').trim();
  if (!t) return { hard: ['empty question'], soft: [] };
  const sentences = t.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 18) hard.push(words.length + ' words (limit 18)');
  const longest = sentences.reduce((n, s) => Math.max(n, s.split(/\s+/).filter(Boolean).length), 0);
  if (longest > 16) hard.push('one sentence is ' + longest + ' words (limit 16)');
  const qm = (t.match(/\?/g) || []).length;
  if (qm > 1) hard.push(qm + ' questions in one');
  if (/\b(imagine|suppose|consider|picture this)\b/i.test(t)) hard.push('scene-setting ("imagine")');
  if (/[:;]/.test(t)) hard.push('colon or semicolon');
  const bare = t.replace(FRACTION_PHRASE, '');
  const spelled = bare.match(NUM_WORD);
  if (spelled) soft.push('number written as a word ("' + spelled[0] + '")');
  if (qm === 0) soft.push('written as an instruction, not a question');
  return { hard, soft };
}

/* --------------------------------------------------------- the independent reader
   One question at a time, no context, temperature 0. It is a second opinion, not a
   teacher: it can be wrong, and it is only ever used to ADD things for me to look
   at. A body of questions it clears is not proof of anything except that nothing
   jumped out at a careful reader. */
async function reader(q) {
  const body = {
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system', content: `You are a sharp adult reader - a post office manager, not a
teacher - being handed a question that an app is about to put to a 10-year-old on their own,
with no adult to explain it and nothing to look at.

Read it once, at normal speed, the way you would read a text message. Then answer this:
did you know straight away what you were being asked, or did you have to go back over it?

BE HARD TO PLEASE. A question can be perfectly understandable and still make you read it
twice, and that is the failure we care about: a child who has to go back over a question
answers the wrong thing, and then looks like they did not understand the subject when really
they never understood what they were being asked. Length, two jobs squeezed into one
question, a scene to imagine, and words a child would not use are all reasons to say no.

Being hard to THINK about is fine - that is often the whole point of a check. Being hard to
READ is not.

Return ONLY JSON: {"clear":true,"why":"..."}
"why" is one short sentence. If you had to go back over it, quote the exact words that did it.`
      },
      { role: 'user', content: 'The question is: ' + q }
    ]
  };
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'reader failed');
  const raw = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  try { return JSON.parse(raw); } catch { return { clear: true, why: 'unreadable: ' + raw.slice(0, 60) }; }
}

/* -------------------------------------------------------------- known answers
   Three of these came off a real results card the user pasted. Every one has to be
   caught by the reader; only the shaped ones are caught by the screen. If the
   instruments cannot fail on questions we already know are bad, a clean run on new
   ones would mean nothing. */
const KNOWN_BAD = [
  'Imagine you have a pizza cut into eight equal slices. If you eat three slices, what fraction of the pizza is left?',
  'Explain why two quarters of a pizza is the same amount as half a pizza.',
  'If you are saving up for a game that costs twenty pounds and you have already saved eight pounds, how many more pounds do you need to save?',
  'What is the answer when you add five and seven?',
  'Explain the reasoning behind the procedure you use when the denominators match.'
];
const KNOWN_GOOD = [
  'What is 5 + 7?',
  'You eat 3 slices of a pizza cut into 8. What fraction is left?',
  'Why is 2 quarters the same as a half?',
  'A game costs 20 pounds. You have 8 pounds. How much more do you need?'
];
const SCREEN_HARD_CATCHES = [0, 2];   /* the shape failures: 22 and 28 words, no adult reads that */

const TOPICS = [
  'Adding fractions with the same denominator',
  'Photosynthesis: how a plant makes its food',
  'Macbeth: Lady Macbeth persuading her husband to kill King Duncan',
  'The water cycle',
  'Rounding to the nearest 100',
  'Settling an argument without hurting anyone'
];

async function post(p, body, cookie) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: JSON.stringify(body)
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  log('\n=== 1. can the instruments fail? ===');
  KNOWN_BAD.forEach((q, i) => {
    const v = screen(q);
    if (SCREEN_HARD_CATCHES.includes(i)) ok('screen fails a known-bad question on shape', v.hard.length > 0, '"' + q.slice(0, 46) + '..." ' + v.hard.join('; '));
    else ok('screen passes this one on shape - so the reader has to catch it', v.hard.length === 0, v.hard.join('; '));
    if (v.soft.length) log('       (soft: ' + v.soft.join('; ') + ')');
  });
  KNOWN_GOOD.forEach(q => {
    const v = screen(q);
    ok('screen passes a plainly-worded question', v.hard.length === 0, '"' + q + '" ' + v.hard.join('; '));
  });

  if (!KEY) { log('\nNo API key - stopping after the offline checks.'); log('\nPASS ' + pass + ', FAIL ' + fail + '\n'); return; }

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

  const STAMP = Date.now();
  const signup = await post('/api/signup', { email: 'word' + STAMP + '@test.com', password: 'hunter22' });
  const teacher = signup.cookie;
  const cls = await post('/api/class', { name: 'Wording ' + STAMP }, teacher);
  const code = cls.body && cls.body.class && cls.body.class.code;
  ok('server up, teacher and class ready', !!teacher && !!code, 'code=' + code);

  /* the reader has to be able to fail too - otherwise a clean run proves nothing.
     One question here is unmistakable: "the reasoning behind the procedure you use when
     the denominators match" is not something anyone says out loud. If the reader passes
     that, the reader is broken and nothing it clears means anything. The rest is
     reported rather than asserted, because I have already seen a careful reader clear
     questions I think are bad - and hiding that would make the whole run decoration. */
  const badReads = [];
  for (const q of KNOWN_BAD) badReads.push(await reader(q));
  const JARGON = KNOWN_BAD.length - 1;
  ok('the reader fails the jargon question - so it can fail', !!(badReads[JARGON] && badReads[JARGON].clear === false),
    badReads[JARGON] && badReads[JARGON].why);
  KNOWN_BAD.forEach((q, i) => log('       ' + (badReads[i] && badReads[i].clear === false ? 'CAUGHT ' : 'passed ') + q.slice(0, 56) +
    (badReads[i] && badReads[i].clear === false ? '   -> ' + badReads[i].why : '')));
  const goodReads = [];
  for (const q of KNOWN_GOOD) goodReads.push(await reader(q));
  const goodPassed = goodReads.filter(r => r && r.clear !== false).length;
  /* KNOWN LIMIT, not a failure of the product: the reader also flags rewrites that are
     perfectly plain, so it cannot be the gate. Recorded as a number every run so nobody
     later reads a clean screen as "an AI confirmed these are clear". */
  log('    KNOWN LIMIT: the reader also called ' + (KNOWN_GOOD.length - goodPassed) + ' of the ' + KNOWN_GOOD.length +
    ' plainly-worded rewrites unclear - which is why it is advisory and the rules are the gate');

  log('\n=== 2. real questions, six topics ===');
  const flip = [];
  for (const topic of TOPICS) {
    const gen = await post('/api/generate', { topic, count: 4 }, teacher);
    const qs = (gen.body && gen.body.questions) || [];
    ok('"' + topic + '" -> ' + qs.length + ' questions', qs.length >= 3, JSON.stringify(gen.body).slice(0, 120));
    let wouldPass = 0, readerFlags = 0;
    for (const q of qs) {
      const v = screen(q);
      const r = await reader(q);
      const hard = v.hard.length > 0, soft = v.soft.length > 0;
      if (!hard) wouldPass++;
      else flip.push({ topic, q, v, why: r.why });
      /* The reader is advisory. With a strict prompt it flags my own carefully-written
         rewrites as unclear, which makes it useless as a gate - see section 1. It is
         printed for a human to glance at, never counted. */
      if (r.clear === false) readerFlags++;
      const tag = hard ? 'SCREEN: ' + v.hard.join('; ')
        : r.clear === false ? 'reader says: ' + r.why
        : soft ? 'soft: ' + v.soft.join('; ')
        : 'ok';
      log('    ' + (tag === 'ok' || tag.indexOf('soft') === 0 ? ' ok   ' : ' look ') + q);
      if (tag !== 'ok') log('         ' + tag);
    }
    ok('  no question is unreadable (shape)', wouldPass === qs.length,
      qs.filter(q => screen(q).hard.length).map(q => q.slice(0, 40)).join(' | '));
    log('    reader had a second opinion on ' + readerFlags + ' of ' + qs.length + ' (advisory only)');
    ok('  every question in this set is readable', wouldPass === qs.length, wouldPass + '/' + qs.length + ' clean');
    /* plain must not collapse into bare recall - the explain question is the one that
       shows understanding, so losing it while chasing readability is a real regression */
    ok('  the set still asks at least one why/how', qs.some(q => /\b(why|how|explain|what happens)\b/i.test(q)),
      qs.join(' | ').slice(0, 110));
  }

  log('\n=== 3. the examiner\'s own follow-up questions ===');
  /* The examiner only writes a follow-up when it thinks the answer was dodged, so one
     attempt per topic finds almost nothing. Several vague answers each, or the section
     has no sample and its "clean" line means nothing. */
  const vague = ['i dont know', 'cos it is', 'erm', '7', 'because', 'i think so'];
  const ATTEMPTS = 4;
  let seen = 0, clean = 0, goes = 0;
  for (let i = 0; i < TOPICS.length; i++) {
    const qs = ['What is 3/4 as a percent?', 'Why does that work?'];
    for (let k = 0; k < ATTEMPTS; k++) {
      goes++;
      const history = [
        { role: 'assistant', content: qs[0] },
        { role: 'user', content: vague[(i * ATTEMPTS + k) % vague.length] }
      ];
      const c = await post('/api/chat', { code, topic: TOPICS[i], questions: qs, history, covered: 1, digs: 0 });
      const reply = (c.body && c.body.reply) || '';
      if (!reply || !c.body || c.body.done) continue;
      if (reply.trim() === qs[1].trim()) continue;      /* no follow-up written this time */
      seen++;
      const v = screen(reply);
      const r = await reader(reply);
      const good = !v.hard.length;
      if (good) clean++;
      else flip.push({ topic: TOPICS[i] + ' (follow-up)', q: reply, v, why: r.why });
      log('    ' + (good ? ' ok   ' : ' look ') + reply);
      if (!good) log('         SCREEN: ' + v.hard.join('; '));
    }
  }
  /* Worth knowing rather than fixing: the examiner usually declines to dig, so the
     teacher's approved questions are doing nearly all the work and the AI writes very
     few questions of its own. That is the safe direction - the follow-up is the least
     controlled text in the system - but it means the feature is mostly inert. */
  log('    the examiner dug on ' + seen + ' of ' + goes + ' vague answers');
  if (seen) ok('every follow-up question it did write is readable (shape)', clean === seen, clean + '/' + seen + ' clean');
  else log('    none written, so nothing to judge');

  log('\n=== what a teacher would still have to look at ===');
  if (!flip.length) log('  nothing flagged.');
  flip.forEach(f => {
    const hard = (f.v && f.v.hard) || [], soft = (f.v && f.v.soft) || [];
    log('  [' + f.topic + ']\n    ' + f.q + '\n    -> ' +
      (hard.length ? 'HARD: ' + hard.join('; ') : '') + (soft.length ? ' soft: ' + soft.join('; ') : '') +
      (f.why && !hard.length ? ' reader: ' + f.why : ''));
  });

  stop();
  log('\nPASS ' + pass + ', FAIL ' + fail + '\n');
})();
