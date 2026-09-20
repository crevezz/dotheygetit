/* scratch: one sheet showing, per shot, the frame Seedream drew, what Kling
   animated, and what survives the grade. Also measures brightness, because the
   type has to sit on top of these and read. */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const ART = 'out/advert/art';
const shots = ['a1-classroom', 'a2-books'];
const T = 3;

const args = ['-y', '-hide_banner'];
shots.forEach(s => args.push('-loop', '1', '-t', String(T), '-i', path.join(ART, s + '-still.jpg')));
shots.forEach(s => args.push('-t', String(T), '-i', path.join(ART, s + '.mp4')));

const S = 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960,setsar=1';
const fc = [];
for (let i = 0; i < shots.length * 2; i++) fc.push('[' + i + ':v]' + S + '[v' + i + ']');
fc.push([0, 1, 2, 3].map(i => '[v' + i + ']').join('') +
  'xstack=inputs=4:layout=0_0|540_0|0_960|540_960[v]');
args.push('-filter_complex', fc.join(';'), '-map', '[v]', '-c:v', 'libx264', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-t', String(T), path.join(ART, '_compare.mp4'));

const r = spawnSync(ffmpeg, args, { encoding: 'utf8' });
if (r.status !== 0) { console.error((r.stderr || '').split('\n').slice(-8).join('\n')); process.exit(1); }
console.log('top row a1-classroom, bottom row a2-books   |   left: the frame Seedream drew   right: what Kling made of it, graded\n');

function yavg(f, t) {
  const q = spawnSync(ffmpeg, ['-hide_banner', '-ss', String(t), '-i', f,
    '-vf', 'signalstats,metadata=print', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /YAVG=([0-9.]+)/.exec(q.stderr || '');
  return m ? Number(m[1]) : null;
}
shots.forEach(s => {
  const g = yavg(path.join(ART, s + '.mp4'), 0.9);
  console.log(s.padEnd(14) + ' graded frame YAVG ' + g.toFixed(1) +
    (g > 60 ? '   <-- too bright, the type will fight it' : '   (dark enough for white type)'));
});
console.log('\n' + path.resolve(ART, '_compare.mp4'));

