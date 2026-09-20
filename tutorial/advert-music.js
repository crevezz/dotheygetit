/* Put the current mix.wav (read + bg.mp3) onto the four finished adverts
   WITHOUT re-filming them. The picture is copied bit for bit; only the audio
   track is replaced. Use this whenever the music or its level changes, so the
   four takes stay in step with each other.

     node advert-music.js

   Re-filming with advert-film.js does the same thing from scratch - it muxes
   mix.wav as it goes - so this is the shortcut, not the pipeline. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const OUT = path.join(__dirname, 'out', 'advert');
const MIX = path.join(OUT, 'mix.wav');
const RATIOS = ['9x16', '4x5', '1x1', '16x9'];

if (!fs.existsSync(MIX)) { console.error('no ' + MIX + ' - run node advert.js first'); process.exit(1); }

let bad = 0;
for (const r of RATIOS) {
  const src = path.join(OUT, 'advert-' + r + '.mp4');
  if (!fs.existsSync(src)) { console.log(r.padEnd(5) + ' not shot yet - skipped'); bad++; continue; }
  const tmp = path.join(OUT, 'advert-' + r + '.mus.mp4');
  /* the audio is padded to the PICTURE's length, not cut to the audio's. With
     -shortest, a mix even a fraction short takes the ending of the advert with
     it - which is exactly what happened the first time this ran. */
  const before = spawnSync(ffmpeg, ['-hide_banner', '-i', src], { encoding: 'utf8' }).stderr || '';
  const bd = /Duration: (\d+):(\d+):([\d.]+)/.exec(before);
  const vlen = (+bd[1] * 3600 + +bd[2] * 60 + +bd[3]).toFixed(2);
  const run = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', src, '-i', MIX,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-af', 'apad', '-t', vlen, '-movflags', '+faststart', tmp], { encoding: 'utf8' });
  if (run.status !== 0) { console.log(r.padEnd(5) + ' FAILED\n' + (run.stderr || '').slice(-400)); bad++; continue; }
  /* only swap it in once it is known good, so a failure cannot leave a
     half-written advert behind */
  fs.rmSync(src, { force: true });
  fs.renameSync(tmp, src);
  const info = spawnSync(ffmpeg, ['-hide_banner', '-i', src], { encoding: 'utf8' }).stderr || '';
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const v = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(info);
  const a = /Audio: (\w+).*?(\d+) Hz, (\w+)/.exec(info);
  console.log(r.padEnd(5) + ' ' + v[1] + 'x' + v[2] + '  ' +
    (+d[1] * 3600 + +d[2] * 60 + +d[3]).toFixed(2) + 's  ' +
    a[1] + ' ' + a[2] + 'Hz ' + a[3] + '  ' + (fs.statSync(src).size / 1048576).toFixed(1) + ' MB');
}
console.log(bad ? '\n' + bad + ' with a problem' : '\nall four carry the music');
process.exit(bad ? 1 : 0);
