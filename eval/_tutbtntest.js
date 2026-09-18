/* Proves the tutorials button shows in the teacher tab and never in the pupil tab. */
const { spawn } = require('child_process');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium, devices } = require(PW);

const PORT = 4711;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore'
});

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(1400);
  const base = 'http://127.0.0.1:' + PORT;
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await pg.goto(base, { waitUntil: 'load' });
  await wait(900);

  const read = () => pg.evaluate(() => {
    const el = document.querySelector('.tutbar');
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { exists: true, visible: r.width > 0 && r.height > 0 && cs.display !== 'none', w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  });

  const teacher = await read();

  // switch to the pupil tab
  await pg.click('#tab-student').catch(async () => { await pg.click('header nav button:nth-child(2)'); });
  await wait(500);
  const pupil = await read();

  // tap target size of the button
  await pg.click('#tab-teacher').catch(async () => { await pg.click('header nav button:nth-child(1)'); });
  await wait(400);
  const btn = await pg.evaluate(() => {
    const a = document.querySelector('.tutbtn');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), href: a.getAttribute('href'), text: a.textContent.trim() };
  });

  await pg.screenshot({ path: path.join(__dirname, '..', 'tutorial', 'out', 'tutbtn-teacher.png') });
  await b.close();
  srv.kill();

  console.log('teacher tab: ' + JSON.stringify(teacher));
  console.log('pupil tab:   ' + JSON.stringify(pupil));
  console.log('button:      ' + JSON.stringify(btn));
  const ok = teacher.visible && !pupil.visible && btn && btn.href === '/help' && btn.h >= 40;
  console.log(ok ? 'TUTBTN_LIVE_OK' : 'TUTBTN_LIVE_FAIL');
})().catch(e => { console.error('FAILED: ' + e.message); srv.kill(); process.exit(1); });
