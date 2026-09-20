/* throwaway: drive the real /help page in a browser - 14 chapters, the laptop/phone
   toggle, deep links, the total line, and that both sets actually load. */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const PORT = 4597;
const APP = path.resolve(__dirname, '..');
const BASE = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => {
  const r = http.get(BASE + p, x => { x.resume(); x.on('end', () => res(x.statusCode)); });
  r.on('error', rej);
});

let fails = 0;
const ok = (name, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name.padEnd(48) + (extra === undefined ? '' : JSON.stringify(extra)));
};

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', d => process.stderr.write('  [err] ' + d));
  for (let i = 0; i < 80; i++) { try { if (await get('/api/health') === 200) break; } catch {} await sleep(250); }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).split('\n')[0]));

  async function loadMeta() {
    await page.waitForFunction(() => {
      const v = document.getElementById('v');
      return v && v.readyState >= 1 && v.duration > 0;
    }, null, { timeout: 20000 });
    return page.locator('#v').evaluate(v => ({ dur: v.duration, src: v.currentSrc || v.src }));
  }

  await page.goto(BASE + '/help', { waitUntil: 'load' });
  await sleep(800);

  const items = await page.locator('.item').count();
  ok('14 chapters listed', items === 14, items);

  const total = (await page.locator('#totalLine').innerText()).trim();
  ok('total line says fourteen', /fourteen/i.test(total), total);
  ok('total line gives 7 minutes 41 seconds', /7 minutes 41 seconds/.test(total), total);

  /* deep link to a chapter that sits out of filename order.
     A fresh page, because goto() to a hash-only change does not reload. */
  const deep = await ctx.newPage();
  deep.on('pageerror', e => errs.push(String(e.message).split('\n')[0]));
  await deep.goto(BASE + '/help#06b-take-the-record-away', { waitUntil: 'load' });
  await sleep(900);
  const now = (await deep.locator('#nowTitle').innerText()).trim();
  ok('deep link to 06b selects it', /Take the record away/.test(now), now);
  const onIdx = await deep.locator('.item.on').getAttribute('data-i');
  ok('06b is watch position 12 (index 11)', onIdx === '11', onIdx);
  /* and the hash changing in place is followed too */
  await deep.evaluate(() => { location.hash = '09b-if-it-gets-it-wrong'; });
  await sleep(700);
  ok('hashchange in place follows',
    /If it gets it wrong/.test((await deep.locator('#nowTitle').innerText()).trim()),
    (await deep.locator('#nowTitle').innerText()).trim());
  await deep.close();

  /* pick the same chapter on the main page, by clicking its row */
  await page.locator('.item[data-i="11"]').click();
  await sleep(700);
  ok('clicking row 12 selects 06b',
    /Take the record away/.test((await page.locator('#nowTitle').innerText()).trim()));

  let m = await loadMeta();
  ok('laptop video loads', m.dur > 20 && /\/help\/06b-take-the-record-away\.mp4$/.test(m.src), m);
  ok('laptop clip is ~34s', Math.abs(m.dur - 34) < 2, m.dur);

  /* switch to the phone set - same chapter, other take */
  await page.locator('#dev button[data-dev="phone"]').click();
  await sleep(400);
  ok('player gets the phone class', await page.locator('#player.phone').count() === 1);
  m = await loadMeta();
  ok('phone video loads from /help/mobile/', m.dur > 20 && /\/help\/mobile\/06b-take-the-record-away\.mp4$/.test(m.src), m);
  ok('phone clip is ~34s too', Math.abs(m.dur - 34) < 2, m.dur);
  const box = await page.locator('#v').boundingBox();
  ok('phone clip shown portrait (h > w)', box.height > box.width, { w: Math.round(box.width), h: Math.round(box.height) });
  ok('phone clip capped at 390 wide', Math.round(box.width) <= 390, Math.round(box.width));

  /* the device choice sticks, and switching back restores the laptop take */
  await page.reload({ waitUntil: 'load' });
  await sleep(800);
  ok('phone choice remembered after reload', await page.locator('#player.phone').count() === 1);
  await page.locator('#dev button[data-dev="laptop"]').click();
  await sleep(300);
  m = await loadMeta();
  ok('back to the laptop take', /\/help\/06b-take-the-record-away\.mp4$/.test(m.src) && !/mobile/.test(m.src), m.src);

  /* "watch the lot" follows the chosen set */
  await page.locator('#btnAll').click();
  await sleep(300);
  m = await loadMeta();
  ok('watch-the-lot uses the laptop all.mp4', /\/help\/all\.mp4$/.test(m.src), m.src);
  await page.locator('#dev button[data-dev="phone"]').click();
  await sleep(200);
  await page.locator('#btnAll').click();
  await sleep(300);
  m = await loadMeta();
  ok('watch-the-lot follows to /help/mobile/all.mp4', /\/help\/mobile\/all\.mp4$/.test(m.src), m.src);

  ok('no page errors', errs.length === 0, errs);

  await ctx.close();
  await browser.close();
  srv.kill();
  spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' });
  console.log(fails ? '\n  ' + fails + ' FAILED\n' : '\n  /help page all good\n');
  process.exit(fails ? 1 : 0);
})();
