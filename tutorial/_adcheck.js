/* scratch: did every shot actually land, and is the phone footage moving?
   Samples the finished advert at the middle of each shot in timeline.json. */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const VID = 'out/advert/advert.mp4';
const TL = JSON.parse(fs.readFileSync('out/advert/timeline.json', 'utf8'));

function yavg(t, crop) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-ss', String(t), '-i', VID,
    '-vf', crop + ',signalstats,metadata=print', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /YAVG=([0-9.]+)/.exec(r.stderr || '');
  return m ? Number(m[1]) : null;
}
/* the phone sits centred: 556x1202 in a 1080x1920 frame -> x=262, y=359 */
const HEAD = 'crop=900:260:90:1180';
const PHONE = 'crop=300:300:390:760';

let bad = 0;
TL.shots.forEach(s => {
  const mid = (s.t + s.e) / 2;
  const head = yavg(mid, HEAD);
  let note = '';
  if (s.clip) {
    const a = yavg(s.t + 0.9, PHONE), b = yavg(Math.min(s.e - 0.2, s.t + 1.9), PHONE);
    const moving = a !== null && b !== null && Math.abs(a - b) > 0.6;
    note = '  phone ' + (a === null ? 'n/a' : a.toFixed(1)) + ' -> ' + (b === null ? 'n/a' : b.toFixed(1)) +
           (moving ? '  moving' : '  <-- NOT MOVING');
    if (!moving) bad++;
  }
  const dim = head === null || head < 12;
  if (dim) bad++;
  console.log(s.id.padEnd(4) + ' ' + mid.toFixed(2).padStart(6) + 's   headline YAVG ' +
              (head === null ? 'n/a' : head.toFixed(1)).padStart(5) + (dim ? '  <-- BLANK?' : '        ') + note);
});
console.log(bad ? '\n' + bad + ' problem(s)' : '\nall 8 shots landed');

/* pull one frame per shot so they can be looked at */
const dir = 'out/advert/frames';
fs.mkdirSync(dir, { recursive: true });
TL.shots.forEach(s => {
  const mid = (s.t + s.e) / 2;
  spawnSync(ffmpeg, ['-y', '-hide_banner', '-ss', String(mid), '-i', VID, '-frames:v', '1',
    path.join(dir, s.id + '.png')], { encoding: 'utf8' });
});
console.log('frames -> ' + dir);
