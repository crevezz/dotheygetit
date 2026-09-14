/* ============================================================================
   Get It? - autonomous tutorial recorder
   ----------------------------------------------------------------------------
   Runs the REAL app (real server, real UI) and films it with a visible cursor.

   Reuses the Playwright already installed in ../briefs (v1.61.1).
   Mocks ONLY the three OpenRouter endpoints so the take is deterministic,
   instant and free.  Set USE_REAL=1 to hit the live API instead.

   Output: tutorial/out/understanding-check-tutorial.webm
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); }
catch { ({ chromium } = require('playwright')); }

const APP  = path.resolve(__dirname, '..');
const OUT  = path.join(__dirname, 'out');
const RUN  = path.join(__dirname, '.run');       // throwaway copy of the app
const PORT = Number(process.env.PORT) || 4591;   // never clashes with a running instance
const BASE = `http://localhost:${PORT}`;
const REAL = process.env.USE_REAL === '1';

fs.mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- the lesson */
const TOPIC = 'comparing fractions';
const QUESTIONS = [
  'In your own words, what does the bottom number of a fraction actually tell you?',
  'How would you work out which is bigger, 3/4 or 2/3?',
  'What happens to a fraction when the bottom number gets bigger but the top stays the same?'
];
const ANSWERS = [
  "The bottom number is how many equal pieces the whole is cut into. So 3/4 means the whole is split into 4 equal pieces.",
  "I'd make the bottom numbers the same. 3/4 is 9/12 and 2/3 is 8/12, so 3/4 is bigger.",
  "Each piece gets smaller, so the fraction gets smaller. 1/8 is less than 1/4."
];
const CLOSING = 'Great — that is everything I needed. Thank you for thinking it through!';

const V_MAYA = { level:'green', gotRight:['Fractions as equal parts','Common denominators','Bigger denominator = smaller pieces'],
  gets:'Compares fractions by finding a common denominator', shaky:'Could be quicker at equivalent fractions', faked:false,
  notes:'Strong, confident explanation in her own words.', nextStep:'Move on to adding fractions with different denominators.' };
const V_TOM  = { level:'amber', gotRight:['Fractions are parts of a whole'], gets:'Knows a fraction is part of a whole',
  shaky:'Not yet sure how to compare two fractions', faked:false, notes:'Gets the idea but the method is shaky.',
  nextStep:'Practise finding a common denominator with two simple fractions.' };
const V_PRIYA= { level:'red', gotRight:[], gets:'', shaky:'Everything so far', faked:false,
  notes:'Struggled — little correct here. Worth a check-in.', nextStep:'Go back to what a fraction shows, with pictures.' };

const ROSTER = ['Aisha Noor','Ethan Clarke','Leo Marsh','Maya Khan','Priya Shah','Tom Bell'];

/* ------------------------------------------------------------- server helpers */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(p) {
  return new Promise((res, rej) => {
    const r = http.get(BASE + p, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); });
    r.on('error', rej);
    r.setTimeout(5000, () => r.destroy(new Error('timeout')));
  });
}
function post(p, obj) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(obj);
    const r = http.request(BASE + p, { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} },
      x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); });
    r.on('error', rej); r.write(data); r.end();
  });
}
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try { const r = await get('/api/health'); if (r.status === 200) return JSON.parse(r.body); } catch {}
    await sleep(250);
  }
  throw new Error('Server never came up on ' + BASE);
}

