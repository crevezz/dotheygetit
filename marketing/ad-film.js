/* Video adverts, from the same design as the stills.
 *
 *   node marketing/ad-film.js                 every ad, every canvas
 *   node marketing/ad-film.js nodding         just the ads whose id matches
 *   node marketing/ad-film.js nodding story   ...and only that canvas
 *   FPS=25 node marketing/ad-film.js          25fps instead of 30
 *
 * WHY FRAMES AND NOT A SCREEN RECORDING
 * A screen capture races the animation: the encoder grabs whatever the page
 * happens to be showing, so the type arrives at slightly different points in
 * every take and the whole thing goes soft. This template is driven instead -
 * template.js exposes window.__at(t), which puts the design into its exact
 * state at time t, and we shoot one frame per t. The motion is therefore
 * deterministic and repeatable, the frames are lossless PNGs going into the
 * encoder, and the type stays as crisp as it is in the stills.
 *
 * Output is 1080x1920 / 1080x1350 / 1080x1080 / 1200x628 at 30fps, silent.
 * Those are the real platform sizes. A video does not need rendering at 2x the
 * way a still does: the platform plays it at native size, so 2160x3840 would
 * only buy unusable file size.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => {
  try { return require('ffmpeg-static'); }
  catch { return require('../tutorial/node_modules/ffmpeg-static'); }
})();
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const T = require('./tokens');
const { page, MOTION } = require('./template');
const { ADS } = require('./ads');

const OUT = path.join(__dirname, 'out', 'adfilm');
const FPS = Number(process.env.FPS || 30);
const FRAMES = Math.round(MOTION.total * FPS);

/* Video targets: the stills' four canvases, minus the wide banner's k - a 16:9
   film is watched full width, so it does not need the hot type a link ad does. */
const SIZES = T.sizes;

const run = (args) => {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error(String(r.stderr || '').slice(-1500)); process.exit(1); }
  return r;
};

(async () => {
  const wantAd = process.argv[2] && !SIZES.some((s) => s.id === process.argv[2]) ? process.argv[2] : null;
  const wantSize = SIZES.some((s) => s.id === process.argv[2]) ? process.argv[2] : process.argv[3];
  const ads = wantAd ? ADS.filter((a) => a.id.includes(wantAd)) : ADS;
  const sizes = wantSize ? SIZES.filter((s) => s.id === wantSize) : SIZES;
  if (!ads.length) throw new Error('no ads match "' + wantAd + '"');
  if (!sizes.length) throw new Error('no canvas matches "' + wantSize + '"');

  fs.mkdirSync(OUT, { recursive: true });
  const tmp = path.join(OUT, '_frames');
  fs.mkdirSync(tmp, { recursive: true });

  const browser = await chromium.launch();
  const made = [];
  const total = ads.length * sizes.length;
  let n = 0;

  for (const size of sizes) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    for (const ad of ads) {
      n++;
      await pg.setContent(page(ad, size, { film: 1 }), { waitUntil: 'load' });
      await pg.waitForTimeout(150);

      for (let f = 0; f < FRAMES; f++) {
        await pg.evaluate((t) => window.__at(t), f / FPS);
        await pg.screenshot({
          path: path.join(tmp, String(f).padStart(4, '0') + '.jpg'),
          type: 'jpeg', quality: 92,
        });
      }

      const file = path.join(OUT, ad.id + '-' + size.id + '.mp4');
      run(['-y', '-hide_banner', '-loglevel', 'error',
        '-framerate', String(FPS), '-i', path.join(tmp, '%04d.jpg'),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);

      fs.readdirSync(tmp).forEach((f) => fs.unlinkSync(path.join(tmp, f)));
      made.push({ file, ad, size });
      console.log('  ok    ' + (ad.id + '-' + size.id).padEnd(22) +
        size.w + 'x' + size.h + '  ' + MOTION.total.toFixed(1) + 's @ ' + FPS + 'fps  ' +
        (fs.statSync(file).size / 1048576).toFixed(2) + ' MB   [' + n + '/' + total + ']');
    }
    await ctx.close();
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  fs.writeFileSync(path.join(OUT, 'index.html'), sheet(made));
  console.log('\n  ' + made.length + ' films -> marketing/out/adfilm  (open index.html to review)');
})();

/* The human check: every film plays on one page. */
function sheet(made) {
  const tiles = made.map((m) => `<figure>
  <video src="${path.basename(m.file)}" controls muted loop playsinline preload="metadata"></video>
  <figcaption>${m.ad.id} &middot; ${m.size.id} &middot; ${m.size.w}&times;${m.size.h} &middot; ${MOTION.total.toFixed(1)}s</figcaption>
</figure>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Ad films</title>
<style>
body{margin:0;padding:40px;background:${T.colors.bg};color:${T.colors.text};font-family:${T.type.family}}
h1{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
p{color:${T.colors.muted};font-size:14px;margin:0 0 34px}
.grid{display:grid;gap:28px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));align-items:start}
figure{margin:0}
video{width:100%;height:auto;display:block;border-radius:10px;border:1px solid ${T.colors.line};background:#070a1a}
figcaption{margin-top:9px;font-size:12.5px;color:${T.colors.muted};letter-spacing:.02em}
</style>
<h1>Ad films</h1><p>${made.length} films &middot; ${MOTION.total.toFixed(1)}s &middot; ${FPS}fps &middot; silent - add voice or music in the ad platform</p>
<div class="grid">
${tiles}
</div>`;
}