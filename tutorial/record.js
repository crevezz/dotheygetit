/* ============================================================================
   Understanding Check - autonomous tutorial recorder
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
      '  box-shadow:0 12px 34px rgba(0,0,0,.4);}#__cap.on{opacity:1;}'
    ].join('\n');
    document.head.appendChild(s);

    const cur = document.createElement('div'); cur.id = '__cur'; document.body.appendChild(cur);
    const cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap);

    window.addEventListener('mousemove', e => {
      cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px';
    }, true);
    window.addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = '__rip';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 620);
    }, true);

    window.__cap = t => { cap.textContent = t; cap.classList.toggle('on', !!t); };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
}

/* --------------------------------------------------------------- page helpers */
async function caption(page, text, hold = 1700) {
  await page.evaluate(t => window.__cap(t), text);
  await page.waitForTimeout(hold);
}
async function clearCaption(page) { await page.evaluate(() => window.__cap('')); }

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
  console.log('Understanding Check - tutorial recorder');
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

    /* ================= SCENE 1: teacher lands ================= */
    await page.goto(BASE, { waitUntil: 'load' });
    await sleep(600);

    /* --- self-check: prove the film overlay is really live --- */
    await page.mouse.move(320, 260, { steps: 6 });
    await sleep(250);
    const ov = await page.evaluate(() => {
      const c = document.getElementById('__cur'), p = document.getElementById('__cap');
      return { hasCursor: !!c, hasCaption: !!p, curLeft: c && c.style.left, curTop: c && c.style.top };
    });
    console.log('  Overlay check    :', JSON.stringify(ov));
    const capOk = await page.evaluate(() => {
      window.__cap('overlay test');
      const p = document.getElementById('__cap');
      return p.classList.contains('on') && p.textContent === 'overlay test';
    });
    console.log('  Caption check    :', capOk);
    await clearCaption(page);
    await page.mouse.move(640, 400, { steps: 8 });
    await sleep(400);

    await caption(page, 'Understanding Check — see who really learned it', 2200);
    await caption(page, "1. Teacher: make a check in under a minute", 1600);

    /* ================= SCENE 2: sign up ================= */
    await typeIn(page, '#authEmail', 'ms.reed@oakfield.school', 34);
    await sleep(300);
    await typeIn(page, '#authPass', 'teach123', 55);
    await sleep(500);
    await glideClick(page, '#btnSignup');
    await page.locator('#dash').waitFor({ state: 'visible' });
    await sleep(700);

    /* ================= SCENE 3: add a class ================= */
    await caption(page, '2. Add a class — it gets a code that lasts all year', 1700);
    await typeIn(page, '#newClassName', 'Year 8 Maths', 44);
    await sleep(400);
    await glideClick(page, '#btnAddClass');
    await page.locator('.classrow').first().waitFor({ state: 'visible' });
    await sleep(600);

    /* ================= SCENE 4: open class, see code ================= */
    await glideClick(page, '.classrow');
    await page.locator('#classPanel').waitFor({ state: 'visible' });
    await sleep(500);
    const code = (await page.locator('#classCode').textContent() || '').trim();
    console.log('  Class code:', code);
    await glideTo(page, '#classCode');
    await caption(page, 'Students join with this code: ' + code, 2000);

    /* ================= SCENE 5: generate questions ================= */
    await caption(page, '3. Type the topic — the AI writes the questions', 1600);
    await typeIn(page, '#topic', TOPIC, 46);
    await sleep(400);
    await glideClick(page, '#btnGenerate');
    await page.locator('#qwrap').waitFor({ state: 'visible', timeout: 30000 });
    await sleep(900);
    /* the camera follows the questions down the page (they land below the fold) */
    await focus(page, '#qwrap', { block: 'center', hold: 800 });
    await check(page, 'questions generated', '#qwrap');
    await caption(page, 'AI writes the questions — nothing to prepare', 2000);
    const qn = await page.locator('#qlist .qrow').count();
    for (let i = 0; i < qn; i++) {
      await glideTo(page, `#qlist .qrow >> nth=${i}`, { block: 'nearest', hold: 120 });
      await page.waitForTimeout(700);
    }
    await focus(page, '#qwrap', { block: 'center', hold: 300 });
    await caption(page, 'Read them, edit them, delete any you do not want', 1800);

    /* ================= SCENE 6: create the check ================= */
    await glideClick(page, '#btnCreateCheck');
    await page.locator('#checkList .checkrow').first().waitFor({ state: 'visible' });
    await focus(page, '#checkList .checkrow', { block: 'center', hold: 600 });
    await caption(page, '4. Create the check — it is live for that class', 1700);

    /* ================= SCENE 7: student joins ================= */
    await glideClick(page, '#tab-student');
    await focus(page, '#joinCard', { block: 'start', hold: 500 });
    await caption(page, '5. Student: open the link and type the code', 1600);
    await typeIn(page, '#joinCode', code, 70);
    await sleep(300);
    await typeIn(page, '#studentName', 'Maya', 60);
    await sleep(400);
    await glideClick(page, '#btnJoin');
    await page.locator('#checkCard').waitFor({ state: 'visible' });
    await page.locator('#answer').waitFor({ state: 'visible' });
    await focus(page, '#checkTopic', { block: 'start', hold: 400 });
    await sleep(1000);

    /* ================= SCENE 8: the interview ================= */
    await caption(page, '6. The examiner digs until it knows what they really understand', 2100);
    for (let i = 0; i < ANSWERS.length; i++) {
      await typeIn(page, '#answer', ANSWERS[i], 16, 'end');
      await sleep(350);
      await glideClick(page, '#btnSend', { block: 'end', hold: 200 });
      await sleep(1500);
      /* keep the newest question and the answer box in shot as the chat grows */
      await focus(page, '#answer', { block: 'end', hold: 250 });
      await check(page, 'answer box in shot', '#answer');
      await page.waitForTimeout(700);
    }
    await page.locator('#answer:disabled').waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
    await sleep(1400);

    /* silent: two more students, so the results screen shows a real spread */
    try {
      await post('/api/result', { code, name: 'Tom',   transcript: 'Student: A fraction is a bit of something.\nExaminer: Which is bigger, 3/4 or 2/3?\nStudent: I think 3/4 because 4 is bigger.', verdict: V_TOM });
      await post('/api/result', { code, name: 'Priya', transcript: 'Student: I do not really know.\nExaminer: What does the bottom number mean?\nStudent: Not sure.', verdict: V_PRIYA });
    } catch (e) { console.log('  (seed skipped:', e.message + ')'); }

    /* ================= SCENE 9: the reveal ================= */
    await glideClick(page, '#tab-teacher');
    await sleep(700);
    await caption(page, '7. Back in Teacher: who gets it, who is faking it', 1800);
    await glideClick(page, '#checkList .checkrow');
    await page.locator('#results .sresult').first().waitFor({ state: 'visible', timeout: 20000 });
    await sleep(1000);
    await focus(page, '#results .stat-row', { block: 'center', hold: 1000 });
    await check(page, 'results summary', '#results .stat-row');
    await glideTo(page, '#results .stat.green', { block: 'nearest', hold: 200 });
    await caption(page, '🟢 gets it · 🟡 shaky · 🔴 struggling — at a glance', 2400);
    /* walk down the three pupil cards so none are missed */
    const sn = await page.locator('#results .sresult').count();
    for (let i = 0; i < sn; i++) {
      await glideTo(page, `#results .sresult >> nth=${i}`, { block: 'center', hold: 250 });
      await page.waitForTimeout(1200);
    }
    await caption(page, '…with what they actually get and what to do next', 2200);

    await caption(page, 'No marking. No installs. Fractions of a penny per check.', 2300);
    await clearCaption(page);
    await sleep(700);

    /* ================= save ================= */
    const raw = video ? await video.path() : null;
    await context.close();
    await browser.close();

    if (raw && fs.existsSync(raw)) {
      const final = path.join(OUT, 'understanding-check-tutorial.webm');
      if (fs.existsSync(final)) fs.unlinkSync(final);
      fs.renameSync(raw, final);
      const mb = (fs.statSync(final).size / 1048576).toFixed(1);
      console.log('\n  DONE -> ' + final + '  (' + mb + ' MB)');
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
