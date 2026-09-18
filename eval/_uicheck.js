const { spawn } = require('child_process');
const path = require('path');
const PORT = 4713, BASE = 'http://127.0.0.1:' + PORT;
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore'
});
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(2500);
  const b = await chromium.launch();
  for (const v of [{ w: 1280, h: 800, n: 'desk' }, { w: 390, h: 844, n: 'mob' }]) {
    const c = await b.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await wait(900);
    const m = await p.evaluate(() => {
      const h = document.querySelector('header').getBoundingClientRect();
      const t = document.querySelector('.tutbar').getBoundingClientRect();
      const btn = document.querySelector('.tutbtn').getBoundingClientRect();
      const bar = document.querySelector('.tutbar');
      const cs = getComputedStyle(bar);
      return {
        headerBottom: Math.round(h.bottom), barTop: Math.round(t.top),
        barMarginTop: cs.marginTop, gap: Math.round(t.top - h.bottom),
        btnTop: Math.round(btn.top), barHeight: Math.round(t.height),
        discordLinks: document.querySelectorAll('a[href*="discord.gg"]').length,
        firstDiscordY: (() => { const a = document.querySelector('a[href*="discord.gg"]'); return a ? Math.round(a.getBoundingClientRect().top) : null; })(),
        docH: document.documentElement.scrollHeight
      };
    });
    console.log(v.n + ': ' + JSON.stringify(m));
    await p.screenshot({ path: 'tutorial/out/ui-' + v.n + '.png', fullPage: false });
    await c.close();
  }
  await b.close(); srv.kill(); console.log('UICHECK_OK');
})().catch(e => { console.error('FAILED: ' + e.message); srv.kill(); process.exit(1); });
