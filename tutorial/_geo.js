/* throwaway: which Playwright recordVideo config actually fills a phone frame?
   The phone take came out 780x1688 with the page painted only into the top-left
   390x844, so the geometry needs to be settled empirically. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const TMP = path.join(os.tmpdir(), 'geotest');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const PAGE = path.join(TMP, 'p.html');
/* a full-bleed light panel: if the whole frame is this colour, geometry is right */
fs.writeFileSync(PAGE, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>html,body{margin:0;height:100%}div{position:fixed;inset:0;background:#c8c8c8}</style>'
  + '<div></div>');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function dims(f) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', f], { encoding: 'utf8' });
  const m = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(r.stderr || '');
  return m ? { w: +m[1], h: +m[2] } : null;
}
/* fraction of the frame that is the light panel (luma ~200) rather than the fill */
function coverage(f) {
  const W = 100, H = 100;
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', f,
    '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 22 });
  const b = r.stdout;
  if (!b || b.length < W * H) return null;
  let lit = 0;
  for (let i = 0; i < W * H; i++) if (b[i] >= 185) lit++;
  return lit / (W * H);
}

const configs = [
  { name: 'dsf2 + size 780x1688 (what record.js does now)', vp: { w: 390, h: 844 }, dsf: 2, size: true, mob: true },
  { name: 'dsf2 + size 390x844', vp: { w: 390, h: 844 }, dsf: 2, size: false, mob: true },
  { name: 'dsf2 + no size at all', vp: { w: 390, h: 844 }, dsf: 2, size: null, mob: true },
  { name: 'dsf1 + no size at all', vp: { w: 390, h: 844 }, dsf: 1, size: null, mob: true },
  { name: 'dsf3 + size 1170x2532', vp: { w: 390, h: 844 }, dsf: 3, size: true, mob: true },
  { name: 'dsf2 + size 780x1688, isMobile OFF', vp: { w: 390, h: 844 }, dsf: 2, size: true, mob: false }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const c of configs) {
    const dir = path.join(TMP, 'v' + configs.indexOf(c));
    fs.mkdirSync(dir, { recursive: true });
    const opts = {
      viewport: { width: c.vp.w, height: c.vp.h },
      deviceScaleFactor: c.dsf,
      isMobile: c.mob, hasTouch: c.mob
    };
    if (c.size === true) opts.recordVideo = { dir, size: { width: c.vp.w * c.dsf, height: c.vp.h * c.dsf } };
    else if (c.size === false) opts.recordVideo = { dir, size: { width: c.vp.w, height: c.vp.h } };
    else opts.recordVideo = { dir };

    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    await p.goto('file:///' + PAGE.replace(/\\/g, '/'), { waitUntil: 'load' });
    await sleep(1600);
    const vid = p.video();
    await ctx.close();
    const file = await vid.path();
    const d = dims(file);
    const cov = coverage(file);
    console.log('  ' + c.name.padEnd(46) + ' -> ' + String(d.w + 'x' + d.h).padEnd(11) +
      ' covered ' + (cov === null ? '?' : (cov * 100).toFixed(1) + '%'));
  }
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
