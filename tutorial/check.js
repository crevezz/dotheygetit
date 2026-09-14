const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const BUILD = path.join(__dirname, 'out', 'tutorials');
const idx = JSON.parse(fs.readFileSync(path.join(BUILD, 'index.json'), 'utf8'));

function ff(args) { return spawnSync(ffmpeg, args, { encoding: 'utf8' }); }

console.log('file                                 dur    video    audio   mean   max');
const rows = [];
for (const c of idx.chapters.concat([{ id: 'all', title: '(all)', len: idx.total, file: 'all.mp4' }])) {
  const f = path.join(BUILD, c.file);
  const info = ff(['-hide_banner', '-i', f]).stderr || '';
  const dur = (/Duration: (\d+):(\d+):([\d.]+)/.exec(info) || []);
  const d = dur[1] ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : 0;
  const v = /Stream #\d+:\d+.*: Video: (\w+)/.exec(info);
  const a = /Stream #\d+:\d+.*: Audio: (\w+)/.exec(info);
  const vol = ff(['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-']).stderr || '';
  const mean = (/mean_volume: ([-\d.]+)/.exec(vol) || [])[1] || '?';
  const max = (/max_volume: ([-\d.]+)/.exec(vol) || [])[1] || '?';
  rows.push({ id: c.id, d, v: v ? v[1] : 'NONE', a: a ? a[1] : 'NONE', mean, max });
  console.log(c.id.padEnd(36) + d.toFixed(1).padStart(6) + (v ? v[1] : 'NONE').padStart(9) + (a ? a[1] : 'NONE').padStart(9) + mean.padStart(8) + max.padStart(7));
}

/* silence map on chapter 4: shows exactly when the voice is talking */
console.log('\nsilence in 04-how-pupils-join.mp4 (voice should start ~0.8s, end ~30s):');
const s = ff(['-hide_banner', '-i', path.join(BUILD, '04-how-pupils-join.mp4'),
  '-af', 'silencedetect=n=-38dB:d=0.45', '-f', 'null', '-']).stderr || '';
console.log(s.split(/\r?\n/).filter(l => /silence_(start|end)/.test(l)).map(l => '  ' + l.replace(/.*\]\s*/, '')).join('\n'));

/* frame grabs to eyeball: chapter 1 card + chapter 1 body */
const shots = [
  ['01-create-account', 0.4, 'card'],
  ['01-create-account', 3.6, 'body'],
  ['04-how-pupils-join', 0.4, 'card'],
  ['06-spot-the-pattern', 12.0, 'body'],
  ['07-why-i-built-this', 0.4, 'card']
];
const dir = path.join(__dirname, 'out', 'frames');
fs.mkdirSync(dir, { recursive: true });
for (const [id, t, tag] of shots) {
  ff(['-hide_banner', '-y', '-i', path.join(BUILD, id + '.mp4'), '-ss', String(t), '-frames:v', '1',
      path.join(dir, id + '-' + tag + '.png')]);
}
console.log('\nframe grabs -> out/frames');
const bad = rows.filter(r => r.v === 'NONE' || r.a === 'NONE' || parseFloat(r.mean) < -35);
console.log(bad.length ? '\nPROBLEM: ' + bad.map(b => b.id).join(', ') : '\nAll files have picture + audible audio.');
