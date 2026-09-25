/* Ink audit: how much of the safe stage does each beat's drawn content occupy?

   _fill.js v1 measured the stage's first child, so the desk and corridor scenes
   (whose wrapper is height:100%) always reported a perfect fill even though the
   desk gear is bottom-anchored with a large void above it. This measures the
   real INK: every visible drawn descendant, excluding the full-bleed decorative
   layers (.tab, .arm, .rw scale wrappers) that are not "content". */
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const T = require('./tokens');
const S = require('./scenes');
const { cfgFor } = require('./beats.config');
const { page, paramsFor } = require('./beat-film');

const size = T.sizes.find((s) => s.id === 'story');
const ids = process.argv.slice(2);
const list = ids.length ? ids : ['nod'];

const PROBE = () => {
  const H = document.querySelector('.card').getBoundingClientRect().height;
  const DECOR = ['tab'];
  const out = [];
  document.querySelectorAll('.scene').forEach((sc, i) => {
    const st = sc.querySelector('.stage');
    const cap = sc.querySelector('.cap');
    if (!st) { out.push({ i, scene: sc.getAttribute('data-i'), capOnly: cap ? Math.round(cap.getBoundingClientRect().height) : 0 }); return; }
    const s = st.getBoundingClientRect();
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, n = 0;
    const kids = [].slice.call(st.querySelectorAll('*'));
    kids.forEach((e) => {
      if (DECOR.some((c) => e.classList.contains(c))) return;
      if (e.classList.contains('arm')) return;
      const cs = getComputedStyle(e);
      if (+cs.opacity < 0.02) return;
      if (cs.visibility === 'hidden') return;
      const b = e.getBoundingClientRect();
      if (!b.width && !b.height) return;
      // skip pure layout wrappers: they are the whole stage
      if (b.height >= s.height - 2 && b.width >= s.width - 2) return;
      minY = Math.min(minY, b.top); maxY = Math.max(maxY, b.bottom);
      minX = Math.min(minX, b.left); maxX = Math.max(maxX, b.right);
      n++;
    });
    const rec = { i, scene: sc.getAttribute('data-i'), nodes: n, stageH: sc.querySelector('.stage').clientHeight, stageW: sc.querySelector('.stage').clientWidth, stageTop: Math.round(s.top), stageBot: Math.round(s.bottom), sw: window.__fit[i] };
    const sc2 = window.__fit[i] || 1;
    if (isFinite(minY)) {
      /* fit() scales .stage about its centre, so undo the scale about that same
         centre before comparing the ink with the real stage box */
      const cy = (s.top + s.bottom) / 2, ch = sc2 * rec.stageH;
      const boxTop = cy - ch / 2, boxBot = cy + ch / 2;
      rec.inkH = Math.round((maxY - minY) / sc2);
      rec.inkW = Math.round((maxX - minX) / sc2);
      rec.gapTop = Math.round((minY - boxTop) / sc2);
      rec.gapBot = Math.round((boxBot - maxY) / sc2);
      rec.fill = Math.round(100 * rec.inkH / rec.stageH);
      rec.gapW = Math.round(rec.stageW - rec.inkW);
    }
    if (cap) rec.capH = Math.round(cap.getBoundingClientRect().height);
    out.push(rec);
  });
  return { rows: out, H: Math.round(H) };
};

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 })).newPage();
  for (const id of list) {
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
    console.log('\n================ ' + id);
    for (let i = 0; i < beats.length; i++) {
      await pg.evaluate((x) => window.__at(x), beats[i].start + beats[i].dur * 0.97);
      await pg.waitForTimeout(15);
      const r = (await pg.evaluate(PROBE)).rows[i];
      if (r.capOnly !== undefined) { console.log('  beat' + r.i + ' [' + r.scene + ']  TEXT ONLY  cap' + r.capOnly); continue; }
      console.log('  beat' + r.i + ' [' + r.scene + ']  stage ' + r.stageH + 'h  ink ' + r.inkH + 'h/' + r.inkW + 'w  FILL ' +
        String(r.fill).padStart(3) + '%   void above ' + String(r.gapTop).padStart(4) + '  below ' + String(r.gapBot).padStart(4) +
        '  side ' + r.gapW + '  scale ' + r.sw + (r.capH ? '  cap' + r.capH : ''));
    }
  }
  await browser.close();
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
