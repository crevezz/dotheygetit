const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const BUILD = path.join(__dirname, 'out', process.env.MOBILE?.trim() === '1' ? 'tutorials-mobile' : 'tutorials');
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

/* Silence map on the longest chapter: shows exactly when the voice is talking.
   Everything here comes from the index, so it cannot point at a chapter that
   no longer exists (it used to name 04-how-pupils-join, which is now 05-). */
const longest = idx.chapters.reduce((a, b) => (b.len > a.len ? b : a), idx.chapters[0]);
console.log('\nsilence in ' + longest.file + ' (voice should start ~0.8s, end well before the picture):');
const s = ff(['-hide_banner', '-i', path.join(BUILD, longest.file),
  '-af', 'silencedetect=n=-38dB:d=0.45', '-f', 'null', '-']).stderr || '';
const sil = s.split(/\r?\n/).filter(l => /silence_(start|end)/.test(l)).map(l => '  ' + l.replace(/.*\]\s*/, ''));
console.log(sil.length ? sil.join('\n') : '  (no silence gaps at all - voice runs the whole way)');

/* frame grabs to eyeball: the opening card, the opening body, and a later chapter */
const first = idx.chapters[0].id;
const shots = [
  [first, 0.4, 'card'],
  [first, 3.6, 'body'],
  [idx.chapters[3] ? idx.chapters[3].id : first, 0.4, 'card'],
  [longest.id, Math.min(12, longest.len / 2), 'body'],
  [idx.chapters[idx.chapters.length - 1].id, 0.4, 'card']
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
