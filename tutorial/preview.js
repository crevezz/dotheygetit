/* ASCII preview of a frame - lets us sanity-check the picture without eyes on it. */
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const COLS = 96, ROWS = 30;
const RAMP = ' .:-=+*#%@';

/* Fit the frame's OWN aspect into the terminal box, instead of forcing 96x30.
   A phone take is 390x844: forced into 96x30 it would look squashed and the
   preview would be lying about the one thing it exists to check. Terminal
   characters are about twice as tall as they are wide, hence the /2. */
function probeSize(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const d = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(r.stderr || '');
  return d ? { w: +d[1], h: +d[2] } : null;
}
function fit(w, h) {
  const ar = w / h;
  let cols = COLS, rows = Math.round(cols / ar / 2);
  if (rows > ROWS) { rows = ROWS; cols = Math.round(rows * ar * 2); }
  return { cols: Math.max(10, cols), rows: Math.max(6, rows) };
}

function preview(file, t) {
  const size = probeSize(file);
  const { cols: COLS, rows: ROWS } = size ? fit(size.w, size.h) : { cols: COLS, rows: ROWS };
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
  return { art: lines.join('\n'), mn, mx, size, dims: COLS + 'x' + ROWS, brightPct: ((px.filter(p => p > 140).length / px.length) * 100).toFixed(1), darkPct: ((px.filter(p => p < 12).length / px.length) * 100).toFixed(1) };
}

const shots = process.argv.slice(2);
if (!shots.length) {
  console.log('usage: node preview.js <file> <t> [<file> <t> ...]');
  process.exit(0);
}
for (let i = 0; i < shots.length; i += 2) {
  const file = shots[i], t = shots[i + 1];
  const p = preview(file, t);
  console.log('\n=== ' + path.basename(file) + '  t=' + t + 's   frame=' + (p.size ? p.size.w + 'x' + p.size.h : '?') + '  ascii=' + (p.dims || '') + '   min=' + p.mn + ' max=' + p.mx + ' bright=' + p.brightPct + '% dark=' + p.darkPct + '% ===');
  console.log(p.art);
}
