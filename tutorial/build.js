/* ============================================================================
   Build the 7 tutorials.

   Timeline   : one long take (raw.webm) + the landing-page take (why.webm)
   Chapter cuts: found by ffmpeg blackdetect on the solid-black title cards,
                 recorded in chapters.json  -> exact, no drift possible.
   Sync       : each chapter is retimed by a per-chapter factor so the video
                 finishes just after the voiceover, then the voice is laid in
                 at the chapter's own offset.  Nothing overlaps, nothing is cut.
   Output     : out/tutorials/<id>.mp4   (one per chapter)
                out/tutorials/all.mp4    (everything, in order)

   Usage: node build.js            build
          node build.js --scan     re-run blackdetect and rewrite chapters.json
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT = path.join(HERE, 'out');
const BUILD = path.join(OUT, 'tutorials');
const VOICE = path.join(HERE, 'voice');
const FPS = 25;
const TAIL = 1.2;                 // seconds of picture after the voice stops
const MAX_SPEED = 1.32;           // never speed a chapter up more than this
const W = 1280, H = 800;

fs.mkdirSync(BUILD, { recursive: true });

const plan = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'));
const chaptersFile = path.join(HERE, 'chapters.json');
let CHAPTERS = JSON.parse(fs.readFileSync(chaptersFile, 'utf8'));

/* ------------------------------------------------------------------ probing */
function probe(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const err = r.stderr || '';
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(err);
  return { duration: m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null, raw: err };
}
function hasAudio(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  return /Stream #\d+:\d+.*: Audio:/.test(r.stderr || '');
}
function blackRuns(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file,
    '-vf', 'blackdetect=d=0.8:pic_th=0.985:pix_th=0.10', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const runs = [];
  const re = /black_start:([\d.]+) black_end:([\d.]+)/g;
  let m;
  while ((m = re.exec(r.stderr || ''))) runs.push({ start: +m[1], end: +m[2] });
  return runs;
}

/* ------------------------------------------------------- --scan (recompute) */
if (process.argv.includes('--scan')) {
  const raw = path.join(OUT, 'raw.webm'), why = path.join(OUT, 'why.webm');
  const dur = { raw: probe(raw).duration, why: probe(why).duration };
  const srcs = { raw: blackRuns(raw), why: blackRuns(why) };
  const cards = []
    .concat(srcs.raw.map(r => ({ src: 'raw', ...r })))
    .concat(srcs.why.map(r => ({ src: 'why', ...r })))
    .sort((a, b) => (a.src === b.src ? a.start - b.start : a.src === 'raw' ? -1 : 1));
  const ends = { raw: dur.raw, why: dur.why };
  const out = [];
  cards.forEach((c, i) => {
    const next = cards[i + 1];
    const end = next && next.src === c.src ? next.start : ends[c.src];
    const voStart = c.start + 1.0;
    out.push({
      n: i + 1, src: c.src, cardStart: +c.start.toFixed(2), cardEnd: +c.end.toFixed(2),
      start: +c.start.toFixed(2), span: +(end - c.start).toFixed(2),
      voStart: +voStart.toFixed(2), window: +(end - voStart).toFixed(2)
    });
  });
  CHAPTERS = {
    _note: 'Exact chapter boundaries found by blackdetect on the raw takes - do not hand-edit. Regenerate with `node build.js --scan`.',
    raw: { file: 'out/raw.webm', duration: dur.raw },
    why: { file: 'out/why.webm', duration: dur.why },
    chapters: out
  };
  fs.writeFileSync(chaptersFile, JSON.stringify(CHAPTERS, null, 2) + '\n');
  console.log('  scanned ' + out.length + ' chapters -> chapters.json');
  console.log('  ' + out.map(c => 'ch' + c.n + ':' + c.span + 's').join('  '));
  process.exit(0);
}