/* ------------------------------------------------------- in-page film overlay */
function OVERLAY() {
  const setup = () => {
    if (!document.body) return setTimeout(setup, 20);
    const s = document.createElement('style');
    s.textContent = [
      '#__cur{position:fixed;left:-100px;top:-100px;width:26px;height:26px;z-index:2147483647;pointer-events:none;',
      '  transform:translate(-2px,-2px);',
      '  background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'26\' height=\'26\' viewBox=\'0 0 26 26\'><path d=\'M5 2 L5 21 L10.2 16 L14.5 24 L17.6 22.3 L13.4 14.6 L20.5 14.6 Z\' fill=\'white\' stroke=\'black\' stroke-width=\'1.6\' stroke-linejoin=\'round\'/></svg>") no-repeat center/contain;}',
      '.__rip{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid rgba(37,99,235,.9);',
      '  transform:translate(-50%,-50%);animation:__r .55s ease-out forwards;}',
      '@keyframes __r{from{width:10px;height:10px;opacity:.95}to{width:72px;height:72px;opacity:0}}',
      '#__cap{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;',
      '  background:rgba(15,23,42,.93);color:#fff;font:600 17px/1.35 "Segoe UI",Roboto,sans-serif;',
      '  padding:12px 24px;border-radius:999px;max-width:76%;text-align:center;opacity:0;transition:opacity .3s;',
      '  box-shadow:0 12px 34px rgba(0,0,0,.4);}#__cap.on{opacity:1;}',
      /* chapter card: solid BLACK so ffmpeg blackdetect can find exact chapter cuts */
      '#__card{position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none;display:none;',
      '  align-items:center;justify-content:center;}#__card.on{display:flex;}',
      '#__card .in{text-align:center;color:#fff;font-family:"Segoe UI",Roboto,sans-serif;}',
      '#__card .no{font:700 15px/1 "Segoe UI",Roboto,sans-serif;letter-spacing:.28em;color:#60a5fa;margin-bottom:18px;}',
      '#__card .ti{font:700 46px/1.15 "Segoe UI",Roboto,sans-serif;letter-spacing:-.5px;}',
      '#__card .su{font:400 19px/1.4 "Segoe UI",Roboto,sans-serif;color:#94a3b8;margin-top:16px;}'
    ].join('\n');
    document.head.appendChild(s);

    const cur = document.createElement('div'); cur.id = '__cur'; document.body.appendChild(cur);
    const cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap);
    const card = document.createElement('div'); card.id = '__card'; document.body.appendChild(card);

    window.addEventListener('mousemove', e => {
      cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px';
    }, true);
    window.addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = '__rip';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 620);
    }, true);

    window.__cap = t => { cap.textContent = t; cap.classList.toggle('on', !!t); };
    window.__card = (no, ti, su) => {
      if (no === null || no === undefined) { card.classList.remove('on'); card.innerHTML = ''; return; }
      card.innerHTML = '<div class="in"><div class="no">' + no + '</div><div class="ti">' + ti + '</div>' +
                       (su ? '<div class="su">' + su + '</div>' : '') + '</div>';
      card.classList.add('on');
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
}

/* --------------------------------------------------------------- page helpers */
/* CAPTIONS=0 records with no on-screen captions. The hold time is still spent
   on the scene, so chapter lengths (and therefore the voiceover sync set up in
   build.js) are unchanged. */
const CAPTIONS = process.env.CAPTIONS !== '0';
async function caption(page, text, hold = 1700) {
  if (CAPTIONS) await page.evaluate(t => window.__cap(t), text);
  await page.waitForTimeout(hold);
}
async function clearCaption(page) { await page.evaluate(() => window.__cap('')); }

/* --- chapter cards ---------------------------------------------------------
   A solid-black title card held for CARD_MS at every chapter boundary.
   ffmpeg's blackdetect filter then finds the EXACT frames where chapters
   start and end, so the voiceover cannot drift out of sync.
   ------------------------------------------------------------------------- */
const CARD_MS = Number(process.env.CARD_MS) || 2200;
const TL = [];                       // wall-clock marks, a cross-check on blackdetect
let T0 = 0;                          // set the moment recording starts
function mark(name) { TL.push({ name, at: T0 ? Date.now() - T0 : 0 }); }

async function chapter(page, no, title, sub) {
  await clearCaption(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => {});
  await page.waitForTimeout(420);
  mark('card:' + no);
  await page.evaluate(([n, t, s]) => window.__card(n, t, s), [no, title, sub || '']);
  await page.waitForTimeout(CARD_MS);           // static black frames = detectable
  await page.evaluate(() => window.__card(null));
  await page.waitForTimeout(500);
}

/* Wait for a smooth scroll to actually stop before measuring anything. */
async function scrollSettle(page, timeout = 1400) {
  let last = -1, still = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y === last) { if (++still >= 3) return y; } else { still = 0; last = y; }
    await page.waitForTimeout(70);
  }
  return last;
}

/* Move the camera: smooth-scroll a target into view, then hold so it can be read.
   block: 'start' | 'center' | 'end' | 'nearest'   */
const TRACE = process.env.TRACE === '1';

/* Proof, without watching the video, that the thing we just scrolled to is
   actually inside the frame (fully = top & bottom inside the viewport). */
