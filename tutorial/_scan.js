/* throwaway: numeric luma grid of one frame, to see exactly where the picture is.
   usage: node _scan.js <take> <seconds> [cols] [rows] */
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const take = process.argv[2] || 'raw-mobile';
const at = process.argv[3] || '20';
const COLS = +(process.argv[4] || 40), ROWS = +(process.argv[5] || 20);

const info = spawnSync(ffmpeg, ['-hide_banner', '-i', path.join(__dirname, 'out', take + '.webm')], { encoding: 'utf8' });
const dm = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(info.stderr || '');
const W = dm ? +dm[1] : 0, H = dm ? +dm[2] : 0;

const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(at),
  '-i', path.join(__dirname, 'out', take + '.webm'), '-frames:v', '1',
  '-vf', `scale=${COLS}:${ROWS}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 22 });

const buf = r.stdout;
console.log('  ' + take + '.webm  t=' + at + 's   real frame ' + W + 'x' + H + '  grid ' + COLS + 'x' + ROWS);
console.log('  (each cell = mean luma 0-255 of that block)\n');
for (let y = 0; y < ROWS; y++) {
  let s = '   ';
  for (let x = 0; x < COLS; x++) s += String(buf[y * COLS + x]).padStart(4);
  console.log(s);
}
/* where is the picture? scan columns/rows for the first fully-bright band */
const mean = (a) => a.reduce((p, c) => p + c, 0) / a.length;
const colMean = [], rowMean = [];
for (let x = 0; x < COLS; x++) { const c = []; for (let y = 0; y < ROWS; y++) c.push(buf[y * COLS + x]); colMean.push(mean(c)); }
for (let y = 0; y < ROWS; y++) rowMean.push(mean(Array.from(buf.slice(y * COLS, y * COLS + COLS))));
const bright = v => v > 120;
const firstBrightCol = colMean.findIndex(bright), firstBrightRow = rowMean.findIndex(bright);
console.log('\n  first uniformly-bright column: ' + (firstBrightCol < 0 ? 'none' : firstBrightCol + '/' + COLS +
  '  -> x = ' + Math.round(firstBrightCol / COLS * W) + 'px of ' + W));
console.log('  first uniformly-bright row   : ' + (firstBrightRow < 0 ? 'none' : firstBrightRow + '/' + ROWS +
  '  -> y = ' + Math.round(firstBrightRow / ROWS * H) + 'px of ' + H));
