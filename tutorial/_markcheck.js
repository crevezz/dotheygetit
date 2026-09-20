/* Render the transparent logo out of brand/mark.js and check it against the
   artwork that was actually chosen (brand/out/logo-cutout.png, the strokes lifted
   off c4-two-strokes.jpg).

   Two reasons this matters:
     - the pipeline is now the source of the logo, so the favicon, the app icon,
       the OG image and this file can never drift apart
     - a JPEG cut-out has JPEG edges; the vector version is clean at any size

   Run from tutorial/:  node _markcheck.js */
const fs = require('fs');
const path = require('path');
const { mark } = require(path.join(__dirname, '..', 'brand', 'mark.js'));

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { chromium = require(PW_DIR).chromium; } catch (e) { chromium = require('playwright').chromium; }

const OUT = path.join(__dirname, '..', 'brand', 'out');
const S = 1024;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const svg = mark({ size: S, transparent: true });
  fs.writeFileSync(path.join(OUT, 'logo.svg'), svg);

  const cutout = 'data:image/png;base64,' +
    fs.readFileSync(path.join(OUT, 'logo-cutout.png')).toString('base64');
  const vector = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

  const res = await page.evaluate(async ({ cutout, vector, S }) => {
    const load = async (src) => {
      const i = new Image(); i.src = src; await i.decode();
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(i, 0, 0);
      return { data: x.getImageData(0, 0, S, S).data, canvas: c };
    };
    const a = await load(cutout);
    const b = await load(vector);

    let both = 0, either = 0, artOnly = 0, vecOnly = 0;
    for (let p = 0; p < S * S; p++) {
      const m = a.data[p * 4 + 3] > 128, q = b.data[p * 4 + 3] > 128;
      if (m && q) both++; else if (m) artOnly++; else if (q) vecOnly++;
      if (m || q) either++;
    }

    /* transparency has to survive the round trip: no opaque background anywhere */
    let opaqueBg = 0;
    for (let p = 0; p < S * S; p++) if (b.data[p * 4 + 3] > 8) opaqueBg++;
    const corner = (x, y) => b.data[((y * S + x) * 4) + 3];

    return {
      iou: both / either, artOnly: artOnly / either, vecOnly: vecOnly / either,
      ink: (opaqueBg / (S * S) * 100),
      corners: [corner(2, 2), corner(S - 3, 2), corner(2, S - 3), corner(S - 3, S - 3)],
      png: b.canvas.toDataURL('image/png')
    };
  }, { cutout, vector, S });

  const file = path.join(OUT, 'logo-transparent.png');
  fs.writeFileSync(file, Buffer.from(res.png.split(',')[1], 'base64'));

  console.log('vector      brand/mark.js mark({ transparent: true }) at ' + S + 'px');
  console.log('overlap     IoU ' + (res.iou * 100).toFixed(1) +
              '% against the artwork lifted off c4  (art only ' + (res.artOnly * 100).toFixed(1) +
              '%, vector only ' + (res.vecOnly * 100).toFixed(1) + '%)');
  console.log('ink         covers ' + res.ink.toFixed(1) + '% of the frame, ' +
              (100 - res.ink).toFixed(1) + '% fully transparent');
  console.log('corners     alpha ' + res.corners.join(' / ') + '   (all 0 = no background)');
  console.log('output      brand/out/logo-transparent.png  ' +
              (fs.statSync(file).size / 1024).toFixed(0) + ' KB   + brand/out/logo.svg');

  await browser.close();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
