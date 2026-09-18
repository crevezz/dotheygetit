const { spawn } = require('child_process');
const path = require('path');
const PORT = 4716, BASE = 'http://127.0.0.1:' + PORT;
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(2500);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
  await p.goto(BASE, { waitUntil: 'load' });
  await wait(700);

  await p.hover('.tutbtn');
  await wait(500);
  const m = await p.evaluate(() => {
    const el = document.querySelector('.tutbtn');
    const ps = getComputedStyle(el, '::after');
    const btn = el.getBoundingClientRect();
    const hd = document.querySelector('header').getBoundingClientRect();
    return {
      tipTop: ps.top, tipBottom: ps.bottom,
      opensBelow: ps.bottom === 'auto' && ps.top !== 'auto',
      tipZ: ps.zIndex, headerZ: getComputedStyle(document.querySelector('header')).zIndex,
      btnBottom: Math.round(btn.bottom), headerBottom: Math.round(hd.bottom),
      belowHeader: Math.round(btn.bottom) >= Math.round(hd.bottom)
    };
  });
  console.log('tutorials tip: ' + JSON.stringify(m));
  await p.screenshot({ path: 'tutorial/out/tip-tutbtn.png', clip: { x: 300, y: 0, width: 700, height: 300 } });

  // the classroom code tip further down should still open upward (unchanged behaviour)
  const up = await p.evaluate(() => {
    const el = document.querySelector('main [data-tip]:not(.tutbtn):not(.tutdisc)');
    if (!el) return 'none';
    const ps = getComputedStyle(el, '::after');
    return { sel: el.id || el.className, top: ps.top, bottom: ps.bottom, opensAbove: ps.top === 'auto' && ps.bottom !== 'auto' };
  });
  console.log('other tip: ' + JSON.stringify(up));
  await b.close(); srv.kill(); console.log('TIP_OK');
})().catch(e => { console.error('FAILED: ' + e.message); srv.kill(); process.exit(1); });