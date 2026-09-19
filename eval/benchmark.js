/* ============================================================================
   BENCHMARK: 100 pupils x 3 tiers, one frozen rubric, one number to track.

   Why this exists. Every run before this one re-drafted the mark points, so no
   two runs were ever testing the same thing - the score bounced 66 / 61 / 62 and
   the bounce was the rubric, not the app. So this harness FREEZES the rubric to
   disk on the first run and reuses it forever after. Change the app, re-run, and
   the number moves for one reason only: the app changed.

   It also measures the thing a single score hides: REPEATABILITY. The same
   answer text is graded many times in one run (100 pupils share a few dozen
   answers), so we can see whether the grader gives the same answer the same
   colour every time. A grader that disagrees with itself cannot be trusted to
   disagree with a pupil.

   And it LEARNS: every miss is written to a frozen failure corpus, which is the
   real asset - a regression suite made of the answers the app actually gets
   wrong, not a score that drifts.

   Run:  node eval/benchmark.js             (100 pupils)
         node eval/benchmark.js 30          (quicker)
         node eval/benchmark.js 100 fresh   (re-draft the rubric)

   A/B:  set VERDICT_MODEL=google/gemini-2.5-flash  && node eval/benchmark.js 100
   The frozen rubric is shared, so two configs are compared on identical items.
   ========================================================================== */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 4607;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const N = Number(process.argv[2]) || 100;
const FRESH = String(process.argv[3] || '') === 'fresh';
const RUBRIC = path.join(__dirname, 'benchmark-rubric.json');
const LABEL = process.env.BENCH_LABEL || 'default';
const OUT = path.join(__dirname, 'bench-' + LABEL + '.json');
const CONCURRENCY = 6;

const TIERS = [
  { tier: 'easy', topic: 'Comparing fractions (easy)', questions: ['Which is bigger, 1/2 or 1/4? How do you know?'] },
  { tier: 'medium', topic: 'Comparing fractions (medium)', questions: ['Which is bigger, 3/4 or 4/5? Tell me how you know.'] },
  { tier: 'hard', topic: 'Comparing fractions (hard)', questions: ['Put these in order, smallest to biggest: 3/4, 5/7, 0.8. Explain how you know.'] }
];

const QUALITY_ORDER = ['none', 'poor', 'weak', 'ok', 'good', 'excellent'];
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
const EXPECT = {
  excellent: { easy: 'green', medium: 'green', hard: 'green' },
  good: { easy: 'green', medium: 'green', hard: 'amber' },
  ok: { easy: 'green', medium: 'amber', hard: 'amber' },
  weak: { easy: 'amber', medium: 'red', hard: 'red' },
  poor: { easy: 'red', medium: 'red', hard: 'red' },
  none: { easy: 'red', medium: 'red', hard: 'red' }
};

function answerFor(quality, style, tier, variant) {
  const pool = ANSWERS[tier][quality];
  let a = pool[variant % pool.length];
  if (quality === 'none' || quality === 'poor') return a;
  if (style === 'rote' && (quality === 'ok' || quality === 'good' || quality === 'excellent')) a = ROTE[tier];
  else if (style === 'draws' && (quality === 'good' || quality === 'excellent')) a = DRAWS[tier];
  else if (style === 'learner' && quality !== 'weak') a = LEARNER[tier];
  else if (style === 'terse' || style === 'rushing') { a = a.split(', so ')[0].trim(); if (!/[.!?]$/.test(a)) a += '.'; }
  else if (style === 'chatty') a = 'I like maths but not fractions. ' + a;
  else if (style === 'changes-mind' && (quality === 'ok' || quality === 'good')) a = a + ' No wait, the other one.';
  return a;
}

/* N pupils, ability spread evenly across the six bands, styles cycled. */
const PUPILSET = Array.from({ length: N }, (_, j) => ({
  name: 'P' + (j + 1),
  quality: QUALITY_ORDER[Math.min(5, Math.floor(j * 6 / N))],
  style: STYLES[j % STYLES.length],
  variant: Math.floor(j / STYLES.length)
}));

