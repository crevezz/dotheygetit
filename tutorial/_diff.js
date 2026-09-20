/* Where does the traced SVG disagree with the PNG? 80x40, one char per sample:
   '#' both, 'P' only the PNG, 'S' only the SVG, ' ' neither. */
const fs = require('fs');
const path = require('path');
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { chromium = require(PW_DIR).chromium; } catch (e) { chromium = require('playwright').chromium; }
const OUT = path.join(__dirname, '..', 'brand', 'out');
const S = 1024;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const png = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'logo-transparent.png')).toString('base64');
  const svg = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(OUT, 'logo-trace.svg')).toString('base64');

  const art = await page.evaluate(async ({ png, svg, S }) => {
    const load = async (src) => {
      const i = new Image(); i.src = src; await i.decode();
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(i, 0, 0);
      return x.getImageData(0, 0, S, S).data;
    };
    const a = await load(png), b = await load(svg);
    const COLS = 80, ROWS = 40, rows = [];
    for (let r = 0; r < ROWS; r++) {
      let line = '';
      for (let q = 0; q < COLS; q++) {
        let pa = 0, pb = 0;
        for (let y = Math.floor(r * S / ROWS); y < Math.floor((r + 1) * S / ROWS); y++) {
          for (let x = Math.floor(q * S / COLS); x < Math.floor((q + 1) * S / COLS); x++) {
            const k = (y * S + x) * 4 + 3;
            if (a[k] > 128) pa++;
            if (b[k] > 128) pb++;
          }
        }
        const tot = (S / ROWS) * (S / COLS);
        const fp = pa / tot, fs = pb / tot;
        line += (fp > 0.5 && fs > 0.5) ? '#' : fp > 0.5 ? 'P' : fs > 0.5 ? 'S' : (fp > 0.15 || fs > 0.15) ? ':' : ' ';
      }
      rows.push(line);
    }
    return rows;
  }, { png, svg, S });

  console.log('P = PNG only (trace misses it), S = SVG only (trace overshoots)');
  art.forEach((r, i) => console.log(String(i).padStart(2) + '|' + r + '|'));
  await browser.close();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
