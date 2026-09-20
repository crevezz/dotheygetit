/* Trace the tick out of the transparent PNG into the geometry brand/mark.js
   needs, then render that SVG back at the same size and measure the overlap.

   Method, so this is a measurement and not a guess:
     - take the mask, one row at a time, and find the runs of ink
     - rows in the upper half have TWO runs: left = short arm, right = long arm
     - fit x = a*y + b to each arm's run centres  -> the two centrelines
     - vertex    = where the two lines cross
     - thickness = horizontal run length * sin(angle of that arm)
     - a tip's cap centre = the farthest ink along that arm, pulled back by half
       the thickness (a round cap sticks out by exactly that much)
     - the run lengths and the area disagree a little, so sweep the thickness and
       let the measured overlap with the PNG choose, rather than picking one

   Run from tutorial/:  node _trace.js */
const fs = require('fs');
const path = require('path');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { chromium = require(PW_DIR).chromium; } catch (e) { chromium = require('playwright').chromium; }

const SRC = path.join(__dirname, '..', 'brand', 'out', 'logo-transparent.png');
const OUTDIR = path.join(__dirname, '..', 'brand', 'out');
const S = 1024;    // PNG size
const GRID = 256;  // mark.js draws on a 256 grid
const f = n => +n.toFixed(1);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');

  /* ---- 1. measure the shape, and leave a scorer behind for the sweep --------- */
  const geom = await page.evaluate(async ({ src, S, GRID }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, S, S).data;

    /* keep the mask in the page so scoring a candidate does not re-decode it */
    const mask = new Uint8Array(S * S);
    let area = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) if (d[i + 3] > 128) { mask[p] = 1; area++; }
    window.__mask = mask;
    const on = (x, y) => x >= 0 && y >= 0 && x < S && y < S && mask[y * S + x] === 1;

    const runs = [];
    for (let y = 0; y < S; y++) {
      const row = []; let start = -1;
      for (let x = 0; x < S; x++) {
        if (on(x, y)) { if (start < 0) start = x; }
        else if (start >= 0) { row.push([start, x - 1]); start = -1; }
      }
      if (start >= 0) row.push([start, S - 1]);
      runs.push(row);
    }

    const two = runs.map((row, y) => row.length === 2 ? y : -1).filter(y => y >= 0);
    const inked = runs.map((row, y) => row.length ? y : -1).filter(y => y >= 0);
    const top = inked[0], bot = inked[inked.length - 1];

    const fit = (pts) => {
      const n = pts.length;
      const my = pts.reduce((s, p) => s + p[0], 0) / n;
      const mx = pts.reduce((s, p) => s + p[1], 0) / n;
      let num = 0, den = 0;
      pts.forEach(p => { num += (p[0] - my) * (p[1] - mx); den += (p[0] - my) ** 2; });
      const a = num / den;
      return { a, b: mx - a * my };
    };

    const shortPts = [], longPts = [], shortRuns = [], longRuns = [];
    for (let y = top; y <= two[two.length - 1]; y++) {
      const row = runs[y];
      if (!row.length) continue;
      const right = row[row.length - 1];
      longPts.push([y, (right[0] + right[1]) / 2]);
      longRuns.push(right[1] - right[0] + 1);
      if (row.length === 2) {
        const left = row[0];
        shortPts.push([y, (left[0] + left[1]) / 2]);
        shortRuns.push(left[1] - left[0] + 1);
      }
    }
    const L1 = fit(shortPts), L2 = fit(longPts);

    /* straight arms, so they cross at the vertex */
    const vy = (L2.b - L1.b) / (L1.a - L2.a);
    const V = [L1.a * vy + L1.b, vy];

    /* the fit is x = a*y + b, so the direction is (a, 1), and d points DOWN */
    const dirOf = (L) => { const n = Math.hypot(L.a, 1); return [L.a / n, 1 / n]; };
    const d1 = dirOf(L1), d2 = dirOf(L2);

    const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
    const t1 = med(shortRuns) * Math.abs(d1[1]);
    const t2 = med(longRuns) * Math.abs(d2[1]);

    /* farthest ink along an arm, pulled back half a width = that arm's cap centre */
    const away = (dir, w) => {
      let best = -1e9;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!on(x, y)) continue;
        const s = (x - V[0]) * dir[0] + (y - V[1]) * dir[1];
        if (s > best) best = s;
      }
      return [V[0] + dir[0] * (best - w / 2), V[1] + dir[1] * (best - w / 2)];
    };

    const k = GRID / S;
    window.__cand = (t) => {
      const short = away([-d1[0], -d1[1]], t);   // d points down, so the tip is -d
      const lg = away([-d2[0], -d2[1]], t);
      const P = p => +((p * k).toFixed(1));
      return {
        short, long: lg, t,
        w256: +((t * k).toFixed(1)),
        len: Math.hypot(short[0] - V[0], short[1] - V[1]) +
             Math.hypot(lg[0] - V[0], lg[1] - V[1]),
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" ` +
             `width="${S}" height="${S}">\n  <path d="M${P(short[0])} ${P(short[1])} ` +
             `L${P(V[0])} ${P(V[1])} L${P(lg[0])} ${P(lg[1])}" fill="none" stroke="#fff" ` +
             `stroke-width="${+(t * k).toFixed(1)}" stroke-linecap="round" ` +
             `stroke-linejoin="round"/>\n</svg>`
      };
    };

    return {
      rows: { top, splitTop: two[0], splitBot: two[two.length - 1], bot },
      V, d1, d2, t1, t2, area,
      angles: [Math.atan2(d1[1], d1[0]) * 180 / Math.PI, Math.atan2(d2[1], d2[0]) * 180 / Math.PI]
    };
  }, { src: dataUrl, S, GRID });

  const candAt = (t) => page.evaluate((t) => {
    const c = window.__cand(t);
    return { t: c.t, w256: c.w256, short: c.short, long: c.long, len: c.len, svg: c.svg };
  }, t);

  const score = (svg) => page.evaluate(async ({ svg, S }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const e = x.getImageData(0, 0, S, S).data;
    let both = 0, either = 0, pngOnly = 0, svgOnly = 0;
    for (let i = 3, p = 0; i < e.length; i += 4, p++) {
      const q = e[i] > 128, r = window.__mask[p] === 1;
      if (r && q) both++; else if (r) pngOnly++; else if (q) svgOnly++;
      if (r || q) either++;
    }
    return { iou: both / either, pngOnly: pngOnly / either, svgOnly: svgOnly / either };
  }, { svg, S });

  /* ---- 2. sweep the thickness, letting the PNG decide ------------------------ */
  const tArea = geom.area / (await candAt((geom.t1 + geom.t2) / 2)).len;
  const lo = Math.round(Math.min(tArea, geom.t1, geom.t2) * 0.88);
  const hi = Math.round(Math.max(geom.t1, geom.t2) * 1.10);
  let best = null;
  const tried = [];
  for (let t = lo; t <= hi; t += 2) {
    const cand = await candAt(t);
    const sc = await score(cand.svg);
    tried.push(t + ':' + (sc.iou * 100).toFixed(0));
    process.stdout.write(t + ' -> IoU ' + (sc.iou * 100).toFixed(1) + '%\n');
    if (!best || sc.iou > best.sc.iou) best = { cand, sc };
  }
  const b = best.cand, s = best.sc;

  fs.writeFileSync(path.join(OUTDIR, 'logo-trace.svg'), b.svg);
  console.log('');
  console.log('rows        ink ' + geom.rows.top + '..' + geom.rows.bot +
              '   two separate arms on rows ' + geom.rows.splitTop + '..' + geom.rows.splitBot);
  console.log('angles      ' + f(geom.angles[0]) + ' deg and ' + f(geom.angles[1]) +
              ' deg from horizontal');
  console.log('thickness   short arm ' + f(geom.t1) + 'px, long arm ' + f(geom.t2) +
              'px, area/length ' + f(tArea) + 'px  ->  sweep picked ' + f(b.t) +
              'px = ' + b.w256 + ' on the 256 grid');
  console.log('short arm   tip ' + f(b.short[0]) + ',' + f(b.short[1]));
  console.log('vertex      ' + f(geom.V[0]) + ',' + f(geom.V[1]));
  console.log('long arm    tip ' + f(b.long[0]) + ',' + f(b.long[1]));
  console.log('sweep       ' + tried.join(' '));
  console.log('overlap     IoU ' + (s.iou * 100).toFixed(1) + '% vs the PNG   (only-PNG ' +
              (s.pngOnly * 100).toFixed(1) + '%, only-SVG ' + (s.svgOnly * 100).toFixed(1) + '%)');
  console.log('output      brand/out/logo-trace.svg');

  await browser.close();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
