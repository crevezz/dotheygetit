/* Is the design actually inside the frame at every ratio, or is it clipped?
   Renders one frame per ratio and measures the bounding box of the bright
   pixels (the type) against the frame edges. A margin of 0 means type is
   touching the edge, which is the failure this whole reflow exists to avoid. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const OUT = path.join(__dirname, 'out', 'advert');
const W = 270, H = 338;                       // measurement grid, 1/4 scale
const AT = process.argv[2] || '10';           // which second to sample

function grey(file) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
    '-ss', AT, '-i', file, '-frames:v', '1',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=gray`,
    '-f', 'rawvideo', '-'], { encoding: null, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(file + ': ' + String(r.stderr).slice(-300));
  return r.stdout;
}

const ratios = ['9x16', '4x5', '1x1', '16x9'];
let bad = 0;
for (const key of ratios) {
  const f = path.join(OUT, 'advert-' + key + '.mp4');
  if (!fs.existsSync(f)) { console.log(key.padEnd(5) + ' MISSING - not shot yet'); continue; }
  const px = grey(f);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, bright = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x] > 150) {                     // the type is near-white; the blue glow is not
      bright++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (bright === 0) { console.log(key.padEnd(5) + ' NO TYPE FOUND - frame is empty'); bad++; continue; }
  const m = { left: x0, top: y0, right: W - 1 - x1, bottom: H - 1 - y1 };
  const tight = Object.entries(m).filter(([, v]) => v < 3).map(([k]) => k);
  console.log(key.padEnd(5) + ' type ' + (bright / (W * H) * 100).toFixed(1) + '% of frame' +
    '  margins L' + m.left + ' T' + m.top + ' R' + m.right + ' B' + m.bottom +
    (tight.length ? '   CLIPPED: ' + tight.join(',') : '   clear'));
  if (tight.length) bad++;
}
console.log(bad ? '\n' + bad + ' ratio(s) with a problem' : '\nall clear');
process.exit(bad ? 1 : 0);
