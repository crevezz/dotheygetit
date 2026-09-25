const fs = require('fs');
const ff = (() => { try { return require('ffmpeg-static'); } catch { return require('./tutorial/node_modules/ffmpeg-static'); } })();
const { spawnSync } = require('child_process');
const src = 'marketing/out/beats/explainer-hd-app.mp4';
const out = 'landing-site/media';
fs.mkdirSync(out, { recursive: true });
const run = (a) => { const r = spawnSync(ff, a, { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status) throw new Error(a.join(' ') + '\n' + String(r.stderr).slice(-1500)); };
/* silent 22.5s hero loop */
run(['-y', '-ss', '0', '-t', '22.5', '-i', src, '-an', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out + '/hero.mp4']);
run(['-y', '-ss', '0', '-t', '22.5', '-i', src, '-an', '-vf', 'scale=960:-2', '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1', out + '/hero.webm']);
run(['-y', '-ss', '15', '-i', src, '-frames:v', '1', '-vf', 'scale=1600:-2', '-q:v', '6', out + '/hero.jpg']);
/* full explainer, with sound */
run(['-y', '-i', src, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', out + '/what-is-get-it.mp4']);
fs.readdirSync(out).forEach((f) => console.log(f, (fs.statSync(out + '/' + f).size / 1048576).toFixed(2) + 'MB'));
