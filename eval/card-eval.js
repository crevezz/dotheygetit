/* ============================================================================
   Does the teacher's card actually tell the teacher anything?

   The whole complaint: a card that says "red" plus three sentences of AI prose is
   not enough. The mark points are the standard - so the card has to show them, one
   line each, hit or missed, with the pupil's own words underneath.

   This test uses the real server, the real marking and the real card code:
     1. a class of 3 pupils is marked for real (every level is a real AI call)
     2. the results card is rendered in a real browser from real stored data
     3. the DOM is read back - is the evidence there, in the right place, with the
        pupil's actual words on it?
     4. the override button is CLICKED, and the change is checked in the store

   A card that renders nothing would pass a unit test of the string. It cannot pass
   this one.

   Run:  node eval/card-eval.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const PORT = 4612;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (what, cond, detail) => {
  console.log((cond ? '  PASS ' : '  FAIL ') + what + (detail ? '   <- ' + detail : ''));
  cond ? pass++ : fail++;
};
const log = (s) => console.log(s);

/* The teacher's standard for this check. Written by hand on purpose: the test then
   knows exactly what each pupil should score, and a marking slip shows up as a wrong
   number rather than as a vague wobble. */
const TOPIC = 'Simple Maths';
const QUESTIONS = ['What is 2/7 + 3/7?', 'Why do you only add the top numbers?'];
const MARKS = [
  ['says the answer is 5/7', 'keeps the bottom number as 7'],
  ['explains the pieces are all the same size so you just count them']
];
const PUPILS = [
  { name: 'Ada', t: 'Examiner: What is 2/7 + 3/7?\nStudent: 5/7 because the bottom stays 7\nExaminer: Why do you only add the top numbers?\nStudent: the bits are all the same size so you just count how many bits' },
  { name: 'Ruby', t: 'Examiner: What is 2/7 + 3/7?\nStudent: 5/7\nExaminer: Why do you only add the top numbers?\nStudent: i dont know' },
  { name: 'Sam', t: 'Examiner: What is 2/7 + 3/7?\nStudent: 5th\nExaminer: Why do you only add the top numbers?\nStudent: dunno' }
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
async function get(p, cookie) {
  const r = await fetch(BASE + p, { headers: cookie ? { Cookie: cookie } : {} });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

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

  const STAMP = Date.now();
  const signup = await post('/api/signup', { email: 'card' + STAMP + '@test.com', password: 'hunter22' });
  const teacher = signup.cookie;
  const cls = await post('/api/class', { name: 'Card ' + STAMP }, teacher);
  const classId = cls.body.class.id, code = cls.body.class.code;
  const made = await post('/api/session', { classId, topic: TOPIC, questions: QUESTIONS, marks: MARKS }, teacher);
  const checkId = made.body.check.id;
  ok('teacher, class and check set up', !!teacher && !!classId && !!checkId, 'code=' + code);

  /* ---- mark three pupils for real */
  const VERDICTS = {};
  for (const p of PUPILS) {
    const v = await post('/api/verdict', { topic: TOPIC, transcript: p.t, questions: QUESTIONS, marks: MARKS });
    VERDICTS[p.name] = v.body && v.body.verdict;
    await post('/api/result', { code, name: p.name, transcript: p.t, verdict: v.body && v.body.verdict });
    const ev = VERDICTS[p.name] && VERDICTS[p.name].evidence;
    ok('  ' + p.name + ' marked, with evidence attached', Array.isArray(ev) && ev.length === 2,
      'level=' + (VERDICTS[p.name] && VERDICTS[p.name].level) + ' evidence=' + JSON.stringify(ev && ev.length));
  }

  /* the quotes have to be the pupil's own words, or the evidence is worthless. This is
     the check that stops a model paraphrasing a child and calling it proof. */
  let quotesChecked = 0, quotesGood = 0;
  PUPILS.forEach(p => {
    ((VERDICTS[p.name] || {}).evidence || []).forEach(e => e.points.forEach(pt => {
      if (!pt.hit) return;
      quotesChecked++;
      if (pt.said && norm(p.t).indexOf(norm(pt.said).replace(/\.\.\.$/, '')) >= 0) quotesGood++;
    }));
  });
  ok('every quoted answer is somewhere in what the pupil actually typed', quotesChecked > 0 && quotesGood === quotesChecked,
    quotesGood + '/' + quotesChecked + ' quotes traceable');

  /* the level has to match its own evidence - a red with points hit, or a green with
     nothing hit, would be the card lying to a teacher */
  let consistent = 0, totals = 0;
  PUPILS.forEach(p => {
    const v = VERDICTS[p.name] || {};
    const ev = v.evidence || [];
    if (!ev.length) return;
    totals++;
    const got = ev.reduce((n, e) => n + e.got, 0), of = ev.reduce((n, e) => n + e.total, 0);
    /* green needs everything (or all but one of three), red needs nothing, amber in between */
    const want = ev.map(e => (e.got === e.total || (e.total >= 3 && e.got >= e.total - 1)) ? 'green' : e.got >= 1 ? 'amber' : 'red');
    const tally = {}; want.forEach(l => { tally[l] = (tally[l] || 0) + 1; });
    const top = ['green', 'amber', 'red'].sort((a, b) => (tally[b] || 0) - (tally[a] || 0) || ['green', 'amber', 'red'].indexOf(a) - ['green', 'amber', 'red'].indexOf(b))[0];
    if (top === v.level) consistent++;
    log('    ' + p.name + ': ' + got + ' of ' + of + ' shown -> ' + v.level + (top === v.level ? '' : '  (evidence says ' + top + ')'));
  });
  ok('the level on the card matches the points behind it', consistent === totals, consistent + '/' + totals);

  /* at least one point missed by 2+ pupils, or the class-level block has nothing to say */
  const missed = {};
  PUPILS.forEach(p => ((VERDICTS[p.name] || {}).evidence || []).forEach(e => e.points.forEach(pt => {
    if (!pt.hit) missed[pt.t] = (missed[pt.t] || 0) + 1;
  })));
  const worst = Object.keys(missed).filter(k => missed[k] >= 2);
  ok('a point most of the class missed is available to re-teach from', worst.length > 0,
    JSON.stringify(missed));

  /* ---- now the real card, in a real browser, from the real store */
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: teacher.split('=')[0], value: teacher.split('=').slice(1).join('='), domain: 'localhost', path: '/' }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const drawn = await page.evaluate(async (id) => {
    const r = await fetch('/api/session?id=' + encodeURIComponent(id));
    const j = await r.json();
    if (!j || !j.check) return { ok: false, why: JSON.stringify(j).slice(0, 120) };
    drawResults(j.check, j.check.students || []);
    return { ok: true, students: (j.check.students || []).length };
  }, checkId);
  ok('the card drew from the real stored session', drawn.ok && drawn.students === 3, JSON.stringify(drawn));

  const card = await page.evaluate(() => {
    const box = document.querySelector('#results');
    return {
      text: box ? box.innerText : '',
      rows: document.querySelectorAll('#results .sresult').length,
      evblocks: document.querySelectorAll('#results .evwrap').length,
      hitlines: document.querySelectorAll('#results .evlist li.hit').length,
      misslines: document.querySelectorAll('#results .evlist li.miss').length,
      quotes: document.querySelectorAll('#results .evsaid').length,
      reTeach: !!document.querySelector('#results .lostit'),
      buttons: document.querySelectorAll('#results .ovbtn').length
    };
  });

  ok('every pupil row carries an evidence block', card.evblocks === 3, card.evblocks + ' of 3 rows');
  ok('the points are shown hit or missed, not just counted', card.hitlines > 0 && card.misslines > 0,
    card.hitlines + ' hit, ' + card.misslines + ' missed');
  ok('the pupil\'s own words appear beside the points they earned', card.quotes >= 1, card.quotes + ' quotes on the card');
  ok('the card says how much of the standard was shown', /What they had to show/.test(card.text) && /\d+ of \d+/.test(card.text),
    (card.text.match(/\d+ of \d+/) || ['none'])[0]);
  ok('the class-level re-teach block renders', card.reTeach, 'lostit present: ' + card.reTeach);
  ok('the teacher can still overrule every pupil', card.buttons === 9, card.buttons + ' buttons for 3 pupils');

  const pointShown = card.text.indexOf('keeps the bottom number as 7') >= 0;
  ok('a mark point is on the card in the teacher\'s own words', pointShown, card.text.slice(0, 160).replace(/\n/g, ' | '));

  /* ---- click the override, then check the store rather than the button */
  const before = await get('/api/session?id=' + checkId, teacher);
  const rubyBefore = (before.body.check.students || []).find(s => s.name === 'Ruby') || {};
  const from = ((rubyBefore.verdict && rubyBefore.verdict.level) || 'amber');
  const to = from === 'green' ? 'red' : 'green';
  const clicked = await page.evaluate(async (args) => {
    const rows = Array.from(document.querySelectorAll('#results .sresult'));
    const row = rows.find(r => r.innerText.indexOf(args.name) >= 0);
    if (!row) return { ok: false, why: 'no row for ' + args.name };
    const btn = row.querySelector('.ovbtn[data-lv="' + args.to + '"]');
    if (!btn) return { ok: false, why: 'no button for ' + args.to };
    btn.click();
    await new Promise(r => setTimeout(r, 1500));
    const tag = row.querySelector('.tag');
    return { ok: true, tag: tag ? tag.innerText : '', note: row.querySelector('.ovnote') ? row.querySelector('.ovnote').innerText : '' };
  }, { name: 'Ruby', to });
  ok('clicking "you decide" changes the mark on the card', clicked.ok && clicked.tag.toLowerCase().indexOf(to) >= 0,
    JSON.stringify(clicked));

  const after = await get('/api/session?id=' + checkId, teacher);
  const rubyAfter = (after.body.check.students || []).find(s => s.name === 'Ruby') || {};
  ok('the teacher\'s mark is stored, and the marking\'s own answer is kept beside it',
    rubyAfter.teacherLevel === to && rubyAfter.aiLevel === from,
    'teacherLevel=' + rubyAfter.teacherLevel + ' aiLevel=' + rubyAfter.aiLevel);

  /* agreeing is not a correction - it must not be logged as one, or the training data
     fills up with examples of the marking being right */
  await page.evaluate(async () => {
    const btn = document.querySelector('#results .sresult .ovbtn[data-lv]:not([data-lv=""]) ');
    const rows = Array.from(document.querySelectorAll('#results .sresult'));
    const row = rows.find(r => r.innerText.indexOf('Ada') >= 0);
    const ai = row.dataset.ailevel;
    const same = row.querySelector('.ovbtn[data-lv="' + ai + '"]');
    if (same) { same.click(); await new Promise(r => setTimeout(r, 1200)); }
  });
  const agree = await get('/api/session?id=' + checkId, teacher);
  const ada = (agree.body.check.students || []).find(s => s.name === 'Ada') || {};
  ok('agreeing with the marking is not stored as a correction', !ada.teacherLevel,
    'teacherLevel=' + ada.teacherLevel + ' (marking said ' + ada.aiLevel + ')');

  ok('no javascript errors on the page', errors.length === 0, errors.join(' | '));

  await browser.close();
  stop();
  log('\nPASS ' + pass + ', FAIL ' + fail + '\n');
})();

