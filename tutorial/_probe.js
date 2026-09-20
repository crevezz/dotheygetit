/* ============================================================================
   Throwaway probe: exercise ONLY the new scene steps from record.js against a
   live app, without filming. A failed take costs ten minutes; this costs one.
   Covers: the year group on the class row, the QR + print stylesheet, the pupil
   overlay (.plink -> .said), the export download, and the feedback box.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const APP = path.resolve(__dirname, '..');
const RUN = path.join(__dirname, '.run2');
const PORT = 4592;
const BASE = 'http://localhost:' + PORT;

const ROSTER = ['Aisha Noor', 'Ethan Clarke', 'Leo Marsh', 'Maya Khan', 'Priya Shah', 'Tom Bell'];
const V = { level: 'green', gotRight: ['a'], gets: 'Compares fractions', shaky: '', faked: false,
            notes: 'n', nextStep: 'Move on' };
const TR = 'Student: The bottom number is how many pieces.\nExaminer: Which is bigger?\nStudent: 3/4, because 9/12 is bigger than 8/12.';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => {
  const r = http.get(BASE + p, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); });
  r.on('error', rej);
});
const post = (p, obj) => new Promise((res, rej) => {
  const data = JSON.stringify(obj);
  const r = http.request(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); });
  r.on('error', rej); r.write(data); r.end();
});
async function waitUp() {
  for (let i = 0; i < 100; i++) { try { const r = await get('/api/health'); if (r.status === 200) return; } catch {} await sleep(250); }
  throw new Error('server never came up');
}

let fails = 0;
const ok = (name, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name.padEnd(46) + (extra === undefined ? '' : JSON.stringify(extra)));
};

(async () => {
  fs.rmSync(RUN, { recursive: true, force: true });
  fs.mkdirSync(RUN, { recursive: true });
  for (const f of ['server.js', 'config.json', 'key.txt', 'package.json']) {
    if (fs.existsSync(path.join(APP, f))) fs.copyFileSync(path.join(APP, f), path.join(RUN, f));
  }
  fs.cpSync(path.join(APP, 'public'), path.join(RUN, 'public'), { recursive: true });
  fs.writeFileSync(path.join(RUN, 'data.json'), JSON.stringify({ teachers: [], classes: [], sessions: [], tokens: {} }, null, 2));

  const srv = spawn(process.execPath, ['server.js'], {
    cwd: RUN, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', d => process.stderr.write('  [srv:err] ' + d));

  let browser, context;
  try {
    await waitUp();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('dialog', d => d.accept());
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).split('\n')[0]));

    /* ---- account + class with a year, exactly as record.js ch2/ch3 do ---- */
    /* the same three mocks record.js installs, so the check can be made through the UI */
    await context.route('**/api/generate', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: ['q1', 'q2', 'q3'] }) }));
    await context.route('**/api/feedback', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    await page.goto(BASE, { waitUntil: 'load' });
    await sleep(600);

    /* ---- account + class with a year, exactly as record.js ch2/ch3 do ---- */
    await page.locator('#authEmail').fill('ms.reed@oakfield.school');
    await page.locator('#authPass').fill('teach123');
    await page.locator('#btnSignup').click();
    await page.locator('#dash').waitFor({ state: 'visible' });
    await sleep(600);
    await page.locator('#newClassName').fill('Year 8 Maths');
    await page.locator('#newClassYear').selectOption('Year 8');
    ok('#newClassYear took the value', (await page.locator('#newClassYear').inputValue()) === 'Year 8', await page.locator('#newClassYear').inputValue());
    await page.locator('#btnAddClass').click();
    await page.locator('.classrow').first().waitFor({ state: 'visible' });
    await sleep(800);
    const rowText = (await page.locator('.classrow').first().innerText()).replace(/\s+/g, ' ');
    ok('.classrow shows the year group', /Year 8/.test(rowText), rowText);
    await page.locator('.classrow').first().click();
    await page.locator('#classPanel').waitFor({ state: 'visible' });
    await sleep(600);

    const code = (await page.locator('#classCode').innerText()).trim();
    ok('#classCode has a code', /^[a-z0-9]{4,8}$/i.test(code), code);
    /* /api/classes needs the teacher cookie - a raw http.get is a 401, so ask from the page */
    const clsList = await page.evaluate(() => fetch('/api/classes').then(r => r.json()));
    const cls = (clsList.classes || [])[0];
    ok('class.year stored server-side', !!cls && cls.year === 'Year 8', cls && cls.year);

    /* ---- roster, as record.js does ---- */
    await page.locator('#btnRosterEdit').click();
    await page.locator('#rosterText').fill(ROSTER.join('\n'));
    await page.locator('#btnRosterSave').click();
    await page.locator('#rosterView .prow').first().waitFor({ state: 'visible', timeout: 20000 });

    /* ---- 03b: copy code / copy link / QR / print stylesheet ---- */
    await page.locator('#btnCopyCode').click();
    await sleep(400);
    const t1 = await page.locator('#toast').innerText();
    ok('copy code toast', /copied|Ctrl\+C/.test(t1), t1);
    await page.locator('#btnCopyLink').click();
    await sleep(400);
    const t2 = await page.locator('#toast').innerText();
    ok('copy link toast', /copied|Ctrl\+C/.test(t2), t2);
    await page.locator('#btnQr').click();
    await page.locator('#qrWrap').waitFor({ state: 'visible' });
    await sleep(1200);
    const qrOk = await page.locator('#qrImg').evaluate(img => img.complete && img.naturalWidth > 100);
    ok('#qrImg actually rendered', qrOk);
    await page.emulateMedia({ media: 'print' });
    await sleep(400);
    const printed = await page.evaluate(() => {
      const vis = [...document.body.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.tagName);
      return { visible: vis, qrShown: getComputedStyle(document.getElementById('qrWrap')).display !== 'none' };
    });
    ok('print media shows the QR sheet', printed.qrShown && printed.visible.length <= 3, printed);
    await page.emulateMedia({ media: 'screen' });
    await sleep(200);
    await page.locator('#btnQrClose').click();
    await sleep(400);

    /* ---- 03c: the year select is on screen and settable ---- */
    const yBox = await page.locator('#newClassYear').boundingBox();
    ok('#newClassYear has a box', !!yBox, yBox);

    /* ---- seed one check with results, so the pupil overlay has content ---- */
    /* also cookie-gated: make the check from the page, then seed pupils with the open /api/result */
    const s = await page.evaluate(cid => fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: cid, topic: 'comparing fractions', questions: ['q1', 'q2', 'q3'] })
    }).then(r => r.json()), cls.id);
    ok('check created', !!(s.check || s.session), Object.keys(s));
    for (const n of ['Aisha Noor', 'Maya Khan', 'Priya Shah']) {
      await post('/api/result', { code, name: n, verdict: V, transcript: TR });
    }
    await page.locator('#classList .classrow').first().click();
    await sleep(1500);
    await page.locator('#rosterView .prow').first().waitFor({ state: 'visible', timeout: 20000 });

    /* ---- 06b: open a pupil, open their words, close ---- */
    const links = await page.locator('#rosterView .plink').count();
    ok('#rosterView has pupil links', links >= 3, links);
    await page.locator('#rosterView .plink >> nth=0').click();
    await page.locator('#pupWrap').waitFor({ state: 'visible' });
    await page.locator('#pupBody .sresult').first().waitFor({ state: 'visible', timeout: 20000 });
    const pup = await page.locator('#pupTitle').innerText();
    const nres = await page.locator('#pupBody .sresult').count();
    ok('pupil overlay opened', !!pup, { pup, cards: nres });
    const said = page.locator('#pupBody .sresult >> nth=0 >> .said summary');
    ok('.said summary is there to click', (await said.count()) === 1, await said.count());
    await said.click();
    await sleep(600);
    const pre = page.locator('#pupBody .said pre');
    ok('.said pre visible once opened', await pre.isVisible());
    await page.locator('#btnPupClose').click();
    await sleep(500);
    ok('pupil overlay closed', await page.locator('#pupWrap').isHidden());

    /* ---- 06b: the export download ---- */
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.locator('#btnExport').click();
    const d = await dl;
    ok('#btnExport produces a download', !!d, d ? d.suggestedFilename() : 'no download event');
    ok('the page did NOT navigate away', await page.locator('#btnExport').isVisible());

    /* ---- 09b: the feedback box ---- */
    await page.locator('footer.sitenote').scrollIntoViewIfNeeded();
    ok('#fbOpen exists', (await page.locator('#fbOpen').count()) === 1);
    ok('#fbBox starts hidden', await page.locator('#fbBox').isHidden());
    await page.locator('#fbOpen').click();
    await page.locator('#fbBox').waitFor({ state: 'visible' });
    await page.locator('#fbMsg').click();
    await page.locator('#fbMsg').pressSequentially('It marked Tom red on adding fractions.', { delay: 8 });
    await page.locator('#fbSend').click();
    await sleep(900);
    const fbTxt = (await page.locator('#fbSend').innerText()).trim();
    ok('#fbSend answers (real server, no webhook)', fbTxt === 'Thank you' || /try again/.test(fbTxt), fbTxt);
    ok('no page errors', errs.length === 0, errs);

    /* ---- and the mobile geometry, since the phone take must do all this too ---- */
    /* a REAL phone context - isMobile/hasTouch is what makes (hover:none) match */
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
    });
    const mob = await mctx.newPage();
    mob.on('dialog', d => d.accept());
    await mctx.route('**/api/generate', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: ['q1', 'q2', 'q3'] }) }));
    await mob.goto(BASE, { waitUntil: 'load' });
    await sleep(800);
    await mob.locator('#authEmail').fill('ms.reed2@oakfield.school');
    await mob.locator('#authPass').fill('teach123');
    await mob.locator('#btnSignup').click();
    await mob.locator('#dash').waitFor({ state: 'visible' });
    await sleep(600);
    await mob.locator('#newClassName').fill('Phone Class');
    await mob.locator('#newClassYear').selectOption('Year 9');
    await mob.locator('#btnAddClass').click();
    await mob.locator('.classrow').first().waitFor({ state: 'visible' });
    await sleep(800);
    const hov = await mob.evaluate(() => {
      const b = document.querySelector('.classrow .cdel');
      const r = b && b.getBoundingClientRect();
      return { bodyScrollW: document.body.scrollWidth, innerW: window.innerWidth,
               cdelOpacity: b ? getComputedStyle(b).opacity : null,
               cdelBox: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null };
    });
    ok('390px: no horizontal overflow', hov.bodyScrollW <= hov.innerW + 1, hov);
    ok('.cdel reachable without hover (phone)', hov.cdelOpacity === '1' && hov.cdelBox.w > 0, hov);
    /* the phone must be able to open the class and reach the code + QR too */
    await mob.locator('.classrow').first().click();
    await mob.locator('#classPanel').waitFor({ state: 'visible' });
    await sleep(600);
    ok('phone: class opens, code shown', /^[a-z0-9]{4,8}$/i.test((await mob.locator('#classCode').innerText()).trim()));
    await mob.locator('#btnQr').click();
    await mob.locator('#qrWrap').waitFor({ state: 'visible' });
    await sleep(1000);
    ok('phone: QR renders', await mob.locator('#qrImg').evaluate(i => i.complete && i.naturalWidth > 100));
  } catch (e) {
    fails++;
    console.error('\n  PROBE BLEW UP: ' + (e.stack || e.message));
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' });
    setTimeout(() => { try { fs.rmSync(RUN, { recursive: true, force: true }); } catch {} }, 1200);
  }
  console.log(fails ? '\n  ' + fails + ' FAILED\n' : '\n  all probe steps passed\n');
  process.exit(fails ? 1 : 0);
})();
