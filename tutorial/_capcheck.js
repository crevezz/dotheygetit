/* Prove the captions are actually gone.
 *
 * The old captioned frames are still in out/frames. New build -> out/frames2. The caption bar sat
 * in the bottom ~70px and its text was near-white on a dark pill, so compare the bottom strip:
 * captions on = bright pixels in that strip, captions off = the app's dark background only. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');
const T = path.join(__dirname, 'out', 'tutorials');
const OLD = path.join(__dirname, 'out', 'frames');
const NEW = path.join(__dirname, 'out', 'frames2');
fs.mkdirSync(NEW, { recursive: true });

const want = [['01-what-get-it-is', 14], ['04-write-the-questions', 22], ['05-how-pupils-join', 30],
              ['06-read-your-results', 20], ['07-change-a-colour', 14], ['09-your-data', 24]];

/* average and peak luma of the bottom 80 rows */
function strip(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-vf',
    'crop=iw:80:0:ih-80,signalstats,metadata=print', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = (r.stderr || '') + (r.stdout || '');
  const y = /YAVG[=:]([\d.]+)/.exec(txt), m = /YMAX[=:]([\d.]+)/.exec(txt);
  return { avg: y ? +y[1] : null, max: m ? +m[1] : null };
}

console.log('  chapter                    old (captions on)      new (captions off)');
let worst = 0;
for (const [id, t] of want) {
  const out = path.join(NEW, id + '.png');
  spawnSync(ffmpeg, ['-y', '-hide_banner', '-ss', String(t), '-i', path.join(T, id + '.mp4'),
    '-frames:v', '1', '-vf', 'scale=960:-1', out], { encoding: 'utf8' });
  const o = fs.existsSync(path.join(OLD, id + '.png')) ? strip(path.join(OLD, id + '.png')) : null;
  const n = fs.existsSync(out) ? strip(out) : null;
  const f = v => v ? 'avg ' + String(Math.round(v.avg)).padStart(3) + '  peak ' + String(Math.round(v.max)).padStart(3) : '  -';
  console.log('  ' + id.padEnd(24) + ' ' + f(o).padEnd(22) + ' ' + f(n));
  if (o && n) worst = Math.max(worst, o.max - n.max);
}
console.log('\npeak brightness lost from the bottom strip:', Math.round(worst) + ' (white caption text ~230+)');
