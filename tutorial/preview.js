/* ASCII preview of a frame - lets us sanity-check the picture without eyes on it. */
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const COLS = 96, ROWS = 30;
const RAMP = ' .:-=+*#%@';

function preview(file, t) {
  const r = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(t), '-i', file,
    '-frames:v', '1',
    '-vf', `scale=${COLS}:${ROWS},format=gray`,
    '-f', 'rawvideo', '-'
  ], { maxBuffer: 1 << 22 });
  const buf = r.stdout;
  if (!buf || buf.length < COLS * ROWS) return '(no frame)';
  const px = Array.from(buf.slice(0, COLS * ROWS));
  const mx = Math.max(...px), mn = Math.min(...px);
  const hist = new Array(10).fill(0);
  px.forEach(p => hist[Math.min(9, Math.floor(p / 25.6))]++);
  const lines = [];
  for (let y = 0; y < ROWS; y++) {
    let s = '';
    for (let x = 0; x < COLS; x++) {
      const p = px[y * COLS + x];
      s += RAMP[Math.min(9, Math.round((p / 255) * 9 * 2.2))];  // gamma-lift so dark UI shows
    }
    lines.push(s);
  }
  return { art: lines.join('\n'), mn, mx, brightPct: ((px.filter(p => p > 140).length / px.length) * 100).toFixed(1), darkPct: ((px.filter(p => p < 12).length / px.length) * 100).toFixed(1) };
}

const shots = process.argv.slice(2);
if (!shots.length) {
  console.log('usage: node preview.js <file> <t> [<file> <t> ...]');
  process.exit(0);
}
for (let i = 0; i < shots.length; i += 2) {
  const file = shots[i], t = shots[i + 1];
  const p = preview(file, t);
  console.log('\n=== ' + path.basename(file) + '  t=' + t + 's   min=' + p.mn + ' max=' + p.mx + ' bright=' + p.brightPct + '% dark=' + p.darkPct + '% ===');
  console.log(p.art);
}
