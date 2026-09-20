/* ============================================================================
   Film the designed advert (advert.html) with Playwright, then put the
   voiceover on it.

   The page holds on solid black until window.__go() is called, so the very
   first thing that happens on camera is the advert starting. That gives a
   reliable sync point: blackdetect finds where the black ends, and everything
   is timed from there. No drift, same trick the tutorials use.

   Needs out/advert/mix.wav (voice + bed) from advert.js.
   Writes out/advert/advert.mp4
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
/* same as record.js: playwright lives outside this app's node_modules */
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); }
catch { ({ chromium } = require('playwright')); }

const HERE = __dirname;
const OUT = path.join(HERE, 'out', 'advert');
const W = 1080, H = 1920, LEN = 21.0;
const MIX = path.join(OUT, 'mix.wav');

function run(args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error(String(r.stderr || '').slice(-2500)); process.exit(1); }
  return r;
}

(async () => {
  if (!fs.existsSync(MIX)) { console.error('missing ' + MIX + ' - run advert.js first'); process.exit(1); }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
    deviceScaleFactor: 1
  });
  const page = await ctx.newPage();
  const vid = page.video();

  await page.goto('file://' + path.join(HERE, 'advert.html').replace(/\\/g, '/'));
  /* make sure every clip can actually play before we start the clock */
  await page.waitForFunction(() =>
    [...document.querySelectorAll('video')].every(v => v.readyState >= 2), null, { timeout: 20000 });
  await page.waitForTimeout(500);

  console.log('filming ' + LEN + 's of design ...');
  await page.evaluate('window.__go()');
  await page.waitForTimeout(LEN * 1000 + 600);

  await ctx.close();
  await browser.close();

  const raw = await vid.path();
  const webm = path.join(OUT, 'film.webm');
  fs.copyFileSync(raw, webm);

  /* where does the advert actually begin? (the page is black until __go) */
  const bd = run(['-hide_banner', '-i', webm, '-vf', 'blackdetect=d=0.1:pic_th=0.98:pix_th=0.10', '-an', '-f', 'null', '-']);
  const pairs = [...String(bd.stderr).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => [+m[1], +m[2]]);
  const lead = pairs.filter(p => p[0] < 0.6).map(p => p[1]).sort((a, b) => a - b)[0];
  const start = lead === undefined ? 0 : lead;
  console.log('black lead-in ' + start.toFixed(2) + 's -> sync point');

  run(['-y', '-ss', start.toFixed(3), '-t', String(LEN), '-i', webm,
       '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
       '-r', '30', path.join(OUT, 'film.mp4')]);

  const final = path.join(OUT, 'advert.mp4');
  run(['-y', '-i', path.join(OUT, 'film.mp4'), '-i', MIX,
       '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
       '-movflags', '+faststart', final]);

  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', final], { encoding: 'utf8' });
  const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(r.stderr));
  console.log('done  out/advert/advert.mp4  ' + (fs.statSync(final).size / 1048576).toFixed(1) + ' MB  ' +
              (d ? d[1] + ':' + d[2] + ':' + d[3] : '?'));
  console.log(String(r.stderr).split('\n').filter(l => /Stream #/.test(l)).map(l => l.trim()).join('\n'));
})();