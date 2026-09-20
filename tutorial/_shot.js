/* throwaway: pull one frame out of a take so it can be looked at.
   usage: node _shot.js <take> <seconds> <outfile> */
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const take = process.argv[2] || 'raw';
const at = process.argv[3] || '3.0';
const out = path.join(__dirname, 'out', process.argv[4] || '_shot.png');
const r = spawnSync(ffmpeg, ['-hide_banner', '-y', '-ss', at, '-i', path.join(__dirname, 'out', take + '.webm'),
  '-frames:v', '1', out], { encoding: 'utf8' });
console.log(r.status === 0 ? '  wrote ' + out : '  FAILED\n' + (r.stderr || '').split('\n').slice(-6).join('\n'));
