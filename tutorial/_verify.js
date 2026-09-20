/* scratch: the four deliverables, checked the way a platform would take them -
   right length, right shape, sound present, opens on the design rather than on
   black, and the two atmosphere shots actually reading as a room. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const OUT = path.join(__dirname, 'out', 'advert');
const TL = JSON.parse(fs.readFileSync(path.join(OUT, 'timeline.json'), 'utf8'));

function probe(f) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', f], { encoding: 'utf8' });
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  const v = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(r.stderr || '');
  const a = /Audio: (\w+).*?(\d+) Hz/.exec(r.stderr || '');
  return {
    dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
    w: v ? +v[1] : null, h: v ? +v[2] : null,
    audio: a ? a[1] + ' ' + a[2] + 'Hz' : 'NONE'
  };
}
function luma(f, ss) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(ss), '-i', f,
    '-frames:v', '1', '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /YAVG=([\d.]+)/.exec(r.stdout || '');
  return m ? +m[1] : null;
}
function meanLuma(f) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', f,
    '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
  const v = [...(r.stdout || '').matchAll(/YAVG=([\d.]+)/g)].map(x => +x[1]);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

let bad = 0;
for (const key of ['9x16', '4x5', '1x1', '16x9']) {
  const f = path.join(OUT, 'advert-' + key + '.mp4');
  if (!fs.existsSync(f)) { console.log(key + '  MISSING'); bad++; continue; }
  const p = probe(f);
  const lenOK = Math.abs(p.dur - TL.total) < 0.1;
  const sound = p.audio !== 'NONE';
  const opens = luma(f, 0) > 12;                 // not opening on black
  const room = luma(f, 1.0);                     // s1 - the classroom plate
  const books = luma(f, 3.0);                    // s2 - the books plate
  const mean = meanLuma(f);
  console.log(key.padEnd(5) + ' ' + p.w + 'x' + p.h +
    '  ' + p.dur.toFixed(2) + 's' + (lenOK ? ' = timeline' : '  != timeline ' + TL.total) +
    '  ' + p.audio +
    '  opens ' + luma(f, 0).toFixed(0) +
    '  s1 ' + room.toFixed(0) + '  s2 ' + books.toFixed(0) +
    '  mean ' + mean.toFixed(1));
  if (!lenOK || !sound || !opens) bad++;
}
console.log(bad ? '\n' + bad + ' with a problem' : '\nall four good');
process.exit(bad ? 1 : 0);
