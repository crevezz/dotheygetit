/* c4-two-strokes.jpg is the chosen mark. A JPEG cannot have a transparent
   background and the brand pipeline cannot take a raster logo anyway, so this
   lifts the strokes off the artwork and writes a real transparent PNG.

   What the file actually is (measured, not assumed): a white page margin, a
   large navy rounded tile, and a blue->violet two-stroke tick on the tile.
   "Transparent background" means keep the tick, drop the tile AND the margin.

   So a pixel is ink only if it is far from BOTH the page white and the tile
   navy: alpha = ramp(min(dist_to_white, dist_to_navy)). White and navy both
   fall to zero, the tick rises, and the tick's own edge antialiases properly.

   Run from tutorial/:  node _cutout.js */
const fs = require('fs');
const path = require('path');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { chromium = require(PW_DIR).chromium; } catch (e) { chromium = require('playwright').chromium; }

const SRC = path.join(__dirname, '..', 'brand', 'out', 'logo-candidates', 'c4-two-strokes.jpg');
const OUTDIR = path.join(__dirname, '..', 'brand', 'out');
const SIZE = 1024;   // final square
const PAD = 0.07;    // breathing room, fraction of SIZE

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(SRC).toString('base64');

  const res = await page.evaluate(async ({ src, SIZE, PAD }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, W, H);
    const d = im.data;

    /* page white = the corners */
    let wr = 0, wg = 0, wb = 0, n = 0;
    const P = 24;
    [[0, 0], [W - P, 0], [0, H - P], [W - P, H - P]].forEach(function (o) {
      for (let y = o[1]; y < o[1] + P; y++) for (let x = o[0]; x < o[0] + P; x++) {
        const i = (y * W + x) * 4; wr += d[i]; wg += d[i + 1]; wb += d[i + 2]; n++;
      }
    });
    wr /= n; wg /= n; wb /= n;

    /* tile navy = the median pixel, because the tile covers most of the frame
       and the median ignores both the margin and the thin tick */
    const ch = [[], [], []];
    for (let i = 0; i < d.length; i += 12) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
    const med = ch.map(a => { a.sort((x, y) => x - y); return a[a.length >> 1]; });
    const nr = med[0], ng = med[1], nb = med[2];

    const dW = (i) => Math.max(Math.abs(d[i] - wr), Math.abs(d[i + 1] - wg), Math.abs(d[i + 2] - wb));
    const dN = (i) => Math.max(Math.abs(d[i] - nr), Math.abs(d[i + 1] - ng), Math.abs(d[i + 2] - nb));
    const ink = (i) => Math.min(dW(i), dN(i));

    /* measure the two backgrounds before trusting them: the ink should be a
       clean third cluster, not a smear of everything in between */
    const hist = new Array(26).fill(0);
    for (let i = 0; i < d.length; i += 12) hist[Math.min(25, ink(i) >> 4)]++;

    /* The tile's own edge against the page is a grey ramp between two
       backgrounds, so distance alone would keep it as a thin rectangle outline.
       The tick is the only SATURATED thing in the frame, so gate on that too. */
    const sat = (i) => {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      return mx <= 0 ? 0 : (mx - mn) / mx;
    };
    const smooth = (v, lo, hi) => {
      let a = (v - lo) / (hi - lo);
      return a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
    };

    const t0 = 55, t1 = 130;   // clear below 55, solid above 130
    let cleared = 0, solid = 0, edge = 0, grey = 0, minx = W, miny = H, maxx = -1, maxy = -1;

    for (let i = 0; i < d.length; i += 4) {
      const a = smooth(ink(i), t0, t1) * smooth(sat(i), 0.10, 0.22);
      if (a <= 0.02) { d[i + 3] = 0; cleared++; continue; }
      if (sat(i) < 0.15) grey++;
      if (a < 1) {
        /* un-premultiply against the navy the tick was sitting on, so the edge
           pixels do not keep a dark fringe */
        const bgk = [nr, ng, nb];
        for (let k = 0; k < 3; k++) {
          d[i + k] = Math.max(0, Math.min(255, Math.round(bgk[k] + (d[i + k] - bgk[k]) / a)));
        }
        edge++;
      } else solid++;
      d[i + 3] = Math.round(a * 255);
      if (a >= 0.5) {          // frame the solid mark, not stray JPEG speckles
        const px = (i / 4) % W, py = ((i / 4) / W) | 0;
        if (px < minx) minx = px;
        if (px > maxx) maxx = px;
        if (py < miny) miny = py;
        if (py > maxy) maxy = py;
      }
    }
    ctx.putImageData(im, 0, 0);

    /* frame it exactly the way brand/mark.js draws it, so the two can be
       compared pixel for pixel: the mark's caps span 192 of the 256 grid */
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    const out = document.createElement('canvas');
    out.width = SIZE; out.height = SIZE;
    const o = out.getContext('2d', { willReadFrequently: true });
    const box = SIZE * (192 / 256);
    const s = Math.min(box / bw, box / bh);
    const dw = bw * s, dh = bh * s;
    o.drawImage(c, minx, miny, bw, bh, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);

    /* assertions, so we verify rather than hope */
    const chk = o.getImageData(0, 0, SIZE, SIZE).data;
    let opaque = 0, clear = 0, part = 0, whiteKept = 0, navyKept = 0, sr = 0, sg = 0, sb = 0, sn = 0;
    for (let i = 0; i < chk.length; i += 4) {
      const A = chk[i + 3];
      if (A === 0) { clear++; continue; }
      if (A === 255) opaque++; else part++;
      if (A > 128) {
        sr += chk[i]; sg += chk[i + 1]; sb += chk[i + 2]; sn++;
        if (Math.min(chk[i], chk[i + 1], chk[i + 2]) > 225) whiteKept++;
        if (Math.abs(chk[i] - nr) < 24 && Math.abs(chk[i + 1] - ng) < 24 && Math.abs(chk[i + 2] - nb) < 24) navyKept++;
      }
    }
    const corner = (x, y) => chk[((y * SIZE + x) * 4) + 3];

    return {
      W, H, white: [Math.round(wr), Math.round(wg), Math.round(wb)], navy: med,
      hist, t0, t1,
      bbox: [minx, miny, bw, bh], ratio: (bw / bh).toFixed(3), grey,
      cleared: (cleared / (W * H) * 100).toFixed(1),
      solid: (solid / (W * H) * 100).toFixed(1),
      edge: (edge / (W * H) * 100).toFixed(1),
      opaque: (opaque / (SIZE * SIZE) * 100).toFixed(1),
      clearPct: (clear / (SIZE * SIZE) * 100).toFixed(1),
      partPct: (part / (SIZE * SIZE) * 100).toFixed(1),
      whiteKept, navyKept,
      ink: sn ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)] : [0, 0, 0],
      corners: [corner(2, 2), corner(SIZE - 3, 2), corner(2, SIZE - 3), corner(SIZE - 3, SIZE - 3)],
      png: out.toDataURL('image/png')
    };
  }, { src: dataUrl, SIZE, PAD });

  fs.mkdirSync(OUTDIR, { recursive: true });
  const file = path.join(OUTDIR, 'logo-cutout.png');
  fs.writeFileSync(file, Buffer.from(res.png.split(',')[1], 'base64'));

  const total = res.hist.reduce((a, b) => a + b, 0);
  console.log('source      ' + res.W + 'x' + res.H +
              '  page white rgb(' + res.white.join(',') + ')  tile navy rgb(' + res.navy.join(',') + ')');
  console.log('ink spread  ' + res.hist.map((v, i) => (i * 16) + ':' + (v / total * 100).toFixed(1))
    .filter(s => !s.endsWith(':0.0')).join('  ') + '   (% of pixels by ink distance)');
  console.log('keyed       background ' + res.cleared + '%  solid ink ' + res.solid +
              '%  soft edge ' + res.edge + '%');
  console.log('strokes     bbox ' + res.bbox.join(' ') + '  ' + res.bbox[2] + 'x' + res.bbox[3] +
              ' (' + res.ratio + ':1)  mean ink rgb(' + res.ink.join(',') + ')');
  console.log('output      brand/out/logo-cutout.png  ' +
              (fs.statSync(file).size / 1024).toFixed(0) + ' KB  opaque ' + res.opaque +
              '%  soft ' + res.partPct + '%  transparent ' + res.clearPct + '%');
  console.log('assertions  white kept ' + res.whiteKept + ' px, navy kept ' + res.navyKept +
              ' px, grey kept ' + res.grey + ' px (all want 0), corner alpha ' + res.corners.join('/'));

  await browser.close();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
