/* throwaway: does granting clipboard permission make the toast say "copied"?
   tests desktop and a real phone context, with and without bringToFront. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const APP = path.resolve(__dirname, '..');
const RUN = path.join(__dirname, '.run3');
const PORT = 4593;
const BASE = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => {
  const r = http.get(BASE + p, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(x.statusCode)); });
  r.on('error', rej);
});

(async () => {
  fs.rmSync(RUN, { recursive: true, force: true });
  fs.mkdirSync(RUN, { recursive: true });
  for (const f of ['server.js', 'config.json', 'key.txt', 'package.json'])
    if (fs.existsSync(path.join(APP, f))) fs.copyFileSync(path.join(APP, f), path.join(RUN, f));
  fs.cpSync(path.join(APP, 'public'), path.join(RUN, 'public'), { recursive: true });
  fs.writeFileSync(path.join(RUN, 'data.json'), JSON.stringify({ teachers: [], classes: [], sessions: [], tokens: {} }, null, 2));
  const srv = spawn(process.execPath, ['server.js'], { cwd: RUN, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write('  [srv:err] ' + d));
  for (let i = 0; i < 100; i++) { try { if (await get('/api/health') === 200) break; } catch {} await sleep(250); }

  const browser = await chromium.launch({ headless: true });
  async function trial(label, opts, grant, front) {
    const ctx = await browser.newContext(opts);
    if (grant) { try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); } catch (e) { console.log('  grant failed', e.message); } }
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(BASE, { waitUntil: 'load' });
    await sleep(500);
    if (front) { await p.bringToFront(); await sleep(200); }
    await p.locator('#authEmail').fill(label + '@x.school');
    await p.locator('#authPass').fill('teach123');
    await p.locator('#btnSignup').click();
    await p.locator('#dash').waitFor({ state: 'visible' });
    await sleep(400);
    await p.locator('#newClassName').fill('C ' + label);
    await p.locator('#btnAddClass').click();
    await p.locator('.classrow').first().waitFor({ state: 'visible' });
    await sleep(500);
    await p.locator('.classrow').first().click();
    await p.locator('#classPanel').waitFor({ state: 'visible' });
    await sleep(400);
    await p.locator('#btnCopyCode').click();
    await sleep(500);
    const t = (await p.locator('#toast').innerText()).trim();
    console.log('  ' + label.padEnd(34) + ' toast = ' + JSON.stringify(t));
    await ctx.close();
  }

  await trial('desk-nogrant', { viewport: { width: 1280, height: 800 } }, false, false);
  await trial('desk-grant', { viewport: { width: 1280, height: 800 } }, true, false);
  await trial('desk-grant-front', { viewport: { width: 1280, height: 800 } }, true, true);
  await trial('phone-grant-front', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true, true);

  await browser.close();
  spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' });
  setTimeout(() => { try { fs.rmSync(RUN, { recursive: true, force: true }); } catch {} }, 1200);
})();
