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
    /* the app rule: green = something on every question AND one fully shown; red = nothing on any question; amber = in between. A full mark sheet is never held below green. */
    const shownQ = ev.filter(e => e.got > 0).length;
    const fullQ = ev.filter(e => e.got >= e.total).length;
    const top = !shownQ ? 'red' : (shownQ === ev.length && fullQ > 0) ? 'green' : 'amber';
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
  /* The app boots itself: /api/me, then the class list. Drawing before that lands makes
     for a racy test - and the first version of this test read a page that was about to
     hide the dashboard out from under it, which is how it "passed" with an invisible
     card. Wait for the app to be ready, then say whether the teacher is really logged in. */
  await page.waitForFunction(() => {
    const d = document.querySelector('#dash');
    return !!d && !d.classList.contains('hidden');
  }, { timeout: 10000 }).catch(() => {});
  const loggedIn = await page.evaluate(() => {
    const d = document.querySelector('#dash');
    return { visible: !!d && !d.classList.contains('hidden'), whoami: (document.querySelector('#whoami') || {}).textContent || '' };
  });
  ok('the browser is logged in as the teacher that owns the class', loggedIn.visible, JSON.stringify(loggedIn) + ' cookie=' + teacher.slice(0, 24));

  /* Open the class the way a teacher does, then open the check. The first version of this
     test drew straight into #results, which lives inside #classPanel - and that panel is
     hidden until you click into a class, so the whole card was measured while invisible.
     It "passed" because innerText falls back to textContent on a non-rendered element,
     which is exactly the sort of green that means nothing. */
  const opened = await page.evaluate(async (args) => {
    const rows = Array.from(document.querySelectorAll('#classList .classrow'));
    const row = rows.find(r => r.dataset.id === args.classId);
    if (!row) return { ok: false, why: 'class row not in the list: ' + rows.length + ' rows' };
    row.click();
    await new Promise(r => setTimeout(r, 600));
    const panel = document.querySelector('#classPanel');
    if (panel.classList.contains('hidden')) return { ok: false, why: 'clicking the class did not open the panel' };
    await openCheck(args.checkId);
    await new Promise(r => setTimeout(r, 400));
    return { ok: true, rows: document.querySelectorAll('#results .sresult').length };
  }, { classId, checkId });
  ok('the results card opens via the teacher\'s own clicks (class, then check)', opened.ok && opened.rows === 3, JSON.stringify(opened));

  /* Everything below reads the card as a teacher would see it. The layout is measured
     rather than assumed, because a hidden card still answers every content question. */
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
  ok('the card says how much of the standard was shown', /what they had to show/i.test(card.text) && /\d+ of \d+/.test(card.text),
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

  /* Take a picture as well as reading the DOM. The assertions above would all pass if the
     evidence were rendered in 6px white text behind the footer. This is the part of the
     test that has to be looked at by a person. */
  /* I cannot look at the picture, so measure the layout instead of trusting it: text that
     fits, nothing clipped, nothing smaller than a teacher can read. The preview file is
     there for a person to look at, and this is what runs every time. */
  const layout = await page.evaluate(() => {
    const out = { overflow: [], tiny: [], clipped: [], height: 0, notes: [] };
    const block = document.querySelector('#results .evwrap');
    if (block) {
      const r = block.getBoundingClientRect();
      out.height = Math.round(r.height);
      out.notes.push('evidence block ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (!r.height) {
        const chain = [];
        let el = block;
        while (el && el !== document.body) {
          chain.push((el.tagName || '') + '#' + (el.id || '') + '.' + (el.className || '') + '=' + getComputedStyle(el).display);
          el = el.parentElement;
        }
        out.notes.push('ancestors: ' + chain.join(' < '));
        const paren = block.closest('.sresult');
        const pr = paren && paren.getBoundingClientRect();
        out.notes.push('first row ' + (pr ? Math.round(pr.width) + 'x' + Math.round(pr.height) : 'none') +
          ' rows=' + document.querySelectorAll('#results .evwrap').length +
          ' resultsVisible=' + (document.querySelector('#results').offsetParent !== null) +
          ' bodyH=' + document.body.scrollHeight);
      }
    }
    document.querySelectorAll('#results .evt, #results .evsaid, #results .lostit li').forEach(el => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11) out.tiny.push(el.className + ' ' + fs + 'px');
      const r = el.getBoundingClientRect();
      const parent = el.closest('.sresult, .lostit');
      if (parent && r.right > parent.getBoundingClientRect().right + 2) out.overflow.push(el.className + ' overflows by ' + Math.round(r.right - parent.getBoundingClientRect().right) + 'px');
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'hidden') out.clipped.push(el.className);
    });
    return out;
  });
  ok('the evidence block has real height (it is not collapsed)', layout.height > 40, JSON.stringify(layout.notes));
  ok('every line of evidence is text a teacher can read (>= 11px)', layout.tiny.length === 0, layout.tiny.join(', '));
  ok('nothing overflows or is clipped out of the card', layout.overflow.length === 0 && layout.clipped.length === 0,
    layout.overflow.concat(layout.clipped).join(' | '));

  await page.setViewportSize({ width: 1180, height: 1400 });
  const shot = path.join(__dirname, 'card-preview.png');
  try {
    await page.screenshot({ path: shot, fullPage: true });
    log('  card preview written to eval/card-preview.png - look at it, do not trust the DOM');
  } catch (e) { log('  could not photograph the card: ' + e.message); }

  await browser.close();
  stop();
  log('\nPASS ' + pass + ', FAIL ' + fail + '\n');
})();

