/* Verify the audit's safe box is real, and show where the risky elements sit.
   Prints the box, then the lowest/brightest elements with their distance from
   each frame edge, so the numbers can be checked by hand. */
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const T = require('./tokens');
const S = require('./scenes');
const { cfgFor } = require('./beats.config');
const { page, paramsFor } = require('./beat-film');

const size = T.sizes.find((s) => s.id === 'story');
const id = process.argv[2] || 'nod';

const PROBE = () => {
  const cr = document.querySelector('.card').getBoundingClientRect();
  const cs = getComputedStyle(document.querySelector('.scene'));
  const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat);
  const box = { t: cr.top + pad[0], r: cr.right - pad[1], b: cr.bottom - pad[2], l: cr.left + pad[3] };
  const rows = ['BOX ' + cr.width + 'x' + cr.height +
    '  pad t' + pad[0].toFixed(0) + ' r' + pad[1].toFixed(0) + ' b' + pad[2].toFixed(0) + ' l' + pad[3].toFixed(0) +
    '  => safe top' + box.t.toFixed(0) + ' bottom' + box.b.toFixed(0) + ' left' + box.l.toFixed(0) + ' right' + box.r.toFixed(0)];
  const seen = [];
  document.querySelectorAll('.scene').forEach((sc) => {
    if (+sc.style.opacity === 0) return;
    sc.querySelectorAll('.ln,.wmark,.domtxt,.domsub,.domcta,.dombrand,.sheet,.book,.stack,.ph,.res,.lap,.board,.rw,.fig,.clock,.tab,.q,.cn,.cl').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const v = [];
      if (r.bottom > box.b + 1) v.push('BELOW+' + (r.bottom - box.b).toFixed(0));
      if (r.top < box.t - 1) v.push('ABOVE+' + (box.t - r.top).toFixed(0));
      if (r.right > box.r + 1) v.push('RIGHT+' + (r.right - box.r).toFixed(0));
      if (r.left < box.l - 1) v.push('LEFT+' + (box.l - r.left).toFixed(0));
      if (v.length) seen.push('  ' + (el.className || el.tagName) + '  ' + v.join(' '));
    });
  });
  return rows.concat(seen.length ? seen : ['  nothing outside the box']);
};

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 })).newPage();
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'scripts', id + '.json'), 'utf8'));
  const cfg = cfgFor(script.id || id);
  const beats = [];
  let start = 0;
  script.beats.forEach((beat, i) => {
    const scene = cfg.overrides[i] || S.pick(beat, cfg);
    const dur = Math.max(1.8, Number(beat.seconds) || 3);
    beats.push({ beat, spec: { scene, params: paramsFor(scene, i, beat, cfg) }, start, dur, mp3: null, vo: 0 });
    start += dur;
  });
  await pg.setContent(page(id, script, cfg, size, beats), { waitUntil: 'load' });
  await pg.waitForTimeout(80);
  for (let i = 0; i < beats.length; i++) {
    await pg.evaluate((x) => window.__at(x), beats[i].start + beats[i].dur * 0.97);
    await pg.waitForTimeout(20);
    const out = await pg.evaluate(PROBE);
    console.log('\n--- ' + id + ' beat' + i + ' [' + beats[i].spec.scene + ']');
    out.forEach((l) => console.log(l));
  }
  console.log('\n  fit: ' + JSON.stringify(await pg.evaluate(() => window.__fit)));
  await browser.close();
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
