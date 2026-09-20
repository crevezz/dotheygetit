/* throwaway: measure the real words-per-second of the voice already on disk, and
   report what each chapter's scene would have to be to land near 1.0x. */
const { spawnSync } = require('child_process');
const ff = require('ffmpeg-static');
const fs = require('fs');
const p = require('./narration.json');

const dur = f => {
  const r = spawnSync(ff, ['-hide_banner', '-i', f], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
};

let tot = 0, totw = 0;
for (const c of p.chapters) {
  const f = 'voice/' + c.id + '.mp3';
  const w = c.text.trim().split(/\s+/).length;
  if (!fs.existsSync(f)) { console.log(String(c.n).padEnd(3), c.id.padEnd(34), 'no clip yet', String(w).padStart(4) + 'w'); continue; }
  const d = dur(f);
  tot += d; totw += w;
  console.log(String(c.n).padEnd(3), c.id.padEnd(34), d.toFixed(1) + 's', (w / d).toFixed(2) + ' w/s', String(w).padStart(4) + 'w');
}
const rate = totw / tot;
console.log('\nmeasured rate: ' + rate.toFixed(3) + ' words/sec  (' + (rate * 60).toFixed(0) + ' wpm) over ' + tot.toFixed(0) + 's');
console.log('\nscene length each chapter needs for ~1.05x:');
for (const c of p.chapters) {
  const w = c.text.trim().split(/\s+/).length;
  const vo = w / rate;
  console.log('  ' + String(c.n).padEnd(3) + c.id.padEnd(34) + 'vo ~' + vo.toFixed(0) + 's   scene should be ~' + (vo + 1.2) * 1.05 | 0);
}
