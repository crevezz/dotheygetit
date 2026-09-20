/* Look at the mask. 80 cols x 40 rows, so the proportions match how it prints. */
const fs = require('fs');
const path = require('path');
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { chromium = require(PW_DIR).chromium; } catch (e) { chromium = require('playwright').chromium; }
const SRC = path.join(__dirname, '..', 'brand', 'out', 'logo-transparent.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');
  const art = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height, COLS = 80, ROWS = 40;
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      let line = '';
      for (let q = 0; q < COLS; q++) {
        let best = 0;
        for (let y = Math.floor(r * H / ROWS); y < Math.floor((r + 1) * H / ROWS); y++) {
          for (let px = Math.floor(q * W / COLS); px < Math.floor((q + 1) * W / COLS); px++) {
            const a = d[(y * W + px) * 4 + 3];
            if (a > best) best = a;
          }
        }
        line += best > 200 ? '#' : best > 128 ? '+' : best > 30 ? '.' : ' ';
      }
      rows.push(line);
    }
    /* and the true extents of the solid part */
    let minx = W, maxx = -1, miny = H, maxy = -1;
    for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
      if (d[(y * W + px) * 4 + 3] > 128) {
        if (px < minx) minx = px; if (px > maxx) maxx = px;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    return { rows, W, H, box: [minx, miny, maxx, maxy] };
  }, url);

  console.log('mask of logo-transparent.png  ' + art.W + 'x' + art.H +
              '   solid extents x' + art.box[0] + '..' + art.box[2] + ' y' + art.box[1] + '..' + art.box[3]);
  art.rows.forEach((r, i) => console.log(String(i).padStart(2) + '|' + r + '|'));
  await browser.close();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