async function post(p, body, cookie) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: JSON.stringify(body)
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); }
  }));
  return out;
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { await fetch(BASE + '/api/health'); up = true; } catch {} }
  if (!up) { console.log('server did not start'); stop(); process.exit(1); }

  const STAMP = Date.now();
  const signup = await post('/api/signup', { email: 'bench' + STAMP + '@test.com', password: 'hunter22' });
  const teacher = signup.cookie;
  const cls = await post('/api/class', { name: 'Bench ' + STAMP }, teacher);
  const classId = cls.body && cls.body.class && cls.body.class.id;
  const code = cls.body && cls.body.class && cls.body.class.code;

  /* ---- the frozen rubric. Drafted once, then never re-drafted, so the score
     moves only when the app moves. */
  let rubric = null;
  if (!FRESH && fs.existsSync(RUBRIC)) { try { rubric = JSON.parse(fs.readFileSync(RUBRIC, 'utf8')); } catch {} }
  const drafted = !rubric;
  if (!rubric) {
    rubric = {};
    for (const t of TIERS) {
      const gen = await post('/api/generate', { topic: t.topic, questions: t.questions }, teacher);
      rubric[t.tier] = (gen.body && gen.body.marks) || [];
    }
    fs.writeFileSync(RUBRIC, JSON.stringify(rubric, null, 2));
  }
  console.log('rubric: ' + (drafted ? 'DRAFTED and frozen to benchmark-rubric.json' : 'FROZEN (reused)'));
  for (const t of TIERS) {
    t.marks = rubric[t.tier] || [];
    const chk = await post('/api/session', { classId, topic: t.topic, questions: t.questions, marks: t.marks }, teacher);
    t.checkId = chk.body && chk.body.check && chk.body.check.id;
    console.log('  ' + t.tier.padEnd(7) + JSON.stringify(t.marks));
  }

  console.log('\ndriving ' + N + ' pupils x 3 tiers...');
  const T0 = Date.now();
  const results = await pool(PUPILSET, CONCURRENCY, async (pupil, pi) => {
    const perTier = {};
    for (let ti = 0; ti < TIERS.length; ti++) {
      const t = TIERS[ti];
      const ans = answerFor(pupil.quality, pupil.style, t.tier, pi + ti);
      const history = [{ role: 'user', content: ans }];
      const r = await post('/api/chat', { code, topic: t.topic, questions: t.questions, history, digs: 0, covered: 0 });
      if (r.status === 200) history.push({ role: 'assistant', content: String((r.body && r.body.reply) || '').trim() });
      const transcript = history.map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content).join('\n');
      const v = await post('/api/verdict', { topic: t.topic, transcript, marks: t.marks });
      const verdict = (v.body && v.body.verdict) || null;
      perTier[t.tier] = {
        answer: ans, level: (verdict && verdict.level) || 'none',
        hit: (verdict && verdict.pointsHit) || 0, tot: (verdict && verdict.pointsTotal) || 0,
        reason: !!(verdict && verdict.reason), noReason: !!(verdict && verdict.noReason),
        note: (verdict && verdict.gets) || ''
      };
    }
    return { name: pupil.name, quality: pupil.quality, style: pupil.style, perTier };
  });
  const secs = (Date.now() - T0) / 1000;

  /* ---- score, and the two directional errors a single % hides */
  const order = ['green', 'amber', 'red'];
  let agree = 0, total = 0, twoOut = 0, falseGreen = 0, falseRed = 0;
  const perTierTally = { easy: {}, medium: {}, hard: {} };
  const misses = [];
  for (const r of results) for (const t of TIERS) {
    const x = r.perTier[t.tier], want = EXPECT[r.quality][t.tier], got = x.level;
    total++; if (got === want) agree++;
    if (Math.abs(order.indexOf(got) - order.indexOf(want)) >= 2) twoOut++;
    if (want === 'red' && got === 'green') falseGreen++;
    if (want === 'green' && got === 'red') falseRed++;
    perTierTally[t.tier][want + '->' + got] = (perTierTally[t.tier][want + '->' + got] || 0) + 1;
    if (got !== want) misses.push({ tier: t.tier, quality: r.quality, style: r.style, answer: x.answer, want, got, hit: x.hit, tot: x.tot, note: x.note });
  }

  /* ---- repeatability: the same answer text, graded more than once */
  const byText = new Map();
  for (const r of results) for (const t of TIERS) {
    const key = t.tier + '||' + r.perTier[t.tier].answer;
    if (!byText.has(key)) byText.set(key, []);
    byText.get(key).push(r.perTier[t.tier].level);
  }
  const repeats = [...byText.values()].filter(v => v.length > 1);
  const steady = repeats.filter(v => new Set(v).size === 1).length;

  const mean = (tier) => results.reduce((a, r) => a + ({ green: 2, amber: 1, red: 0 }[r.perTier[tier].level] || 0), 0) / results.length;

  console.log('\n================= BENCHMARK  [' + LABEL + '] =================');
  console.log('  pupils              ' + N + '  (' + total + ' gradings, ' + secs.toFixed(0) + 's)');
  console.log('  models              brain=' + (process.env.BRAIN_MODEL || 'config') + '  verdict=' + (process.env.VERDICT_MODEL || 'config') + '  critic=' + (process.env.CRITIC_MODEL || 'config'));
  console.log('  AGREEMENT           ' + agree + '/' + total + '  (' + (agree / total * 100).toFixed(1) + '%)');
  console.log('  too lenient         ' + falseGreen + '   (red pupil handed green)');
  console.log('  too harsh           ' + falseRed + '   (green pupil failed)');
  console.log('  two bands out       ' + twoOut);
  console.log('  repeatability       ' + steady + '/' + repeats.length + ' answers graded the same every time  (' + (repeats.length ? (steady / repeats.length * 100).toFixed(0) : '0') + '%)');
  console.log('  difficulty curve    easy ' + mean('easy').toFixed(2) + '  medium ' + mean('medium').toFixed(2) + '  hard ' + mean('hard').toFixed(2));
  console.log('  per tier            ' + TIERS.map(t => t.tier + ' ' + JSON.stringify(perTierTally[t.tier])).join('\n                      '));

  /* THE NEW SIGNAL. Green = right answer. "No reason" = right, but they never said why.
     If the flag works it must land on the guessers - the poor and weak bands - and NOT on
     the pupils who understand. If the knowers show up here too, the flag is noise. */
  const nr = [];
  for (const r of results) for (const t of TIERS) if (r.perTier[t.tier].noReason) nr.push(r.quality);
  const nrBy = {};
  nr.forEach(q => { nrBy[q] = (nrBy[q] || 0) + 1; });
  console.log('  right, no reason    ' + nr.length + ' of ' + total + '   by ability: ' + JSON.stringify(nrBy));

  /* ---- the failure corpus: the real asset. Answers the app gets wrong, frozen. */
  fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, n: N, agree, total, falseGreen, falseRed, twoOut, steady, repeats: repeats.length, noReason: nr.length, noReasonByQuality: nrBy, secs, perTierTally, misses }, null, 2));
  console.log('\n  worst misses (of ' + misses.length + '), full list in bench-' + LABEL + '.json:');
  for (const m of misses.slice(0, 15)) {
    console.log('    ' + m.tier.padEnd(7) + m.quality.padEnd(10) + m.want + '->' + m.got + '  [' + m.hit + '/' + m.tot + ']  "' + m.answer.slice(0, 54) + '"');
  }
  console.log('  results -> ' + path.basename(OUT));
  console.log('=========================================================');

  stop();
  process.exit(0);
})();
