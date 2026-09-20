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

function rgb(file) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
    '-ss', AT, '-i', file, '-frames:v', '1',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=rgb24`,
    '-f', 'rawvideo', '-'], { encoding: null, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(file + ': ' + String(r.stderr).slice(-300));
  return r.stdout;
}

/* Is this pixel part of the design rather than the background? Two of the eight
   shots are red type, and red is only luma 141 in greyscale - under the old
   near-white test, s7 measured as an empty frame when its line was right there.
   So: near-white, or specifically the red. Not "strongly coloured", which just
   catches the warm windows in the atmosphere plates and the blue background. */
function isType(r, g, b) {
  const mx = Math.max(r, g, b);
  return mx > 150 || (r > 190 && r - g > 70 && r - b > 60);
}

const ratios = ['9x16', '4x5', '1x1', '16x9'];
let bad = 0;
for (const key of ratios) {
  const f = path.join(OUT, 'advert-' + key + '.mp4');
  if (!fs.existsSync(f)) { console.log(key.padEnd(5) + ' MISSING - not shot yet'); continue; }
  const px = rgb(f);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, bright = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    if (isType(px[i], px[i + 1], px[i + 2])) {
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
