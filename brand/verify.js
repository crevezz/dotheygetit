/* Checks the generated social images are actually usable:
   right canvas size, no overflow/clipping, nothing invisible off-canvas,
   text big enough to read as a thumbnail, and enough contrast to not be blank. */
const path = require('path');
const { ogPage, bannerPage, mark } = require('./make');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const CASES = [
  ['og-image 1200x630', ogPage(), 1200, 630],
  ['og-square 1080x1080', ogPage({ square: true }), 1080, 1080],
  ['story 1080x1920', ogPage({ tall: true }), 1080, 1920],
  ['linkedin 1584x396', bannerPage(), 1584, 396],
  ['twitter 1200x600', bannerPage({ twitter: true }), 1200, 600]
];

let pass = 0, fail = 0;
const ok = (n, cond, extra = '') => {
  if (cond) { pass++; console.log('    PASS  ' + n); }
  else { fail++; console.log('    FAIL  ' + n + (extra ? '  <- ' + extra : '')); }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const [label, html, w, h] of CASES) {
    console.log('\n' + label);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html, { waitUntil: 'load' });

    const r = await page.evaluate(({ W, H }) => {
      const out = { overflow: [], tiny: [], decoTiny: [], offcanvas: [], smallest: 999 };
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const tag = el.tagName.toLowerCase();
        // anything sticking out of the canvas gets clipped by the screenshot
        if (b.left < -0.5 || b.top < -0.5 || b.right > W + 0.5 || b.bottom > H + 0.5) {
          if (tag === 'html' || tag === 'body') continue;
          if (tag === 'g' || tag === 'svg') continue;
          out.offcanvas.push(tag + ' ' + (el.textContent || '').slice(0, 24).trim() +
            ' [' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' +
            Math.round(b.width) + 'x' + Math.round(b.height) + ']');
        }
        if (el.children.length === 0 && el.textContent.trim()) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < out.smallest) out.smallest = fs;
          // Logo lock-ups and the miniature of the product UI are imagery, not
          // copy to read - they only have to stay legible as texture.
          const deco = el.closest('[data-deco]');
          if (deco) { if (fs < 10) out.decoTiny.push(fs + 'px "' + el.textContent.slice(0, 20) + '"'); }
          else if (fs < 18) out.tiny.push(fs + 'px "' + el.textContent.slice(0, 20) + '"');
        }
      }
      out.scrollW = document.documentElement.scrollWidth;
      out.scrollH = document.documentElement.scrollHeight;
      return out;
    }, { W: w, H: h });

    ok('no element hangs off the canvas', r.offcanvas.length === 0, r.offcanvas.join(' | '));
    ok('no scrolling (means nothing is hidden)', r.scrollW <= w && r.scrollH <= h,
      r.scrollW + 'x' + r.scrollH);
    ok('every readable word is >= 18px (thumbnail-legible)', r.tiny.length === 0, r.tiny.join(', '));
    ok('the decorative bits stay >= 10px (not mush)', r.decoTiny.length === 0, r.decoTiny.join(', '));

    // real pixel content, and dark like the product.
    // Sampled at NATIVE resolution - downscaling first would smear the text
    // into the background and make a perfectly good image look low-contrast.
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
    const div = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise(res => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const set = new Set(); let lum = 0, bright = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) {          // every 4th pixel, plenty
        set.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        lum += L; if (L > 190) bright++; n++;
      }
      return { colours: set.size, avgLum: lum / n, brightPct: bright / n * 100 };
    }, png.toString('base64'));

    ok('has real content (not a blank fill)', div.colours > 60, div.colours + ' colours');
    ok('is dark like the product', div.avgLum < 120, 'avg luminance ' + div.avgLum.toFixed(0));
    ok('has bright text for contrast', div.brightPct > 1.5, div.brightPct.toFixed(1) + '% bright pixels');
  }

  // the icon mark must survive being shrunk to a tab
  console.log('\nthe mark at favicon sizes');
  for (const s of [16, 32, 180, 512]) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<body style="margin:0">${mark({ size: s, radius: Math.round(58 * s / 256) })}</body>`);
    const r = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const b = svg.getBoundingClientRect();
      return { w: b.width, h: b.height, paths: svg.querySelectorAll('path').length };
    });
    ok(s + 'px: draws one tick, fills the square', r.paths === 1 && Math.abs(r.w - s) < 1, JSON.stringify(r));
  }

  // The .ico is the one file we build by hand, so decode it back rather than
  // trusting the writer. Every entry must point at a real PNG that is really
  // the size it claims.
  console.log('\nfavicon.ico structure');
  const fs = require('fs');
  const ico = fs.readFileSync(path.join(__dirname, 'out', 'favicon.ico'));
  const count = ico.readUInt16LE(4);
  ok('header says 3 images', count === 3, 'says ' + count);
  const sizes = [];
  let allGood = true;
  for (let i = 0; i < count; i++) {
    const b = 6 + i * 16;
    const w = ico.readUInt8(b) || 256;
    const bytes = ico.readUInt32LE(b + 8);
    const off = ico.readUInt32LE(b + 12);
    const slice = ico.subarray(off, off + bytes);
    const isPng = slice[0] === 0x89 && slice.toString('ascii', 1, 4) === 'PNG';
    const rw = slice.readUInt32BE(16), rh = slice.readUInt32BE(20);
    sizes.push(w);
    if (!isPng || rw !== w || rh !== w || off + bytes > ico.length) allGood = false;
    ok(w + 'px entry holds a real ' + rw + 'x' + rh + ' PNG', isPng && rw === w && rh === w,
      'png=' + isPng + ' actual ' + rw + 'x' + rh);
  }
  ok('entries are 16/32/48 and fit inside the file', allGood && sizes.join() === '16,32,48', sizes.join());

  await browser.close();
  console.log('\nPASS ' + pass + ', FAIL ' + fail);
  if (fail) process.exit(1);
})();
