const { spawn } = require('child_process');
const path = require('path');
const PORT = 4714, BASE = 'http://127.0.0.1:' + PORT;
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(2500);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto(BASE, { waitUntil: 'load' });
  await wait(700);
  const m = await p.evaluate(() => {
    const d = (s, k) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[k] : 'MISSING'; };
    const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    return {
      body: r('body'), header: r('header'), main: r('main'), section: r('#view-teacher'), tutbar: r('.tutbar'), card: r('#signinCard'),
      mainPadTop: d('main', 'paddingTop'), mainMarginTop: d('main', 'marginTop'),
      secMarginTop: d('#view-teacher', 'marginTop'), secPadTop: d('#view-teacher', 'paddingTop'),
      bodyPadTop: d('body', 'paddingTop'),
      tutBarMargin: d('.tutbar', 'marginTop')
    };
  });
  console.log(JSON.stringify(m, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FAILED: ' + e.message); srv.kill(); process.exit(1); });