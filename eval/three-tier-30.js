/* ============================================================================
   30 pupils, 3 difficulty classes: easy, medium, hard.

   Boots the real server, makes a real class with a real roster, then drives 30
   pupils - mixed ability, poor to excellent - through one easy question, one
   medium question and one hard question. Every chat turn and every verdict is a
   real AI call. Answers are short, the way pupils really write.

   Then it checks the thing that matters: does the grade track the pupil, and
   does it track the difficulty? A green pupil should stay green as the work
   gets harder until it genuinely beats them; a red pupil should not be handed a
   green for fluent words with the wrong maths.

   Run:  node eval/three-tier-30.js          (30 pupils)
         node eval/three-tier-30.js 8        (quicker)
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4606;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const PUPILS = Number(process.argv[2]) || 30;
const CONCURRENCY = 6;

/* ---- the three difficulty classes ---------------------------------------- */
const TIERS = [
  {
    tier: 'easy', topic: 'Comparing fractions (easy)',
    questions: ['Which is bigger, 1/2 or 1/4? How do you know?']
  },
  {
    tier: 'medium', topic: 'Comparing fractions (medium)',
    questions: ['Which is bigger, 3/4 or 4/5? Tell me how you know.']
  },
  {
    tier: 'hard', topic: 'Comparing fractions (hard)',
    questions: ['Put these in order, smallest to biggest: 3/4, 5/7, 0.8. Explain how you know.']
  }
];

const NAMES = ['Amira', 'Jack', 'Callum', 'Sofia', 'Noah', 'Layla', 'Rhys', 'Isla', 'Omar', 'Grace',
  'Tyler', 'Freya', 'Kai', 'Megan', 'Idris', 'Elsie', 'Ravi', 'Nia', 'Dylan', 'Ava',
  'Jonah', 'Priya', 'Leon', 'Maya', 'Charlie', 'Zara', 'Bilal', 'Erin', 'Max', 'Iris'];

/* ---- ability, poor -> excellent ------------------------------------------
   Six honest bands. Counts chosen so the class looks like a real one:
   2 gave nothing, 6 poor, 6 weak, 6 middling, 5 good, 5 excellent. */
const QUALITY_ORDER = ['none', 'poor', 'weak', 'ok', 'good', 'excellent'];
const QUALITIES = [];
for (let i = 0; i < 30; i++) {
  QUALITIES.push(i < 2 ? 'none' : i < 8 ? 'poor' : i < 14 ? 'weak' : i < 20 ? 'ok' : i < 25 ? 'good' : 'excellent');
}

/* short answers, three phrasings each, so no two pupils sound identical.
   Every band answers every tier - the same pupil gets harder work, not easier. */
const ANSWERS = {
  easy: {
    none: ['dunno', 'idk miss', 'I dont know'],
    poor: ['1/2', '1/4 maybe', '1/2 I think'],
    weak: ['1/4 because 4 is bigger than 2.', '1/4, the bigger number wins.', '1/2 cos a half is big.'],
    ok: ['1/2 I think, because it is a bigger piece.', '1/2, halves are bigger than quarters.', '1/2, you get more with a half.'],
    good: ['1/2. A half is bigger than a quarter.', '1/2, because quarters are smaller pieces.', '1/2 because a half is a big piece.'],
    excellent: ['1/2. Halves are bigger pieces than quarters, so 1/2 is more.', '1/2. Cut a whole into 2 vs 4; the halves are bigger, so 1/2 wins.', '1/2. Fewer pieces means bigger pieces, so a half beats a quarter.']
  },
  medium: {
    none: ['dunno', 'idk', 'nothing'],
    poor: ['4/5', '3/4 maybe', '4/5 I think'],
    weak: ['3/4 because 3 and 4 are smaller numbers.', '4/5 because 5 is the biggest number.', '3/4, smaller numbers are bigger.'],
    ok: ['4/5 I think. You make the bottoms the same.', '4/5. I get 20 on the bottom.', '4/5, I put them over 20.'],
    good: ['4/5. I put both over 20: 15/20 and 16/20.', '4/5. Common denominator 20, 15 against 16.', '4/5. 3/4 is 15/20 and 4/5 is 16/20.'],
    excellent: ['4/5. 15/20 vs 16/20, so 4/5 is bigger by one twentieth.', '4/5. Over 20 they are 15/20 and 16/20, and 16 is larger.', '4/5. 3/4=0.75 and 4/5=0.8, so 4/5 is bigger.']
  },
  hard: {
    none: ['no idea', 'I dont know', 'cant do it'],
    poor: ['0.8 is biggest.', '3/4, 5/7, 0.8', 'not sure'],
    weak: ['3/4, 5/7, 0.8 because 3 is the smallest.', '0.8, 3/4, 5/7 by the numbers.', '5/7, 3/4, 0.8 I guess.'],
    ok: ['3/4 is 0.75, so 5/7, 3/4, 0.8 I think.', '5/7 then 3/4 then 0.8, I made decimals.', '5/7, 3/4, 0.8 - not fully sure.'],
    good: ['5/7, 3/4, 0.8. I changed them all to decimals.', '5/7=0.71 and 3/4=0.75, so 5/7, 3/4, 0.8.', '0.8 is biggest, and 5/7 is less than 3/4, so 5/7, 3/4, 0.8.'],
    excellent: ['5/7, 3/4, 0.8. As decimals: 0.714, 0.75, 0.8, so 5/7 < 3/4 < 0.8.', '5/7, 3/4, 0.8. Over 140: 5/7=100/140, 3/4=105/140, 0.8=112/140.', '5/7, 3/4, 0.8. 0.8 is clear, and 5/7=0.714 is less than 3/4=0.75.']
  }
};