async function inView(page, sel) {
  return page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: window.innerHeight,
             fully: b.top >= 0 && b.bottom <= window.innerHeight };
  }, sel);
}
async function check(page, label, sel) {
  if (!TRACE) return;
  console.log(`    [view] ${label.padEnd(22)} ${JSON.stringify(await inView(page, sel))}`);
}
async function focus(page, sel, opts = {}) {
  const block = opts.block || 'center';
  const hold = opts.hold === undefined ? 450 : opts.hold;
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible' });
  await el.evaluate((e, b) => e.scrollIntoView({ block: b, inline: 'nearest', behavior: 'smooth' }), block);
  const y = await scrollSettle(page);
  if (TRACE) console.log(`    [cam] scrollY=${String(y).padStart(4)}  block=${block.padEnd(7)}  ${sel}`);
  if (hold) await page.waitForTimeout(hold);
}

async function glideClick(page, sel, opts = {}) {
  await focus(page, sel, { block: opts.block || 'center', hold: opts.hold === undefined ? 320 : opts.hold });
  const el = page.locator(sel).first();
  const b = await el.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 26 });
  await page.waitForTimeout(160);
  await el.click();
}
async function glideTo(page, sel, opts = {}) {
  await focus(page, sel, { block: opts.block || 'center', hold: opts.hold === undefined ? 250 : opts.hold });
  const el = page.locator(sel).first();
  const b = await el.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 26 });
}
async function typeIn(page, sel, text, delay = 40, block = 'center') {
  await focus(page, sel, { block, hold: 250 });
  const el = page.locator(sel).first();
  const b = await el.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 });
  await el.click();
  await el.pressSequentially(text, { delay });
}

