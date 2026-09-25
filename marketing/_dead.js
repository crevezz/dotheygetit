/* Ground truth on "dead space" (v3).

   v1 downsampled 10x and used row max, so caption text vanished.
   v2 used an absolute brightness level, so the dark artwork in the room scenes
      (pupils read ~grey 67) counted as empty and everything looked dead.

   v3 uses no absolute level at all. The card background is a smooth gradient,
   so inside any scanline the background is nearly constant. Content shows up as
   pixels deviating from that row's own median. A row is DEAD when under 0.5% of
   its pixels deviate by more than DEV. That is scale- and palette-independent. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FF = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();

const DIR = path.join(__dirname, 'out', 'beats');
const W = 540, H = 960;                 // half scale - plenty, and 4x faster
const DEV = 16;                         // brighter than the row median by this much = content
const FRAC = 0.005;                     // row is dead under 0.5% content
const MINBAND = 60;                     // full-res px

function profile(mp4, t) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', mp4,
    '-frames:v', '1', '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 26 });
  if (r.status !== 0 || r.stdout.length < W * H) return null;
  const g = r.stdout;
  const out = new Int32Array(H);
  const hist = new Int32Array(256);
  for (let y = 0; y < H; y++) {
    hist.fill(0);
    const off = y * W;
    for (let x = 0; x < W; x++) hist[g[off + x]]++;
    let acc = 0, med = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= W / 2) { med = v; break; } }
    let n = 0;
    for (let x = 0; x < W; x++) if (g[off + x] > med + DEV) n++;
    out[y] = n;
  }
  return out;
}

function durOf(mp4) {
  const m = spawnSync(FF, ['-i', mp4], { encoding: 'utf8', maxBuffer: 1 << 24 }).stderr
    .match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

const SAFE_T = 150, SAFE_B = 1498;      // real platform insets, 1080x1920
const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter((f) => /-story\.mp4$/.test(f)).map((f) => f.replace('-story.mp4', ''));

for (const id of ids) {
  const mp4 = path.join(DIR, id + '-story.mp4');
  if (!fs.existsSync(mp4)) { console.log(id + ': missing'); continue; }
  const dur = durOf(mp4);
  const N = Math.max(8, Math.min(20, Math.round(dur / 1.2)));
  const rows = [];
  for (let s = 0; s < N; s++) {
    const t = (dur - 0.35) * s / (N - 1);
    const p = profile(mp4, t);
    if (p) rows.push({ t: +t.toFixed(2), p });
  }
  console.log('\n=== ' + id + '  ' + dur.toFixed(1) + 's');
  let worst = null;
  rows.forEach(({ t, p }) => {
    const need = Math.max(2, Math.round(FRAC * W));
    let run = 0, start = 0, best = null, deadIn = 0;
    for (let y = 0; y <= H; y++) {
      const dead = y < H && p[y] < need;
      if (dead) {
        if (run === 0) start = y;
        run++;
        if (y * 2 >= SAFE_T && y * 2 < SAFE_B) deadIn++;
      } else { if (run > (best ? best.n : 0)) best = { n: run * 2, y0: start * 2 }; run = 0; }
    }
    const inSafe = best && best.y0 + best.n > SAFE_T && best.y0 < SAFE_B;
    if (inSafe && (!worst || best.n > worst.n)) worst = { n: best.n, y0: best.y0, t };
    console.log('  t' + String(t).padStart(5) +
      '  ' + (best ? ('band ' + String(best.n).padStart(4) + 'px @y' + String(best.y0).padStart(4)) : '      --      ') +
      '   dead-in-safe ' + String(deadIn * 2).padStart(4) + 'px  ' + '#'.repeat(Math.round(deadIn * 2 / 45)));
  });
  console.log('  WORST in safe area: ' + (worst ? worst.n + 'px @y' + worst.y0 + ' at t' + worst.t : 'none'));
}
