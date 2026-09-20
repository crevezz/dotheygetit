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

   Phone set: MOBILE=1 films and builds the whole thing in a 390x844 viewport
              (see record.js). Its own takes, chapters-mobile.json and
              out/tutorials-mobile/, so neither set can overwrite the other.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT = path.join(HERE, 'out');
/* MOBILE=1 builds the phone set: its own chapter geometry and its own output
   folder, so a mobile run can never overwrite the laptop one.
   (.trim(): `set MOBILE=1 && node ...` in cmd leaves a trailing space.) */
const MOBILE = process.env.MOBILE?.trim() === '1';
const BUILD = path.join(OUT, MOBILE ? 'tutorials-mobile' : 'tutorials');
const VOICE = path.join(HERE, 'voice');
const FPS = 25;
const TAIL = 1.2;                 // seconds of picture after the voice stops
const MAX_SPEED = 1.32;           // never speed a chapter up more than this
/* How black a frame must be to count as a chapter card. A laptop card measures
   ~99.0% black, but a phone card lands 98.5-99.0%: at pic_th 0.985 it clears by
   almost nothing, and raising it to 0.99 loses 11 of the 14 cards. Nothing else
   in either take is anywhere near this dark (the next darkest frames are ~24%),
   so the phone gets real headroom instead of a 0.5-point margin. */
const PIC_TH = MOBILE ? 0.975 : 0.985;
const W = 1280, H = 800;          // fallback only - the take's own size wins

fs.mkdirSync(BUILD, { recursive: true });

const plan = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'));
const chaptersFile = path.join(HERE, MOBILE ? 'chapters-mobile.json' : 'chapters.json');
let CHAPTERS = null;
try { CHAPTERS = JSON.parse(fs.readFileSync(chaptersFile, 'utf8')); }
catch { CHAPTERS = null; }   /* --scan writes it; nothing else runs before that */

/* ------------------------------------------------------------------ probing */
function probe(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const err = r.stderr || '';
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(err);
  /* the take's own frame size: a phone take is 390x844, a laptop one 1280x800,
     and the build must not rescale either into the other's shape */
  const d = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(err);
  return { duration: m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null,
           w: d ? +d[1] : null, h: d ? +d[2] : null, raw: err };
}
function hasAudio(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  return /Stream #\d+:\d+.*: Audio:/.test(r.stderr || '');
}
function blackRuns(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file,
    '-vf', 'blackdetect=d=0.8:pic_th=' + PIC_TH + ':pix_th=0.10', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const runs = [];
  const re = /black_start:([\d.]+) black_end:([\d.]+)/g;
  let m;
  while ((m = re.exec(r.stderr || ''))) runs.push({ start: +m[1], end: +m[2] });
  return runs;
}

/* ------------------------------------------------------- --scan (recompute) */
if (process.argv.includes('--scan')) {
  /* only the takes that are actually on disk - a chapter list can be built from record.js
     alone, and a missing take must not be able to crash the scan */
  const takes = (MOBILE ? ['raw-mobile', 'why-mobile'] : ['raw', 'why'])
    .filter(k => fs.existsSync(path.join(OUT, k + '.webm')));
  if (!takes.length) { console.error('nothing to scan - no *.webm in ' + OUT); process.exit(1); }
  const dur = {}, srcs = {}, ends = {};
  for (const k of takes) {
    const f = path.join(OUT, k + '.webm');
    dur[k] = probe(f).duration;
    srcs[k] = blackRuns(f);
    ends[k] = dur[k];
    console.log('  ' + k + ': ' + (dur[k] || '?') + 's, ' + srcs[k].length + ' chapter cards');
  }
  const cards = [];
  takes.forEach(k => srcs[k].forEach(r => cards.push({ src: k, ...r })));
  cards.sort((a, b) => (a.src === b.src ? a.start - b.start : takes.indexOf(a.src) - takes.indexOf(b.src)));
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
    _note: 'Exact chapter boundaries found by blackdetect on the raw takes - do not hand-edit. Regenerate with `node build.js --scan`'
      + (MOBILE ? ' (MOBILE=1: phone takes, 390x844).' : '.'),
    takes: takes.reduce((o, k) => (o[k] = { file: 'out/' + k + '.webm', duration: dur[k] }, o), {}),
    chapters: out
  };
  fs.writeFileSync(chaptersFile, JSON.stringify(CHAPTERS, null, 2) + '\n');
  console.log('  scanned ' + out.length + ' chapters -> ' + path.basename(chaptersFile));
  console.log('  ' + out.map(c => 'ch' + c.n + ':' + c.span + 's').join('  '));
  process.exit(0);
}

/* -------------------------------------------------------------------- build */
if (!CHAPTERS) { console.error('no ' + path.basename(chaptersFile) + ' - run: node build.js --scan' + (MOBILE ? '   (with MOBILE=1 set)' : '')); process.exit(1); }
/* only the takes the chapter list actually uses need to be on disk */
for (const k of new Set((CHAPTERS.chapters || []).map(c => c.src))) {
  const f = path.join(OUT, k + '.webm');
  if (!fs.existsSync(f)) { console.error('missing ' + f + ' (needed by ' + path.basename(chaptersFile) + ')'); process.exit(1); }
}
const files = {};
for (const c of CHAPTERS.chapters || []) files[c.src] = path.join(OUT, c.src + '.webm');
console.log('building ' + plan.chapters.length + ' tutorials' + (MOBILE ? ' (phone, 390x844)' : '') + '\n');
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

  /* frame size comes from the take, rounded down to even (h264 4:2:0 needs it) */
  const src = probe(files[meta.src]);
  const OW = (src.w || W) & ~1, OH = (src.h || H) & ~1;

  const outFile = path.join(BUILD, ch.id + '.mp4');
  const fadeOutStart = Math.max(0, len - 0.5);

  const vf = [
    `trim=start=${meta.start}:end=${meta.start + meta.span}`,
    `setpts=(PTS-STARTPTS)/${speed}`,
    `scale=${OW}:${OH}`,
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
  built.push({ ...ch, file: outFile, len, speed, vo, w: OW, h: OH });
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
  mobile: MOBILE,
  size: built.length ? built[0].w + 'x' + built[0].h : null,
  total: +total.toFixed(1),
  chapters: built.map(b => ({ n: b.n, id: b.id, title: b.title, sub: b.sub, len: +b.len.toFixed(1), file: b.id + '.mp4' }))
}, null, 2) + '\n');
console.log('  -> ' + BUILD);
