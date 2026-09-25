/* Layout audit for the beat engine. Catches the things an eye would catch:
 * text running off the safe area, a scene taller than the frame, a picture
 * colliding with the caption, anything clipped.
 *
 *   node marketing/_beatqa.js              all scripts
 *   node marketing/_beatqa.js plainly
 *
 * Two bugs made this audit useless for a whole session:
 *   1. it read the safe-area padding off .card, which has none, so the "safe
 *      box" was the entire frame and nothing could ever fail;
 *   2. it only looked inside .scene, and .wmark is a sibling of the scenes on
 *      .card - so the one element that really was outside was never checked.
 * Both are fixed, and the check was verified to fail by putting the watermark
 * back where it used to be.
 */
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const T = require('./tokens');
const S = require('./scenes');
const { cfgFor } = require('./beats.config');
const { page, paramsFor } = require('./beat-film');

const SCRIPTS = path.join(__dirname, 'scripts');
const size = T.sizes.find((s) => s.id === 'story');
const only = process.argv[2] && fs.existsSync(path.join(SCRIPTS, process.argv[2] + '.json')) ? process.argv[2] : null;

const SEL = '.ln,.q,.phq,.ul li,.domtxt,.domsub,.dombrand,.domcta,.cn,.cl,.sheet,.book,' +
  '.stack,.ph,.res,.lap,.board,.rw,.fig,.clock,.sticky,.tab';

const PROBE = (sel) => {
  const cr = document.querySelector('.card').getBoundingClientRect();
  /* the safe box is the .scene padded area - NOT the .card */
  const cs = getComputedStyle(document.querySelector('.scene'));
  const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat);
  const box = { t: cr.top + pad[0], r: cr.right - pad[1], b: cr.bottom - pad[2], l: cr.left + pad[3] };
  const bad = [];

  function test(label, el) {
    if (+getComputedStyle(el).opacity < 0.02) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const over = [];
    if (r.bottom > box.b + 1) over.push('below ' + (r.bottom - box.b).toFixed(0) + 'px');
    if (r.top < box.t - 1) over.push('above ' + (box.t - r.top).toFixed(0) + 'px');
    if (r.right > box.r + 1) over.push('right ' + (r.right - box.r).toFixed(0) + 'px');
    if (r.left < box.l - 1) over.push('left ' + (box.l - r.left).toFixed(0) + 'px');
    if (over.length) bad.push(label + ': ' + over.join(', '));
  }

  document.querySelectorAll('.scene').forEach((sc, i) => {
    if (+sc.style.opacity < 0.02) return;
    sc.querySelectorAll(sel).forEach((el) => test('scene' + i + ' ' + (el.className.split(' ')[0] || el.tagName), el));
    const st = sc.querySelector('.stage');
    if (st && st.scrollHeight > st.clientHeight + 2) {
      bad.push('scene' + i + ' stage clipped by ' + (st.scrollHeight - st.clientHeight).toFixed(0) + 'px');
    }
  });

  /* .wmark is a sibling of the scenes, so it needs its own pass */
  document.querySelectorAll('.wmark').forEach((el) => test('wmark', el));

  const body = document.scrollingElement;
  if (body.scrollHeight > window.innerHeight + 1) bad.push('page scrolls ' + (body.scrollHeight - window.innerHeight) + 'px');
  /* index BEFORE filtering - map((s,i)) after filter() reports the position in
     the filtered list, so every entry was mislabelled as beat 0.
     Growing the picture to fill its space is the point, so only a SHRINK is a
     problem: under 0.95 means the art could not fit and had to be reduced. */
  const shrunk = (window.__fit || []).map((s, i) => [i, s]).filter((p) => p[1] < 0.95)
    .map((p) => 'beat' + p[0] + ' x' + p[1]);
  if (shrunk.length) bad.push('scaled down ' + shrunk.join(' '));
  const grew = (window.__fit || []).map((s, i) => [i, s]).filter((p) => p[1] > 1.02)
    .map((p) => 'beat' + p[0] + ' x' + p[1]);
  return bad;
};

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 })).newPage();
  let problems = 0;
  for (const f of fs.readdirSync(SCRIPTS).filter((x) => x.endsWith('.json')).sort()) {
    const script = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
    const id = script.id || path.basename(f, '.json');
    if (only && id !== only) continue;
    const cfg = cfgFor(id);
    const beats = [];
    let start = 0;
    script.beats.forEach((beat, i) => {
      const scene = cfg.overrides[i] || S.pick(beat, cfg);
      const dur = Math.max(1.8, Number(beat.seconds) || 3);
      beats.push({ beat, spec: { scene, params: paramsFor(scene, i, beat, cfg) }, start, dur, mp3: null, vo: 0 });
      start += dur;
    });
    await pg.setContent(page(id, script, cfg, size, beats), { waitUntil: 'load' });
    await pg.waitForTimeout(60);
    for (let i = 0; i < beats.length; i++) {
      for (const ph of [0.55, 0.78, 0.97]) {
        await pg.evaluate((x) => window.__at(x), beats[i].start + beats[i].dur * ph);
        await pg.waitForTimeout(20);
        const bad = await pg.evaluate(PROBE, SEL);
        if (bad.length) { problems += bad.length; console.log(`  ${id} beat${i} @${ph}: ${bad.join(' | ')}`); }
      }
    }
    console.log(`  checked ${id}`);
  }
  await browser.close();
  console.log(problems ? `\n  ${problems} layout problems` : '\n  clean: nothing leaves the safe area');
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
