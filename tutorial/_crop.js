/* throwaway: the phone take was recorded into the top-left 390x844 of a padded
   780x1688 frame. Crop that region back out and ask the REAL blackdetect settings
   whether the chapter cards would be found - i.e. validate the geometry fix
   without spending another take. */
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const take = process.argv[2] || 'raw-mobile';
const crop = process.argv[3] || '390:844:0:0';
const file = path.join(__dirname, 'out', take + '.webm');

/* how much headroom does the card really have? push pic_th up until detection breaks. */
function countAt(picTh) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file,
    '-vf', `crop=${crop},blackdetect=d=0.8:pic_th=${picTh}:pix_th=0.10`, '-an', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 28 });
  const re = /black_start:([\d.]+) black_end:([\d.]+)/g;
  let m; const runs = [];
  while ((m = re.exec(r.stderr || ''))) runs.push({ s: +m[1], e: +m[2] });
  return runs;
}

const base = countAt(0.985);
console.log('  ' + take + '.webm  crop ' + crop);
console.log('  production setting pic_th=0.985  ->  ' + base.length + ' card run(s)');
base.forEach((x, i) => console.log('    ' + String(i + 1).padStart(2) + '  ' + x.s.toFixed(2) + 's - ' + x.e.toFixed(2) + 's'));

console.log('\n  headroom probe (how far pic_th can rise before cards are missed):');
[0.99, 0.993, 0.995, 0.997].forEach(p => {
  const n = countAt(p);
  console.log('    pic_th ' + p.toFixed(3) + '  ->  ' + n.length + ' card(s)' + (n.length === base.length ? '   still all found' : '   BROKEN'));
});