/* ========================================================================== */
async function main() {
  console.log('Get It? - tutorial recorder');
  console.log('  Playwright dir :', PW_DIR);
  console.log('  Mode           :', REAL ? 'LIVE OpenRouter API' : 'mocked (deterministic)');

  /* 1. isolated throwaway copy - never touches the real app or its data */
  fs.rmSync(RUN, { recursive: true, force: true });
  fs.mkdirSync(RUN, { recursive: true });
  for (const f of ['server.js', 'config.json', 'key.txt', 'package.json']) {
    if (fs.existsSync(path.join(APP, f))) fs.copyFileSync(path.join(APP, f), path.join(RUN, f));
  }
  fs.cpSync(path.join(APP, 'public'), path.join(RUN, 'public'), { recursive: true });
  fs.writeFileSync(path.join(RUN, 'data.json'),
    JSON.stringify({ teachers: [], classes: [], sessions: [], tokens: {} }, null, 2));
  console.log('  Isolated run dir :', RUN);

  /* 2. boot the real server (from the copy) */
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: RUN, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stdout.on('data', d => process.stdout.write('  [server] ' + d));
  srv.stderr.on('data', d => process.stderr.write('  [server:err] ' + d));

  let browser, context;
  const kill = () => {
    try { spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
    setTimeout(() => { try { fs.rmSync(RUN, { recursive: true, force: true }); } catch {} }, 1500);
  };

  try {
    const health = await waitUp();
    console.log('  Server up. key loaded:', health.hasKey);

    /* 3. browser + video */
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
      deviceScaleFactor: 1
    });
    await context.addInitScript(OVERLAY);

    /* 4. mock the three LLM endpoints (unless USE_REAL=1) */
    let chatTurn = 0;
    if (!REAL) {
      await context.route('**/api/generate', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: QUESTIONS }) }));
      await context.route('**/api/chat', r => {
        chatTurn++;
        const out =
          chatTurn === 1 ? { reply: "Hi! Let's find out how well you understand this.\n\n" + QUESTIONS[0], done: false, covered: 1, digs: 0 } :
          chatTurn === 2 ? { reply: QUESTIONS[1], done: false, covered: 2, digs: 0 } :
          chatTurn === 3 ? { reply: QUESTIONS[2], done: false, covered: 3, digs: 0 } :
                           { reply: CLOSING, done: true, covered: 3, digs: 0 };
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
      });
      await context.route('**/api/verdict', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ verdict: V_MAYA }) }));
    }

    const page = await context.newPage();
    const video = page.video();
    T0 = Date.now();
    mark('start');

    /* ======================= recording starts here ======================= */
    await page.goto(BASE, { waitUntil: 'load' });
    await sleep(800);

    /* --- self-check: prove the film overlay is really live --- */
    await page.mouse.move(320, 260, { steps: 6 });
    await sleep(250);
    const ov = await page.evaluate(() => {
      const c = document.getElementById('__cur'), p = document.getElementById('__cap');
      return { hasCursor: !!c, hasCaption: !!p, curLeft: c && c.style.left, curTop: c && c.style.top };
    });
    console.log('  Overlay check    :', JSON.stringify(ov));
    if (CAPTIONS) {
      const capOk = await page.evaluate(() => {
        window.__cap('overlay test');
        const p = document.getElementById('__cap');
        return p.classList.contains('on') && p.textContent === 'overlay test';
      });
      console.log('  Caption check    :', capOk);
      await clearCaption(page);
    } else {
      console.log('  Captions         : off (CAPTIONS=0)');
    }
    await page.mouse.move(640, 400, { steps: 8 });
    await sleep(400);

    /* =========================== CH 1 — Create your account ================= */
    await chapter(page, 1, 'Create your account', 'Takes about a minute');
    await caption(page, 'Get It? — see who really learned it', 2600);
    await focus(page, '#signinCard', { block: 'center', hold: 3200 });
    await caption(page, 'Your classes live on your account, not on this computer', 3200);
    await glideTo(page, '#authEmail', { block: 'center', hold: 500 });
    await typeIn(page, '#authEmail', 'ms.reed@oakfield.school', 34);
    await sleep(1600);
    await caption(page, 'Any computer in the school, and it is all still there', 2800);
    await typeIn(page, '#authPass', 'teach123', 55);
    await sleep(1400);
    await glideClick(page, '#btnSignup');
    await page.locator('#dash').waitFor({ state: 'visible' });
    await sleep(1400);
    await caption(page, 'No installs. Nothing for IT to set up.', 2400);
    await focus(page, '#classList', { block: 'center', hold: 2600 });
    await caption(page, 'Right. Let us set up a class.', 2200);

    /* =========================== CH 2 — Set up your class ================== */
    await chapter(page, 2, 'Set up your class', 'One code, lasts all year');
    await caption(page, 'Give the class a name', 1800);
    await typeIn(page, '#newClassName', 'Year 8 Maths', 44);
    await sleep(900);
    await glideClick(page, '#btnAddClass');
    await page.locator('.classrow').first().waitFor({ state: 'visible' });
    await sleep(900);
    await glideClick(page, '.classrow');
    await page.locator('#classPanel').waitFor({ state: 'visible' });
    await sleep(900);

    const code = (await page.locator('#classCode').textContent() || '').trim();
    console.log('  Class code:', code);

    await focus(page, '#classCode', { block: 'center', hold: 1200 });
    await caption(page, 'Students join with this code: ' + code, 2600);
    await glideTo(page, '#btnCopyLink', { block: 'center', hold: 900 });
    await caption(page, 'It never changes — pin it up, use it all year', 2400);

    await focus(page, '#rosterView', { block: 'center', hold: 900 });
    await caption(page, 'Now paste your class list, straight from SIMS or Arbor', 2400);
    await glideClick(page, '#btnRosterEdit');
    await page.locator('#rosterEdit').waitFor({ state: 'visible' });
    await focus(page, '#rosterText', { block: 'center', hold: 700 });
    await typeIn(page, '#rosterText', ROSTER.join('\n'), 5, 'center');
    await sleep(1000);
    await glideClick(page, '#btnRosterSave');
    await page.locator('#rosterView .prow').first().waitFor({ state: 'visible', timeout: 20000 });
    await focus(page, '#rosterView', { block: 'center', hold: 1400 });
    await check(page, 'class list saved', '#rosterView');
    await caption(page, 'Pupils now pick their name from a list. No typos.', 2600);

    /* =========================== CH 3 — Write the questions ================ */
    await chapter(page, 3, 'Write the questions', 'You type the topic. That is it.');
    await caption(page, 'Type what you just taught', 1900);
    await typeIn(page, '#topic', TOPIC, 46);
    await sleep(1100);
    await glideClick(page, '#btnGenerate');
    await page.locator('#qwrap').waitFor({ state: 'visible', timeout: 30000 });
    await caption(page, 'The AI writes the questions for you', 2300);
    await sleep(700);
    await focus(page, '#qwrap', { block: 'center', hold: 1200 });
    await check(page, 'questions generated', '#qwrap');
    const qn = await page.locator('#qlist .qrow').count();
    for (let i = 0; i < qn; i++) {
      await glideTo(page, `#qlist .qrow >> nth=${i}`, { block: 'nearest', hold: 150 });
      await page.waitForTimeout(1150);
    }
    await focus(page, '#qwrap', { block: 'center', hold: 400 });
    await caption(page, 'Read them, rewrite them, delete any you do not want', 2300);
    await glideClick(page, '#btnCreateCheck');
    await page.locator('#checkList .checkcard').first().waitFor({ state: 'visible' });
    await focus(page, '#checkList .checkcard', { block: 'center', hold: 1200 });
    await caption(page, 'Make the check live. It is ready for that class.', 2300);

    /* silent: give the class some history, so the class list has a running record */
    try {
      for (const r of [
        { name: 'Maya Khan',  verdict: V_MAYA,  transcript: 'Student: The bottom number is how many pieces.\nExaminer: Which is bigger, 3/4 or 2/3?\nStudent: I make the bottoms the same. 9/12 is bigger than 8/12.' },
        { name: 'Tom Bell',   verdict: V_TOM,   transcript: 'Student: A fraction is a bit of something.\nExaminer: Which is bigger, 3/4 or 2/3?\nStudent: I think 3/4 because 4 is bigger.' },
        { name: 'Priya Shah', verdict: V_PRIYA, transcript: 'Student: I do not really know.\nExaminer: What does the bottom number mean?\nStudent: Not sure.' },
        { name: 'Aisha Noor', verdict: V_MAYA,  transcript: 'Student: It is parts of a whole. Equal parts.\nExaminer: Which is bigger, 3/4 or 2/3?\nStudent: Ninths and twelfths... 3/4 is nine twelfths, so 3/4.' }
      ]) await post('/api/result', Object.assign({ code }, r));
    } catch (e) { console.log('  (seed skipped:', e.message + ')'); }

    /* second check, so the class list shows a record over more than one lesson */
    await focus(page, '#topic', { block: 'center', hold: 500 });
    await page.locator('#topic').fill('');
    await typeIn(page, '#topic', 'adding fractions', 44);
    await sleep(800);
    await glideClick(page, '#btnGenerate');
    await page.locator('#btnCreateCheck').waitFor({ state: 'visible' });
    await sleep(1200);
    await glideClick(page, '#btnCreateCheck');
    await page.locator('#checkList .checkcard').nth(1).waitFor({ state: 'visible' });
    await focus(page, '#checkList', { block: 'center', hold: 1000 });
    await caption(page, 'Next lesson, same thing. Every check stacks up in one place.', 2400);

    /* =========================== CH 4 — How pupils join ==================== */
    await chapter(page, 4, 'How pupils join', 'Play this one on the whiteboard');
    await glideClick(page, '#tab-student');
    await focus(page, '#joinCard', { block: 'start', hold: 900 });
    await caption(page, 'Open the link. No accounts, no logins for pupils.', 2400);
    await typeIn(page, '#joinCode', code, 80);
    await sleep(700);
    await glideClick(page, '#btnJoin');
    await page.locator('#studentName').waitFor({ state: 'visible' });
    await sleep(900);
    await focus(page, '#nameArea', { block: 'center', hold: 1100 });
    await caption(page, 'Pick your name from the list. No spelling it out.', 2500);
    await page.locator('#studentName').selectOption({ label: 'Maya Khan' });
    await sleep(1300);
    await glideClick(page, '#btnJoin');
    await page.locator('#checkCard').waitFor({ state: 'visible' });
    await page.locator('#answer').waitFor({ state: 'visible' });
    await focus(page, '#checkTopic', { block: 'start', hold: 600 });
    await sleep(1400);
    await caption(page, 'Then it asks them to explain it, in their own words', 2500);
    for (let i = 0; i < ANSWERS.length; i++) {
      await typeIn(page, '#answer', ANSWERS[i], 16, 'end');
      await sleep(500);
      await glideClick(page, '#btnSend', { block: 'end', hold: 250 });
      await sleep(1700);
      if (i < ANSWERS.length - 1) {
        await focus(page, '#answer', { block: 'end', hold: 300 });
        await check(page, 'answer box in shot', '#answer');
        if (i === 0) await caption(page, 'It reads the answer, then digs deeper', 2200);
      } else {
        await page.waitForTimeout(1100);
        await focus(page, '.endline', { block: 'center', hold: 1000 }).catch(() => {});
        await check(page, 'all-done line', '.endline');
        await caption(page, 'All done. Straight to the teacher.', 2400);
      }
      await page.waitForTimeout(700);
    }
    await page.locator('#answer:disabled').waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
    await sleep(1600);

    /* silent: the rest of the class, so the results screen shows a real spread */
    try {
      for (const r of [
        { name: 'Tom Bell',   verdict: V_TOM,   transcript: 'Student: A fraction is a bit of something.\nExaminer: Which is bigger, 3/4 or 2/3?\nStudent: I think 3/4 because 4 is bigger.' },
        { name: 'Priya Shah', verdict: V_PRIYA, transcript: 'Student: I do not really know.\nExaminer: What does the bottom number mean?\nStudent: Not sure.' },
        { name: 'Aisha Noor', verdict: V_MAYA,  transcript: 'Student: It is parts of a whole. Equal parts.\nExaminer: Which is bigger, 3/4 or 2/3?\nStudent: Ninths and twelfths... 3/4 is nine twelfths, so 3/4.' }
      ]) await post('/api/result', Object.assign({ code }, r));
    } catch (e) { console.log('  (seed skipped:', e.message + ')'); }

    /* =========================== CH 5 — Read your results =================== */
    await chapter(page, 5, 'Read your results', 'Who got it, who did not');
    await glideClick(page, '#tab-teacher');
    await sleep(1100);
    await focus(page, '#checkList', { block: 'center', hold: 900 });
    await caption(page, 'Every check you have made, newest first', 2400);
    await glideClick(page, '#checkList .checkcard');
    await page.locator('#results .sresult').first().waitFor({ state: 'visible', timeout: 20000 });
    await sleep(1300);
    await focus(page, '#results .stat-row', { block: 'center', hold: 1600 });
    await check(page, 'results summary', '#results .stat-row');
    await glideTo(page, '#results .stat.green', { block: 'nearest', hold: 300 });
    await caption(page, '🟢 gets it · 🟡 shaky · 🔴 did not get it yet', 2900);
    await glideTo(page, '#results .sresult', { block: 'center', hold: 600 });
    await caption(page, 'And what each of them actually said', 2400);
    const sn = await page.locator('#results .sresult').count();
    for (let i = 0; i < sn; i++) {
      await glideTo(page, `#results .sresult >> nth=${i}`, { block: 'center', hold: 300 });
      await page.waitForTimeout(1500);
    }
    await caption(page, '…with what to do about it, pupil by pupil', 2600);

    /* =========================== CH 6 — Spot the pattern =================== */
    await chapter(page, 6, 'Spot the pattern', 'The record builds itself');
    await glideClick(page, '#btnCloseClass');
    await sleep(1300);
    await glideClick(page, '.classrow');
    await page.locator('#classPanel').waitFor({ state: 'visible' });
    await page.locator('#rosterView .prow').first().waitFor({ state: 'visible', timeout: 20000 });
    await sleep(1500);
    await focus(page, '#rosterView', { block: 'center', hold: 2400 });
    await check(page, 'running record', '#rosterView');
    await caption(page, 'Every pupil, every check — a dot per lesson', 3000);
    await glideTo(page, '#rosterView .prow', { block: 'nearest', hold: 400 });
    await caption(page, 'One red is a bad day. Two is a pattern. You can see it.', 3200);
    await glideTo(page, '#rosterView .prow >> nth=3', { block: 'nearest', hold: 400 });
    await page.waitForTimeout(2400);
    await focus(page, '#checkList', { block: 'center', hold: 2200 });
    await caption(page, 'Three seconds. Not three weeks, on the drive home.', 3200);
    await clearCaption(page);
    await sleep(1100);
    mark('end');

    /* ================= save ================= */
    const raw = video ? await video.path() : null;
    await context.close();
    await browser.close();

    if (raw && fs.existsSync(raw)) {
      const final = path.join(OUT, 'raw.webm');
      if (fs.existsSync(final)) fs.unlinkSync(final);
      fs.renameSync(raw, final);
      const mb = (fs.statSync(final).size / 1048576).toFixed(1);
      fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ cardMs: CARD_MS, marks: TL }, null, 2));
      console.log('\n  raw  -> ' + final + '  (' + mb + ' MB)');
      console.log('  marks-> ' + TL.map(m => m.name + '@' + (m.at / 1000).toFixed(1) + 's').join('  '));
    } else {
      console.log('\n  No video produced.');
    }
  } catch (e) {
    console.error('\n  FAILED:', e.stack || e.message);
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  } finally {
    kill();
  }
}

if (require.main === module) main();
module.exports = { OVERLAY, main };
