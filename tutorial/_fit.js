/* The tick in c4 is not a textbook two-straight-stroke tick: fitting run centres
   to it plateaus around 77% overlap because the ends are rounder and the arms
   slightly different from the ideal. So don't guess the geometry - search it.

   Start from the three things that ARE unambiguous (leftmost ink = the short
   arm's cap, rightmost = the long arm's cap, lowest = the vertex, each pulled
   back by half a stroke) and then coordinate-descend all seven numbers until the
   drawn shape stops disagreeing with the PNG.

   Score by drawing the shape analytically (distance to a capsule), which is far
   faster than rasterising an SVG a hundred times.

   Run from tutorial/:  node _fit.js */
const fs = require('fs');
const path = require('path');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { chromium = require(PW_DIR).chromium; } catch (e) { chromium = require('playwright').chromium; }

const SRC = path.join(__dirname, '..', 'brand', 'out', 'logo-transparent.png');
const OUTDIR = path.join(__dirname, '..', 'brand', 'out');
const S = 1024, GRID = 256, f = n => +n.toFixed(1);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');

  const res = await page.evaluate(async ({ src, S, GRID }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, S, S).data;

    const mask = new Uint8Array(S * S);
    let area = 0, minx = S, miny = S, maxx = -1, maxy = -1;
    let lx = 0, ly = 0, ln = 0, rx = 0, ry = 0, rn = 0, bx = 0, by = 0, bn = 0;
    for (let y = 0, p = 0; y < S; y++) for (let x = 0; x < S; x++, p++) {
      if (d[p * 4 + 3] <= 128) continue;
      mask[p] = 1; area++;
      if (x < minx) { minx = x; ly = y; ln = 1; } else if (x === minx) { ly += y; ln++; }
      if (x > maxx) { maxx = x; ry = y; rn = 1; } else if (x === maxx) { ry += y; rn++; }
      if (y > maxy) { maxy = y; bx = x; bn = 1; } else if (y === maxy) { bx += x; bn++; }
      if (y < miny) miny = y;
    }

    /* distance from a pixel to a capsule, the actual shape of a round-capped stroke */
    const inCap = (px, py, ax, ay, bx2, by2, r) => {
      const dx = bx2 - ax, dy = by2 - ay;
      let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx - px, qy = ay + t * dy - py;
      return qx * qx + qy * qy <= r * r;
    };

    /* score on every second pixel - plenty for a search, and 4x faster */
    const score = (p) => {
      const r = p.t / 2;
      let both = 0, either = 0;
      for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
        const m = mask[y * S + x] === 1;
        const q = inCap(x, y, p.sx, p.sy, p.vx, p.vy, r) ||
                  inCap(x, y, p.vx, p.vy, p.lx, p.ly, r);
        if (m && q) both++;
        if (m || q) either++;
      }
      return both / either;
    };

    /* a rough thickness first: ink area over centreline length */
    let p = {
      sx: minx + 75, sy: ly / ln,
      vx: bx / bn, vy: maxy - 75,
      lx: maxx - 75, ly: ry / rn,
      t: 150
    };
    const len0 = Math.hypot(p.sx - p.vx, p.sy - p.vy) + Math.hypot(p.lx - p.vx, p.ly - p.vy);
    p.t = area / len0;

    const keys = ['sx', 'sy', 'vx', 'vy', 'lx', 'ly', 't'];
    const step = { sx: 48, sy: 48, vx: 48, vy: 48, lx: 48, ly: 48, t: 24 };
    let best = score(p);
    const trail = [best];
    for (let round = 0; round < 14; round++) {
      let moved = false;
      for (const k of keys) for (const dir of [1, -1]) {
        const q = Object.assign({}, p);
        q[k] = p[k] + dir * step[k];
        if (k === 't' && q.t < 20) continue;
        const v = score(q);
        if (v > best) { best = v; p = q; moved = true; }
      }
      trail.push(best);
      if (!moved) for (const k of keys) step[k] *= 0.55;
    }

    /* final numbers on the full resolution, and the SVG mark.js would draw */
    const full = (() => {
      const r = p.t / 2;
      let both = 0, either = 0, pngOnly = 0, svgOnly = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const m = mask[y * S + x] === 1;
        const q = inCap(x, y, p.sx, p.sy, p.vx, p.vy, r) ||
                  inCap(x, y, p.vx, p.vy, p.lx, p.ly, r);
        if (m && q) both++; else if (m) pngOnly++; else if (q) svgOnly++;
        if (m || q) either++;
      }
      return { iou: both / either, pngOnly: pngOnly / either, svgOnly: svgOnly / either };
    })();

    const k = GRID / S, G = n => +(n * k).toFixed(1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" ` +
      `width="${S}" height="${S}">\n  <path d="M${G(p.sx)} ${G(p.sy)} L${G(p.vx)} ${G(p.vy)} ` +
      `L${G(p.lx)} ${G(p.ly)}" fill="none" stroke="#fff" stroke-width="${G(p.t)}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>\n</svg>`;

    /* and prove the SVG renderer draws the same thing the search scored */
    const back = new Image();
    back.src = 'data:image/svg+xml;base64,' + btoa(svg);
    await back.decode();
    const c2 = document.createElement('canvas');
    c2.width = S; c2.height = S;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    x2.drawImage(back, 0, 0);
    const e = x2.getImageData(0, 0, S, S).data;
    let both = 0, either = 0;
    for (let p2 = 0; p2 < S * S; p2++) {
      const m = mask[p2] === 1, q = e[p2 * 4 + 3] > 128;
      if (m && q) both++;
      if (m || q) either++;
    }

    return {
      p, area, bbox: [minx, miny, maxx, maxy],
      iou: full.iou, pngOnly: full.pngOnly, svgOnly: full.svgOnly,
      svgIou: both / either,
      trail: trail.map(v => (v * 100).toFixed(1)).join(' '),
      grid: {
        short: [G(p.sx), G(p.sy)], vertex: [G(p.vx), G(p.vy)],
        long: [G(p.lx), G(p.ly)], w: G(p.t)
      },
      svg
    };
  }, { src: dataUrl, S, GRID });

  fs.writeFileSync(path.join(OUTDIR, 'logo-trace.svg'), res.svg);

  console.log('start       ink bbox ' + res.bbox.join(' ') + '  area ' + res.area + 'px');
  console.log('search      IoU per round: ' + res.trail);
  console.log('fit         short arm ' + f(res.p.sx) + ',' + f(res.p.sy) +
              '   vertex ' + f(res.p.vx) + ',' + f(res.p.vy) +
              '   long arm ' + f(res.p.lx) + ',' + f(res.p.ly) +
              '   thickness ' + f(res.p.t) + 'px');
  console.log('overlap     IoU ' + (res.iou * 100).toFixed(1) + '%  (only-PNG ' +
              (res.pngOnly * 100).toFixed(1) + '%, only-SVG ' + (res.svgOnly * 100).toFixed(1) + '%)');
  console.log('svg render  IoU ' + (res.svgIou * 100).toFixed(1) + '%  (the SVG draws what was scored)');
  console.log('on the 256 grid  M' + res.grid.short.join(' ') + ' L' + res.grid.vertex.join(' ') +
              ' L' + res.grid.long.join(' ') + '   stroke-width ' + res.grid.w);
  console.log('output      brand/out/logo-trace.svg');

  await browser.close();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
