const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const T = require('./tokens');
const S = require('./scenes');
const { cfgFor } = require('./beats.config');
const { page, paramsFor } = require('./beat-film');
const size = T.sizes.find((s) => s.id === 'story');
const id = process.argv[2] || 'ninepm';

(async () => {
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
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 })).newPage();
  await pg.setContent(page(id, script, cfg, size, beats), { waitUntil: 'load' });
  await pg.waitForTimeout(80);
  const info = await pg.evaluate(() => [].slice.call(document.querySelectorAll('.scene')).map((s, i) => ({
    i, attr: s.getAttribute('data-scene'), cls: s.className,
    stage: !!s.querySelector('.stage'),
    bg: getComputedStyle(s).backgroundImage.slice(0, 46),
    cap: (s.querySelector('.cap .ln') || {}).textContent || '',
  })));
  info.forEach((r) => console.log(JSON.stringify(r)));
  console.log('fit ' + JSON.stringify(await pg.evaluate(() => window.__fit)));
  console.log('plan scenes ' + JSON.stringify(beats.map((b) => b.spec.scene)));
  await browser.close();
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
