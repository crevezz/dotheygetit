/* throwaway: how black does the chapter card actually get?
   ffmpeg blackframe reports pblack (percent of pixels below the luma threshold)
   per frame, which is exactly what blackdetect's pic_th is comparing against. */
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const which = process.argv[2] || 'raw';
const take = path.join(__dirname, 'out', which + '.webm');
const TH = process.argv[3] || '25';

const r = spawnSync(ffmpeg, ['-hide_banner', '-i', take,
  '-vf', 'blackframe=amount=0:threshold=' + TH, '-an', '-f', 'null', '-'],
  { encoding: 'utf8', maxBuffer: 1 << 28 });

const err = r.stderr || '';
const re = /frame:(\d+)\s+pblack:([\d.]+)/g;
let m, best = 0, n = 0;
const hist = new Map();
const runs = [];
let cur = null;
while ((m = re.exec(err))) {
  const f = +m[1], p = +m[2];
  n++;
  if (p > best) best = p;
  const b = Math.min(100, Math.floor(p / 0.5) * 0.5);
  hist.set(b, (hist.get(b) || 0) + 1);
  if (p >= 95) {
    if (!cur) cur = { from: f, to: f, max: p };
    else { cur.to = f; if (p > cur.max) cur.max = p; }
  } else if (cur) { runs.push(cur); cur = null; }
}
if (cur) runs.push(cur);

console.log('  take      : ' + which + '.webm');
console.log('  frames    : ' + n + '   threshold luma < ' + TH);
console.log('  max pblack: ' + best.toFixed(2) + '%   (blackdetect needs pic_th 98.5%)');
console.log('\n  frames by pblack bucket (0.5% steps), >=90% only:');
[...hist.keys()].filter(k => k >= 90).sort((a, b) => a - b)
  .forEach(k => console.log('    ' + (k.toFixed(1) + '%').padStart(7) + '  ' + hist.get(k)));

console.log('\n  runs at pblack >= 95% (card candidates), frame @25fps -> seconds:');
runs.filter(x => x.to - x.from >= 5).forEach(x =>
  console.log('    ' + (x.from / 25).toFixed(2) + 's - ' + (x.to / 25).toFixed(2) + 's   max ' + x.max.toFixed(2) + '%'));
console.log('  (' + runs.filter(x => x.to - x.from >= 5).length + ' card-sized runs)');
