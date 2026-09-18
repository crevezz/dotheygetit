const { spawn } = require('child_process');
const path = require('path');
const PORT = 4715, BASE = 'http://127.0.0.1:' + PORT;
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(2500);
  const b = await chromium.launch();
  for (const w of [320, 360, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await wait(700);
    for (const tab of ['teacher', 'student']) {
      await p.click('#tab-' + tab);
      await wait(400);
      const m = await p.evaluate(() => ({
        over: document.documentElement.scrollWidth - window.innerWidth,
        right: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 1; }).map(e => e.tagName + '.' + (e.className || '')).slice(0, 4),
        discordVisible: !!document.querySelector('#view-teacher:not(.hidden) a[href*="discord.gg"], footer a[href*="discord.gg"]'),
        tutVisible: !!document.querySelector('#view-teacher:not(.hidden) .tutbtn')
      }));
      console.log(w + 'px ' + tab + ': ' + JSON.stringify(m));
    }
    await c.close();
  }
  await b.close(); srv.kill(); console.log('NARROW_OK');
})().catch(e => { console.error('FAILED: ' + e.message); srv.kill(); process.exit(1); });