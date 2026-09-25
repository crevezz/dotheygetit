/* ============================================================================
   story-film.js - film each story (story.html) at each ratio and put the voice
   on it.

   Same trick as advert-film.js: the page holds on solid black until __go(), so
   blackdetect finds where the advert really starts and everything is timed from
   there. No drift.

     node story-film.js              # every story, every ratio
     node story-film.js quiet-one    # one story
     RATIO=4x5 node story-film.js    # one ratio
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); }
catch { ({ chromium } = require('playwright')); }

const HERE = __dirname;
const ROOT = path.join(HERE, 'out', 'stories');
const RATIOS = {
  '9x16': [1080, 1920],
  '4x5':  [1080, 1350],
  '1x1':  [1080, 1080],
  '16x9': [1920, 1080],
};
const ONLY_STORY = process.argv[2] || null;
const ONLY_RATIO = (process.env.RATIO || '').trim() || null;
const STORIES = JSON.parse(fs.readFileSync(path.join(HERE, 'stories.json'), 'utf8'));

function run(args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error(String(r.stderr || '').slice(-2500)); process.exit(1); }
  return r;
}
/* where a clip actually lives: a1-/a2- are the AI atmosphere plates; everything
   else is real app footage from the tutorials */
function srcFor(clip) {
  if (!clip) return null;
  return /^a\d/.test(clip)
    ? 'out/advert/art/' + clip + '.mp4'
    : 'out/tutorials-mobile/' + clip + '.mp4';
}

async function film(story, ratio) {
  const dir = path.join(ROOT, story.id);
  const tlFile = path.join(dir, 'timeline.json');
  const MIX = path.join(dir, 'mix.wav');
  if (!fs.existsSync(tlFile) || !fs.existsSync(MIX)) { console.error('missing ' + tlFile + ' - run story-voice.js first'); process.exit(1); }
  const TL = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  const LEN = TL.total;
  const [W, H] = RATIOS[ratio];

  const shots = TL.shots.map(s => ({
    kind: s.kind, t: s.t, e: s.e, ss: s.ss, head: s.head, lines: s.lines,
    src: srcFor(s.clip)
  }));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    deviceScaleFactor: 1
  });
  const page = await ctx.newPage();
  const vid = page.video();

  await ctx.addInitScript('window.SHOTS = ' + JSON.stringify(shots) + ';' +
    ' window.TOTAL = ' + JSON.stringify(LEN) + ';' +
    ' window.CAPTIONS = ' + JSON.stringify(TL.captions || []) + ';' +
    ' window.RATIO = ' + JSON.stringify(ratio) + ';');

  await page.goto('file://' + path.join(HERE, 'story.html').replace(/\\/g, '/'));
  await page.waitForFunction(() =>
    [...document.querySelectorAll('video')].every(v => v.readyState >= 2), null, { timeout: 30000 });
  await page.waitForTimeout(500);

  process.stdout.write('  ' + story.id + ' ' + ratio + '  filming ' + LEN + 's ... ');
  await page.evaluate('window.__go()');
  await page.waitForTimeout(LEN * 1000 + 700);
  await ctx.close();
  await browser.close();

  const raw = await vid.path();
  const webm = path.join(dir, 'film-' + ratio + '.webm');
  fs.copyFileSync(raw, webm);
  fs.rmSync(raw, { force: true });

  const bd = run(['-hide_banner', '-i', webm, '-vf', 'blackdetect=d=0.1:pic_th=0.98:pix_th=0.10', '-an', '-f', 'null', '-']);
  const pairs = [...String(bd.stderr).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => [+m[1], +m[2]]);
  const lead = pairs.filter(p => p[0] < 0.6).map(p => p[1]).sort((a, b) => a - b)[0];
  const start = lead === undefined ? 0 : lead;

  run(['-y', '-ss', start.toFixed(3), '-t', String(LEN), '-i', webm,
       '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
       '-r', '30', path.join(dir, 'film.mp4')]);

  const final = path.join(dir, story.id + '-' + ratio + '.mp4');
  run(['-y', '-i', path.join(dir, 'film.mp4'), '-i', MIX,
       '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
       '-movflags', '+faststart', final]);
  fs.rmSync(webm, { force: true });
  fs.rmSync(path.join(dir, 'film.mp4'), { force: true });

  const info = String(spawnSync(ffmpeg, ['-hide_banner', '-i', final], { encoding: 'utf8' }).stderr);
  const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(info);
  console.log('ok  ' + W + 'x' + H + '  ' + (d ? (+d[1] * 3600 + +d[2] * 60 + +d[3]).toFixed(2) : '?') + 's  ' +
    (fs.statSync(final).size / 1048576).toFixed(1) + ' MB');
  return final;
}

(async () => {
  const list = ONLY_STORY ? STORIES.filter(s => s.id === ONLY_STORY) : STORIES;
  const ratios = ONLY_RATIO ? [ONLY_RATIO] : Object.keys(RATIOS);
  const made = [];
  for (const s of list) for (const r of ratios) made.push(await film(s, r));
  console.log('\n' + made.length + ' film(s) in ' + ROOT);
})();