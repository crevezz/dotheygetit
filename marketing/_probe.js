/* _probe.js - is the type actually visible? Samples a PNG or a video frame and
   reports the colour of the lit pixels, band by band, top to bottom.
   usage: node marketing/_probe.js <image.png> */
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const file = path.resolve(process.argv[2]);
const BANDS = 12;
/* inline as a data URI: an about:blank page is not allowed to read a file:// image */
const dataUri = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const out = await p.evaluate(async ([url, bands]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const rows = [];
    for (let i = 0; i < bands; i++) {
      const y = Math.round((i + 0.5) * img.height / bands);
      const d = x.getImageData(0, y, img.width, 1).data;
      let lit = 0, sr = 0, sg = 0, sb = 0, maxL = 0;
      for (let k = 0; k < d.length; k += 4) {
        const L = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        if (L > 120) { lit++; sr += d[k]; sg += d[k + 1]; sb += d[k + 2]; }
        if (L > maxL) maxL = L;
      }
      rows.push({
        pct: Math.round((i + 0.5) / bands * 100),
        lit: lit,
        litPct: +(lit / img.width * 100).toFixed(1),
        avg: lit ? [Math.round(sr / lit), Math.round(sg / lit), Math.round(sb / lit)] : null,
        maxL: Math.round(maxL),
      });
    }
    return { w: img.width, h: img.height, rows };
  }, [dataUri, BANDS]);

  console.log(`${path.basename(file)}  ${out.w}x${out.h}`);
  console.log('  pos   lit px   lit%   avg colour of lit pixels   brightest');
  for (const r of out.rows) {
    const bar = '#'.repeat(Math.round(r.litPct / 3));
    console.log(`  ${String(r.pct).padStart(3)}%  ${String(r.lit).padStart(6)}  ${String(r.litPct).padStart(4)}%  ` +
      `${r.avg ? 'rgb(' + r.avg.join(',') + ')' : '        --        '}  ${String(r.maxL).padStart(3)}  ${bar}`);
  }
  await b.close();
})();