/* styles - the different ways pupils answer, kept short and kept honest, so the
   flavour changes but the ability band does not. */
const STYLES = ['plain', 'terse', 'chatty', 'rote', 'changes-mind', 'learner', 'rushing', 'draws'];
const ROTE = {
  easy: '1/2. Compare the denominators to find the larger fraction.',
  medium: '4/5. Convert both fractions to a common denominator and compare the numerators.',
  hard: '5/7, 3/4, 0.8. Convert each value to a common form and order by magnitude.'
};
const DRAWS = {
  easy: '1/2. Draw it as a bar, the half bar is fatter.',
  medium: '4/5. Draw both as bars split up, the 4/5 bar has bigger bits.',
  hard: '5/7, 3/4, 0.8. Draw them as bars and line them up.'
};
const LEARNER = {
  easy: '1/2 is more big. Two piece more big than four piece.',
  medium: '4/5 is more big. Make same bottom twenty, fifteen and sixteen.',
  hard: '5/7, 3/4, 0.8. Make all number same kind, then see.'
};

/* teacher band for a pupil of this ability on this tier. Harder tier = stricter. */
const EXPECT = {
  excellent: { easy: 'green', medium: 'green', hard: 'green' },
  good: { easy: 'green', medium: 'green', hard: 'amber' },
  ok: { easy: 'green', medium: 'amber', hard: 'amber' },
  weak: { easy: 'amber', medium: 'red', hard: 'red' },
  poor: { easy: 'red', medium: 'red', hard: 'red' },
  none: { easy: 'red', medium: 'red', hard: 'red' }
};

/* pick the answer: base band, then a light style tweak that does not change it */
function answerFor(quality, style, tier, variant) {
  const pool = ANSWERS[tier][quality];
  let a = pool[variant % pool.length];
  if (quality === 'none') return a;                    // gave nothing, full stop
  if (quality === 'poor') return a;                    // guesses stay guesses
  if (style === 'rote' && (quality === 'ok' || quality === 'good' || quality === 'excellent')) a = ROTE[tier];
  else if (style === 'draws' && (quality === 'good' || quality === 'excellent')) a = DRAWS[tier];
  else if (style === 'learner' && quality !== 'weak') a = LEARNER[tier];
  else if (style === 'terse' || style === 'rushing') { a = a.split(', so ')[0].trim(); if (!/[.!?]$/.test(a)) a += '.'; }
  else if (style === 'chatty') a = 'I like maths when it is not fractions. ' + a;
  else if (style === 'changes-mind' && (quality === 'ok' || quality === 'good')) a = a + ' No wait, the other one.';
  return a;
}

