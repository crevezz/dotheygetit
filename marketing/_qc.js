/* Sanity check on the finished films: length, audio present and audible,
 * and no accidental black stretches (a scene that failed to paint).
 *   node marketing/_qc.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();
const DIR = path.join(__dirname, 'out', 'beats');
const ff = (args) => String(spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 }).stderr || '');

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.mp4')).sort()) {
  const p = path.join(DIR, f);
  const info = ff(['-i', p]);
  const dur = (info.match(/Duration: (\d+):(\d+):([\d.]+)/) || []);
  const secs = +dur[1] * 3600 + +dur[2] * 60 + +dur[3];
  const video = /Video: h264.*?(\d{2,5}x\d{2,5})/.exec(info);
  const hasAudio = /Stream #\d+:\d+.*Audio: /.test(info);
  const vol = (ff(['-i', p, '-af', 'volumedetect', '-f', 'null', '-']).match(/mean_volume: ([-\d.]+) dB/) || [])[1];
  const black = [...ff(['-i', p, '-vf', 'blackdetect=d=0.7:pix_th=0.06', '-an', '-f', 'null', '-']).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)]
    .map((m) => `${m[1]}-${m[2]}`);
  console.log(`  ${f.padEnd(22)} ${secs.toFixed(1)}s ${(video ? video[1] : '?').padEnd(10)} ` +
    `audio ${hasAudio ? (vol || '?') + ' dB' : 'MISSING'}  black ${black.length ? black.join(' ') : 'none'}`);
}
