/* _scanframes.js - pull a frame every second out of an advert and report, for
   each, the brightest pixel in the band the type sits in. A frame that should
   carry words but never gets bright is a frame with unreadable type.
   usage: node marketing/_scanframes.js <video.mp4> [step] */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => {
  try { return require('ffmpeg-static'); }
  catch { return require('../tutorial/node_modules/ffmpeg-static'); }
})();
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const video = path.resolve(process.argv[2]);
const step = Number(process.argv[3] || 1);
const tmp = path.join(path.dirname(video), '_scan');
fs.mkdirSync(tmp, { recursive: true });

const d = spawnSync(ffmpeg, ['-hide_banner', '-i', video], { encoding: 'utf8' });
const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(d.stderr));
const total = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
console.log(`${path.basename(video)}  ${total.toFixed(1)}s  step ${step}s\n`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  console.log('   t   brightest in the middle band   full-frame brightest   verdict');
  for (let t = 0; t < total; t += step) {
    const f = path.join(tmp, 'f' + t + '.png');
    const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-ss', String(t), '-i', video,
      '-frames:v', '1', '-vf', 'scale=540:-1', f], { encoding: 'utf8' });
    if (!fs.existsSync(f)) { console.log(`  ${String(t).padStart(4)}s  extract failed`); continue; }
    const uri = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const out = await p.evaluate(async (u) => {
      const img = new Image(); img.src = u; await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const mid = Math.round(img.height * 0.25);
      const hgt = Math.round(img.height * 0.5);
      const band = x.getImageData(0, mid, img.width, hgt).data;
      const all = x.getImageData(0, 0, img.width, img.height).data;
      const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let bm = 0, ba = 0, mid_lit = 0;
      for (let i = 0; i < band.length; i += 4) { const L = lum(band, i); if (L > bm) bm = L; if (L > 140) mid_lit++; }
      for (let i = 0; i < all.length; i += 4) { const L = lum(all, i); if (L > ba) ba = L; }
      return { bm: Math.round(bm), ba: Math.round(ba), mid_lit, w: img.width, hgt };
    }, uri);
    const ok = out.bm > 150 ? 'ok' : out.bm > 90 ? 'DIM' : 'BLACK';
    console.log(`  ${String(t).padStart(4)}s  ${String(out.bm).padStart(24)}  ${String(out.ba).padStart(18)}   ${ok}`);
  }
  await b.close();
})();