/* the roster, ability spread across the room, not in name order */
const PUPILSET = NAMES.slice(0, PUPILS).map((name, j) => {
  const quality = QUALITIES[(j * 7) % QUALITIES.length];
  return { name, quality, style: STYLES[j % STYLES.length] };
});

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

  // ---- teacher sets up: account, class, roster, three checks
  const STAMP = Date.now();
  const signup = await post('/api/signup', { email: 'tier' + STAMP + '@test.com', password: 'hunter22' });
  const teacher = signup.cookie;
  ok('teacher signed up', signup.status === 200 && !!teacher, signup.status + ' ' + JSON.stringify(signup.body));

  const cls = await post('/api/class', { name: 'Tier Class ' + STAMP }, teacher);
  const classId = cls.body && cls.body.class && cls.body.class.id;
  const code = cls.body && cls.body.class && cls.body.class.code;
  ok('class created with a join code', !!classId && /^[a-z0-9]{4,12}$/.test(String(code)), 'code=' + code);

  const roster = await post('/api/roster', { classId, names: NAMES.slice(0, PUPILS) }, teacher);
  ok('roster of ' + PUPILS + ' saved', roster.status === 200, roster.status + ' ' + JSON.stringify(roster.body));

  // marks per tier: the AI drafts them, the teacher approves, everyone is marked against them
  for (const t of TIERS) {
    const gen = await post('/api/generate', { topic: t.topic, questions: t.questions }, teacher);
    t.marks = (gen.body && gen.body.marks) || [];
    ok(t.tier + ': mark points drafted', t.marks.length === t.questions.length && t.marks.every(a => a && a.length >= 2),
      JSON.stringify(t.marks).slice(0, 160));
    if (!t.marks.length || t.marks.some(a => !a || !a.length)) {
      log('  no marks for ' + t.tier + ' (' + gen.status + '): ' + JSON.stringify(gen.body).slice(0, 300));
      stop(); process.exit(1);
    }
    const chk = await post('/api/session', { classId, topic: t.topic, questions: t.questions, marks: t.marks }, teacher);
    t.checkId = chk.body && chk.body.check && chk.body.check.id;
    ok(t.tier + ': check created', !!t.checkId);
  }

  // ---- 30 pupils through easy, then medium, then hard
  log('\ndriving ' + PUPILS + ' pupils through easy -> medium -> hard...');
  const T0 = Date.now();
  const results = await pool(PUPILSET, CONCURRENCY, async (pupil, pi) => {
    const perTier = {};
    for (let ti = 0; ti < TIERS.length; ti++) {
      const t = TIERS[ti];
      const ans = answerFor(pupil.quality, pupil.style, t.tier, pi + ti);
      const history = [{ role: 'user', content: ans }];
      const r = await post('/api/chat', { code, topic: t.topic, questions: t.questions, history, digs: 0, covered: 0 });
      let reply = '';
      if (r.status === 200) { reply = String((r.body && r.body.reply) || '').trim(); history.push({ role: 'assistant', content: reply }); }
      const transcript = history.map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content).join('\n');
      const v = await post('/api/verdict', { topic: t.topic, transcript, marks: t.marks });
      const verdict = (v.body && v.body.verdict) || null;
      if (verdict) await post('/api/result', { code, name: pupil.name, transcript, verdict });
      perTier[t.tier] = {
        answer: ans, chat: r.status === 200, gotVerdict: !!verdict,
        level: verdict && verdict.level, hit: (verdict && verdict.pointsHit) || 0,
        tot: (verdict && verdict.pointsTotal) || 0, note: verdict && verdict.gets
      };
    }
    return { name: pupil.name, quality: pupil.quality, style: pupil.style, perTier };
  });
  const secs = (Date.now() - T0) / 1000;

  // ---- what came back
  log('\n--- what came back ---');
  const allTiers = results.flatMap(r => TIERS.map(t => r.perTier[t.tier]));
  ok('every pupil got a reply on every tier', allTiers.every(x => x.chat),
    results.filter(r => TIERS.some(t => !r.perTier[t.tier].chat)).map(r => r.name).join(', '));
  ok('every pupil got a verdict on every tier', allTiers.every(x => x.gotVerdict),
    results.filter(r => TIERS.some(t => !r.perTier[t.tier].gotVerdict)).map(r => r.name).join(', '));
  log('  wall clock: ' + secs.toFixed(1) + 's  (' + (PUPILS * TIERS.length / secs).toFixed(1) + ' pupils/sec)');

  // ---- does the grade track the pupil and the difficulty
  log('\n--- did the grade track the pupil (teacher band vs AI) ---');
  const order = ['green', 'amber', 'red'];
  let agree = 0, total = 0, twoOut = 0, falseGreen = 0, falseRed = 0;
  const perTierTally = { easy: {}, medium: {}, hard: {} };
  for (const r of results) {
    const cells = [];
    for (const t of TIERS) {
      const x = r.perTier[t.tier];
      const want = EXPECT[r.quality][t.tier];
      const got = x.level || 'none';
      total++; if (got === want) agree++;
      if (Math.abs(order.indexOf(got) - order.indexOf(want)) >= 2) twoOut++;
      if (want === 'red' && got === 'green') falseGreen++;
      if (want === 'green' && got === 'red') falseRed++;
      perTierTally[t.tier][want + '->' + got] = (perTierTally[t.tier][want + '->' + got] || 0) + 1;
      cells.push(t.tier.slice(0, 3).toUpperCase() + ':' + got.padEnd(5) + '(' + want[0] + ')');
    }
    log('  ' + r.name.padEnd(8) + ' ' + r.quality.padEnd(9) + ' ' + r.style.padEnd(13) + cells.join('  '));
  }
  log('\n  agreement with the teacher band: ' + agree + '/' + total + '  (' + (agree / total * 100).toFixed(0) + '%)');

  log('\n--- per tier (teacher -> AI) ---');
  for (const t of TIERS) {
    log('  ' + t.tier.padEnd(7) + JSON.stringify(perTierTally[t.tier]));
  }

  log('\n--- the checks that matter ---');
  ok('no pupil is two bands out', twoOut === 0, twoOut + ' two-band misses');
  ok('nobody who clearly understood was failed', falseRed === 0, falseRed + ' green pupils graded red');
  ok('nobody who gave nothing was passed', falseGreen === 0, falseGreen + ' red pupils graded green');
  ok('the grades spread across all three colours', new Set(allTiers.map(x => x.level)).size === 3,
    JSON.stringify([...new Set(allTiers.map(x => x.level))]));

  // harder work should not get easier marks - the average should fall tier by tier
  const mean = (tier) => {
    const v = results.map(r => ({ green: 2, amber: 1, red: 0, none: 0 }[r.perTier[tier].level] || 0));
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  log('\n--- does difficulty bite? (2=green, 1=amber, 0=red) ---');
  log('  easy ' + mean('easy').toFixed(2) + '   medium ' + mean('medium').toFixed(2) + '   hard ' + mean('hard').toFixed(2));
  ok('the same class scores lower as the work gets harder', mean('easy') >= mean('medium') && mean('medium') >= mean('hard'),
    'easy ' + mean('easy').toFixed(2) + ' medium ' + mean('medium').toFixed(2) + ' hard ' + mean('hard').toFixed(2));

  // ---- the worst misses, with the answer that caused them
  const misses = [];
  for (const r of results) for (const t of TIERS) {
    const x = r.perTier[t.tier], want = EXPECT[r.quality][t.tier];
    if ((x.level || 'none') !== want) misses.push({ r, t, x, want });
  }
  if (misses.length) {
    log('\n--- misses (teacher -> AI), with the answer ---');
    for (const m of misses.slice(0, 12)) {
      log('  ' + m.r.name.padEnd(8) + m.t.tier.padEnd(7) + m.want + ' -> ' + (m.x.level || 'none') +
        '   "' + m.x.answer.slice(0, 62) + '"');
      log('           note: "' + String(m.x.note || '').slice(0, 90) + '"');
    }
    if (misses.length > 12) log('  ... and ' + (misses.length - 12) + ' more');
  }

  log('\n' + '='.repeat(66));
  log('  ' + PUPILS + ' pupils x 3 tiers (easy/medium/hard), real AI on every turn');
  log('  wall clock          ' + secs.toFixed(1) + 's');
  log('  graded right        ' + agree + '/' + total + '  (' + (agree / total * 100).toFixed(0) + '%)');
  log('  two bands out       ' + twoOut);
  log('  problems            ' + (PROBLEMS.length ? PROBLEMS.join(' | ') : 'none'));
  log('='.repeat(66));

  stop();
  process.exit(PROBLEMS.length ? 1 : 0);
})();
