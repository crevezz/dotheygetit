/* The master ad template and its render pipeline.
 *
 *   node marketing/ad.js                 every ad, every size, at 2x
 *   node marketing/ad.js nodding         just the ads whose id matches
 *   AD_SCALE=3 node marketing/ad.js      3x pixels (print / billboard)
 *
 * One template, one set of tokens, every canvas. Copy lives in the ADS
 * array below - that is the only thing you edit to make a new advert.
 *
 * The render is gated: if any line overflows the frame or any text renders
 * below MIN_PX device pixels, the run fails and tells you which ad. Nothing
 * half-broken reaches the out folder.
 */
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const T = require('./tokens');
const { page } = require('./template');
const { ADS } = require('./ads');

const OUT = path.join(__dirname, 'out', 'ads');
const MIN_PX = T.MIN_PX;               // smallest acceptable device-pixel text height
const MIN_HEAD_PX = T.MIN_HEAD_PX;



/* --------------------------------------------------------- the QA gate */
/* Runs inside the page. Returns every reason this ad should not ship. */
function audit(limits) {
  const faults = [];
  const rect = (el) => el.getBoundingClientRect();
  const u = innerHeight < innerWidth ? innerHeight / 100 : innerWidth / 100;

  for (const el of document.querySelectorAll('.card > *')) {
    const r = rect(el);
    if (r.bottom > innerHeight + 1 || r.top < -1) faults.push(el.className + ' overflows the frame');
  }
  for (const el of document.querySelectorAll('.a, .b, .badge, .foot')) {
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < limits.min) faults.push(el.className + ' text only ' + px.toFixed(0) + 'px');
    const r = rect(el);
    if (r.left < -1 || r.right > innerWidth + 1) faults.push(el.className + ' runs off the side');
  }
  const headPx = Math.round(parseFloat(getComputedStyle(document.querySelector('.a')).fontSize));
  if (headPx < limits.minHead) faults.push('headline only ' + headPx + 'px');

  /* Contrast. This is the check that matters most and the one that was missing:
     a text colour left unset falls back to the browser's black, which on this
     navy is invisible. Transparent text is fine only if it is really being
     used to clip a gradient - if it is not, it renders as nothing at all. */
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const nums = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const bg = [7, 10, 26]; // the stage colour every card sits on
  for (const el of document.querySelectorAll('.a, .b, .badge, .foot span')) {
    const cs = getComputedStyle(el);
    const c = nums(cs.color);
    const rgb = c.slice(0, 3);
    const alpha = c.length > 3 ? c[3] : 1;
    if (alpha === 0) {
      const clipped = (cs.webkitBackgroundClip || cs.backgroundClip) === 'text' && cs.backgroundImage !== 'none';
      if (!clipped) faults.push(el.className + ' is transparent with no gradient behind it - it renders as nothing');
      continue;
    }
    const gap = Math.abs(lum(rgb) - lum(bg));
    if (gap < 90) faults.push(el.className + ' is ' + cs.color + ' on the navy stage - contrast only ' + Math.round(gap));
  }

  const rt = rect(document.querySelector('.type'));
  return {
    faults,
    headPx,
    roomTop: Math.round(rt.top / u),
    roomBottom: Math.round((innerHeight - rt.bottom) / u),
  };
}

/* ------------------------------------------------------------- contact sheet */
/* The human-check step: every render on one page, at real aspect ratio. */
function sheet(made) {
  const tiles = made.map((m) => `<figure>
  <img src="${path.basename(m.file)}" alt="${m.ad.id} ${m.size.id}" loading="lazy">
  <figcaption>${m.ad.id} &middot; ${m.size.id} &middot; ${m.w * T.SCALE}&times;${m.h * T.SCALE}</figcaption>
</figure>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Ad contact sheet</title>
<style>
body{margin:0;padding:40px;background:${T.colors.bg};color:${T.colors.text};
 font-family:${T.type.family}}
h1{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
p{color:${T.colors.muted};font-size:14px;margin:0 0 34px}
.grid{display:grid;gap:28px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
figure{margin:0}
img{width:100%;height:auto;display:block;border-radius:10px;border:1px solid ${T.colors.line}}
figcaption{margin-top:9px;font-size:12.5px;color:${T.colors.muted};letter-spacing:.02em}
</style>
<h1>Ad contact sheet</h1><p>${made.length} renders &middot; ${T.SCALE}&times; &middot; check every one before it ships</p>
<div class="grid">
${tiles}
</div>`;
}

/* ------------------------------------------------------------------ run */
(async () => {
  const filter = process.argv[2];
  const ads = filter ? ADS.filter((a) => a.id.includes(filter)) : ADS;
  if (!ads.length) throw new Error('no ads match "' + filter + '"');

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const made = [];

  for (const size of T.sizes) {
    const ctx = await browser.newContext({
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: T.SCALE, // the whole point: 2x pixels, crisp type
    });
    const pg = await ctx.newPage();
    for (const ad of ads) {
      await pg.setContent(page(ad, size), { waitUntil: 'load' });
      await pg.waitForTimeout(120); // let webfonts/gradients settle

      const qa = await pg.evaluate(audit, { min: T.MIN_PX, minHead: T.MIN_HEAD_PX });
      const file = path.join(OUT, `${ad.id}-${size.id}@${T.SCALE}x.png`);
      if (qa.faults.length) {
        console.log(`  FAIL  ${ad.id}-${size.id}\n          ` + qa.faults.join('\n          '));
        await ctx.close();
        await browser.close();
        process.exit(1);
      }
      await pg.screenshot({ path: file });
      made.push({ file, ad, size, w: size.w, h: size.h, qa });
      console.log(`  ok    ${(ad.id + '-' + size.id).padEnd(22)}${size.w * T.SCALE}x${size.h * T.SCALE}` +
        `  head ${qa.headPx}px  headroom ${qa.roomTop}vh top / ${qa.roomBottom}vh bottom  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'index.html'), sheet(made));
  fs.writeFileSync(path.join(__dirname, '_ad.html'), page(ADS[0], T.sizes[0]));
  console.log(`\n  ${made.length} ads -> marketing/out/ads  (open index.html to review)`);
})();