/* -------------------------------------------------------------------- build */
const files = { raw: path.join(OUT, 'raw.webm'), why: path.join(OUT, 'why.webm') };
for (const [k, f] of Object.entries(files)) {
  if (!fs.existsSync(f)) { console.error('missing ' + f); process.exit(1); }
}
console.log('building ' + plan.chapters.length + ' tutorials\n');
console.log('  ch  chapter                    voice   speed   length');

const built = [];
for (const ch of plan.chapters) {
  const meta = CHAPTERS.chapters.find(c => c.n === ch.n);
  if (!meta) { console.error('no chapter geometry for ' + ch.n); process.exit(1); }
  const voFile = path.join(VOICE, ch.id + '.mp3');
  if (!fs.existsSync(voFile)) { console.error('missing voice ' + voFile); process.exit(1); }

  const vo = probe(voFile).duration;
  const speed = Math.min(MAX_SPEED, +((meta.window) / (vo + TAIL)).toFixed(3));
  const len = +((meta.span / speed).toFixed(3));
  const voDelayMs = Math.round(((meta.voStart - meta.start) / speed) * 1000);

  const outFile = path.join(BUILD, ch.id + '.mp4');
  const fadeOutStart = Math.max(0, len - 0.5);

  const vf = [
    `trim=start=${meta.start}:end=${meta.start + meta.span}`,
    `setpts=(PTS-STARTPTS)/${speed}`,
    `scale=${W}:${H}`,
    `format=yuv420p`,
    `fade=t=in:st=0:d=0.25`,
    `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.5`
  ].join(',');
  const af = [
    `loudnorm=I=-16:TP=-1.5:LRA=11`,
    `adelay=${voDelayMs}|${voDelayMs}`,
    `apad`,
    `atrim=0:${len}`,
    `asetpts=N/SR/TB`
  ].join(',');

  const args = [
    '-hide_banner', '-y',
    '-i', files[meta.src],
    '-i', voFile,
    '-filter_complex', `[0:v]${vf}[v];[1:a]${af}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    outFile
  ];

  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    console.error('FAILED ch' + ch.n + '\n' + (r.stderr || '').split(/\r?\n/).slice(-14).join('\n'));
    process.exit(1);
  }
  const size = (fs.statSync(outFile).size / 1048576).toFixed(1);
  console.log('  ' + String(ch.n).padEnd(4) + ch.title.padEnd(24) +
              (vo.toFixed(1) + 's').padStart(7) + (speed.toFixed(2) + 'x').padStart(8) +
              (len.toFixed(1) + 's').padStart(9) + ('   ' + size + ' MB').padStart(0));
  built.push({ ...ch, file: outFile, len, speed, vo });
}

/* ------------------------------------------------- a single "watch it all" */
const listFile = path.join(BUILD, 'all.txt');
fs.writeFileSync(listFile, built.map(b => "file '" + path.basename(b.file) + "'").join('\n') + '\n');
const allFile = path.join(BUILD, 'all.mp4');
const rc = spawnSync(ffmpeg, ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-c', 'copy', '-movflags', '+faststart', allFile], { encoding: 'utf8' });
if (rc.status !== 0) {
  console.error('concat failed:\n' + (rc.stderr || '').split(/\r?\n/).slice(-10).join('\n'));
  process.exit(1);
}
fs.unlinkSync(listFile);

const total = built.reduce((a, b) => a + b.len, 0);
console.log('\n  all.mp4   ' + total.toFixed(0) + 's  (' + (fs.statSync(allFile).size / 1048576).toFixed(1) + ' MB)');
fs.writeFileSync(path.join(BUILD, 'index.json'), JSON.stringify({
  voice: plan.voice, builtAt: new Date().toISOString(),
  total: +total.toFixed(1),
  chapters: built.map(b => ({ n: b.n, id: b.id, title: b.title, sub: b.sub, len: +b.len.toFixed(1), file: b.id + '.mp4' }))
}, null, 2) + '\n');
console.log('  -> ' + BUILD);
