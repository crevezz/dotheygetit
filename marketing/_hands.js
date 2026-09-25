/* _hands.js - is the raised hand actually visible?
   Two independent checks, because a still I cannot look at is not evidence:
   1. DOM: every `.pup[data-up] .arm` / `.hand` rect, opacity, height above its
      pupil's head, and distance from the safe box edges.
   2. PIXELS: decode the rendered still with ffmpeg and count warm skin pixels
      (r - b high) in a patch at each hand centre, so a hand that is drawn but
      clipped away (clip-path clips the whole subtree) shows up as MISSING.
   usage: node marketing/_hands.js quiet [beatIndex] */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);
const T = require('./tokens');
const S = require('./scenes');
const { cfgFor } = require('./beats.config');
const { page, paramsFor } = require('./beat-film');

const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();

const size = T.sizes.find((s) => s.id === 'story');
const id = process.argv[2] || 'quiet';
const BI = Number(process.argv[3] || 0);

const PROBE = () => {
  const cr = document.querySelector('.card').getBoundingClientRect();
  const cs = getComputedStyle(document.querySelectorAll('.scene')[0]);
  const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat);
  const box = { t: cr.top + pad[0], r: cr.right - pad[1], b: cr.bottom - pad[2], l: cr.left + pad[3] };
  const out = ['BOX top' + box.t.toFixed(0) + ' bottom' + box.b.toFixed(0) + ' left' + box.l.toFixed(0) + ' right' + box.r.toFixed(0)];
  const hands = [];
  document.querySelectorAll('.pup[data-up="1"]').forEach((pup, i) => {
    const arm = pup.querySelector('.arm'), hd = pup.querySelector('.hand'), head = pup.querySelector('.hd');
    const pa = pup.getBoundingClientRect(), ra = arm.getBoundingClientRect(), rh = hd.getBoundingClientRect();
    const v = [];
    if (rh.bottom > box.b + 1) v.push('BELOW+' + (rh.bottom - box.b).toFixed(0));
    if (rh.top < box.t - 1) v.push('ABOVE+' + (box.t - rh.top).toFixed(0));
    if (rh.right > box.r + 1) v.push('RIGHT+' + (rh.right - box.r).toFixed(0));
    if (rh.left < box.l - 1) v.push('LEFT+' + (box.l - rh.left).toFixed(0));
    const ch = getComputedStyle(hd);
    hands.push({
      i, side: pup.getAttribute('data-side') || 'r',
      armOpacity: +getComputedStyle(arm).opacity,
      hand: [Math.round(rh.left), Math.round(rh.top), Math.round(rh.width), Math.round(rh.height)],
      arm: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width), Math.round(ra.height)],
      aboveHead: Math.round((head.getBoundingClientRect().top - rh.top) / (pa.height / 15)),
      handW: +(rh.width / (pa.height / 15)).toFixed(2),
      colour: ch.backgroundImage.slice(0, 60),
      clip: getComputedStyle(arm).clipPath,
      box: v.join(' ') || 'inside',
    });
  });
  return { box: out[0], hands };
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
  await pg.evaluate((x) => window.__at(x), beats[BI].start + beats[BI].dur * 0.97);
  await pg.waitForTimeout(30);

  const r = await pg.evaluate(PROBE);
  console.log('\n--- ' + id + ' beat' + BI + ' [' + beats[BI].spec.scene + ']  params ' + JSON.stringify(beats[BI].spec.params));
  console.log(r.box);
  r.hands.forEach((h) => console.log('  pup' + h.i + ' side ' + h.side + '  armOpacity ' + h.armOpacity +
    '  hand ' + h.hand.join(',') + '  ' + h.handW + 'u wide  clears head by ' + h.aboveHead + 'u  ' + h.box + '  armClip ' + h.clip));

  const shot = path.join(__dirname, 'out', 'beats', '_hands-' + id + '-' + BI + '.jpg');
  await pg.screenshot({ path: shot, type: 'jpeg', quality: 95 });
  await browser.close();

  const raw = path.join(__dirname, 'out', 'beats', '_hands.raw');
  spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', shot, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  const buf = fs.readFileSync(raw);
  const W = size.w, H = size.h, at = (x, y) => { const o = (y * W + x) * 3; return [buf[o], buf[o + 1], buf[o + 2]]; };
  const warm = (p) => p[0] - p[2] > 26 && p[0] > 115 && p[1] > 80;

  console.log('\n  pixel check (the honest one - a drawn hand inside a clipped ' +
    'sleeve is invisible):');
  let allWarm = 0, sx = 0, sy = 0;
  const bbox = { l: 1e9, t: 1e9, r: -1, b: -1 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!warm(at(x, y))) continue;
    allWarm++; sx += x; sy += y;
    if (x < bbox.l) bbox.l = x; if (y < bbox.t) bbox.t = y;
    if (x > bbox.r) bbox.r = x; if (y > bbox.b) bbox.b = y;
  }
  console.log('  skin-tone pixels in the whole frame: ' + allWarm +
    (allWarm ? '  bbox ' + bbox.l + ',' + bbox.t + ' -> ' + bbox.r + ',' + bbox.b : ''));
  r.hands.forEach((h) => {
    const cx = h.hand[0] + h.hand[2] / 2, cy = h.hand[1] + h.hand[3] / 2;
    let n = 0, tot = 0;
    for (let y = Math.round(cy - 8); y <= cy + 8; y++) for (let x = Math.round(cx - 8); x <= cx + 8; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      tot++; if (warm(at(x, y))) n++;
    }
    console.log('  pup' + h.i + '  patch at hand centre ' + Math.round(cx) + ',' + Math.round(cy) +
      '  warm ' + n + '/' + tot + '  ' + (n / tot > 0.5 ? 'HAND VISIBLE' : n / tot > 0.1 ? 'partly visible' : 'MISSING - drawn but not rendered'));
  });
  try { fs.unlinkSync(raw); } catch {}
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
