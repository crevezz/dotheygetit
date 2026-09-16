/* eyeball the finished videos: one frame from the middle of a few chapters */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');
const T = path.join(__dirname, 'out', 'tutorials');
const F = path.join(__dirname, 'out', 'frames');
fs.mkdirSync(F, { recursive: true });

const want = [
  ['01-what-get-it-is', 14], ['04-write-the-questions', 22], ['05-how-pupils-join', 30],
  ['06-read-your-results', 20], ['07-change-a-colour', 14], ['09-your-data', 24]
];
for (const [id, t] of want) {
  const out = path.join(F, id + '.png');
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-ss', String(t), '-i', path.join(T, id + '.mp4'),
    '-frames:v', '1', '-vf', 'scale=960:-1', out], { encoding: 'utf8' });
  const ok = fs.existsSync(out);
  console.log((ok ? '  ok  ' : '  FAIL') + ' ' + id + '@' + t + 's' + (ok ? '  ' + Math.round(fs.statSync(out).size / 1024) + ' KB' : '  ' + (r.stderr || '').slice(-200)));
}
