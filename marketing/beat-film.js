/* The beat engine. Turns a written script (marketing/scripts/<id>.json) into a
 * finished 9:16 advert, with voiceover, on screen text and a picture per beat.
 *
 *   node marketing/beat-film.js                    every script, all canvases
 *   node marketing/beat-film.js plainly            just that one
 *   node marketing/beat-film.js plainly --skip-vo  silent cut, to look at the pictures
 *   QA=1 node marketing/beat-film.js plainly       dump two stills per beat, no encode
 *   FPS=30 SIZES=story,square node marketing/beat-film.js
 *
 * HOW THE TIMING WORKS
 * The voiceover decides the pace, not the script. Each beat's line is spoken
 * first and measured; the beat then lasts as long as its own voice plus a
 * breath, or as long as the script asked for, whichever is longer. So a line
 * can never be cut off, and a beat with no voice still gets its time on screen.
 * The cut is the sum of the beats - usually 20 to 24 seconds.
 *
 * Frames are shot, not screen-recorded: template.js exposes window.__at(t) and
 * we ask the page for its exact state at every t. Same reason as ad-film.js -
 * deterministic, repeatable, and the type stays sharp.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => {
  try { return require('ffmpeg-static'); }
  catch { return require('../tutorial/node_modules/ffmpeg-static'); }
})();
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const T = require('./tokens');
const S = require('./scenes');
const { cfgFor } = require('./beats.config');

const SCRIPTS = path.join(__dirname, 'scripts');
const OUT = path.join(__dirname, 'out', 'beats');
const VODIR = path.join(OUT, 'vo');
const FPS = Number(process.env.FPS || 25);
const SIZES = (process.env.SIZES || 'story').split(',');
const QA = !!process.env.QA;
/* 1 (default) freezes beat 0 as the poster still. 2 keeps beat 0 fully opaque
   from frame one but lets it move, so there is no frozen opening. 0 restores
   the original fade-in (a near-empty first frame). */
const POSTER_MODE = Number(process.env.POSTER === undefined ? 1 : process.env.POSTER);
/* suffix for the output file, so a variant cut never overwrites the posted one */
const SUF = process.env.OUTNAME ? '-' + process.env.OUTNAME : '';
const CFADE = 0.35;          /* cross-fade between beats */
const BREATH = 0.45;         /* silence after a spoken line before the cut */
const SPEED = Number(process.env.VO_SPEED || 1.1);   /* ad pace: speech runs ~10% hot */

const ENVFILE = 'C:/Users/CREVE/Desktop/apps/Websites/RapidWeb/social bot/.env';
const envText = (() => { try { return fs.readFileSync(ENVFILE, 'utf8'); } catch { return ''; } })();
const env = (k) => ((envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const KEY = process.env.ELEVENLABS_API_KEY || env('ELEVENLABS_API_KEY');
const VOICE = process.env.VOICE_ID || 'llNlEi50DSCIEuoOIaH7';
const TICK = 'data:image/svg+xml;base64,' +
  fs.readFileSync(path.join(__dirname, '..', 'brand', 'out', 'tick-white.svg')).toString('base64');

const run = (args, opts = {}) => {
  const r = spawnSync(ffmpeg, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 26 }, opts));
  if (r.status !== 0) throw new Error(String(r.stderr || '').slice(-900));
  return String(r.stderr || '');
};
const dur = (f) => {
  const r = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = String(r.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

/* ------------------------------------------------------------- voiceovers */
async function voice(text, id, i) {
  const mp3 = path.join(VODIR, `${id}-${i}.mp3`);
  if (fs.existsSync(mp3)) return mp3;
  if (!KEY) throw new Error('no ElevenLabs key (set ELEVENLABS_API_KEY)');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: process.env.VO_MODEL || 'eleven_v3',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error('ElevenLabs ' + res.status + ': ' + (await res.text()).slice(0, 240));
  fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  return mp3;
}

/* --------------------------------------------------------- scene plumbing */
function paramsFor(scene, i, beat, cfg) {
  const own = cfg.params[i];
  const ownObj = own && typeof own === 'object' ? own : {};
  const swap = typeof own === 'string' ? { scene: own } : {};
  switch (scene) {
    case 'classroom': return Object.assign({ board: cfg.board }, ownObj);
    case 'laptop': return Object.assign({ typed: cfg.typed, questions: cfg.questions }, ownObj);
    case 'phone': return Object.assign({ q: cfg.questions[0], answer: cfg.answer, mode: cfg.mode }, ownObj);
    case 'results': return Object.assign({
      topic: cfg.resTopic, sub: cfg.resSub, foot: cfg.resFoot,
      g: cfg.cols.g, a: cfg.cols.a, r: cfg.cols.r,
    }, ownObj);
    case 'domain': return Object.assign({ sub: 'Free. Nothing to install.' }, ownObj);
    default: return ownObj;
  }
}

/* The page: one stacked scene per beat, plus the driver __at(t). */
function page(id, script, cfg, size, beats) {
  const scenes = beats.map((b, i) => {
    const scene = b.spec.scene;
    const built = S.SCENES[scene](b.beat, b.spec.params);
    const parts = S.split(b.beat.onscreen);
    const cls = built.cap === 'center' ? 'scene centre push' : 'scene';
    const cap = built.cap === 'none' ? '' :
      `<div class="cap"><span class="ln l1">${S.esc(parts.l1)}</span>${parts.l2 ? `<span class="ln l2">${S.esc(parts.l2)}</span>` : ''}</div>`;
    const attrs = [built.typed ? `data-typed="${S.esc(built.typed)}"` : '', built.nod ? 'data-nod="1"' : '',
      built.night ? 'data-night="1"' : '',
      built.mode ? `data-mode="${S.esc(built.mode)}"` : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-i="${i}" data-scene="${scene}" ${attrs}>${cap}${built.cap === 'center' ? '' : `<div class="stage">${built.html}</div>`}</div>`;
  }).join('\n');

  const plan = beats.map((b) => ({ s: +b.start.toFixed(3), d: +b.dur.toFixed(3) }));
  const paints = beats.map((b) => {
    const built = S.SCENES[b.spec.scene](b.beat, b.spec.params);
    return '(' + built.paint.toString() + ')';
  });

  return `<!doctype html><html><head><meta charset="utf-8"><style>${S.css(size)}</style></head><body>
<div class="card">
  <div class="wmark"><img src="${TICK}" alt=""><span><b>Get It?</b> &middot; dotheygetit.app</span></div>
${scenes}
</div>
<script>
var PLAN = ${JSON.stringify(plan)};
var PAINT = [${paints.join(',')}];
var FADE = ${CFADE};
var els = [].slice.call(document.querySelectorAll('.scene'));
var wmark = document.querySelector('.wmark');
var all = [].slice.call(document.querySelectorAll('.cap .ln'));
/* cap lines belong to their scene; keep the mapping for the entrance */
var capOf = els.map(function (e) { return [].slice.call(e.querySelectorAll('.cap .ln')); });
function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function ease(q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); }
window.__len = PLAN.reduce(function (a, b) { return a + b.d; }, 0);
/* Beat 0 is a still. Platforms grab an early frame as the thumbnail, and until
   now beat 0 faded in from nothing (opacity 0 at T=0) and then animated, so the
   frame they grabbed was a half-transparent, unfinished composition. Beat 0 now
   opens fully composed, fully opaque, with the brand lockup already on, and does
   not move for its whole length. Motion starts at beat 1.
   POSTER=1 (default) freezes beat 0 as the poster. POSTER=2 keeps beat 0 fully
   opaque from frame one but lets it MOVE, so there is no frozen opening and no
   faded-in first frame either. POSTER=0 restores the original fade-in. */
var POSTER = ${POSTER_MODE};
var POSTER_STILL = POSTER === 1;
window.__at = function (T) {
  for (var i = 0; i < PLAN.length; i++) {
    var b = PLAN[i], el = els[i];
    var t = T - b.s;
    var end = b.s + b.d;
    var last = i === PLAN.length - 1;
    var still = (i === 0 && POSTER_STILL);
    var op;
    if (still || (i === 0 && POSTER === 2)) {
      op = T > end ? clamp(1 - (T - end) / FADE) : 1;    /* opaque from frame one */
    } else {
      op = 1;
      if (t < 0) op = 0;
      else if (t < FADE) op = t / FADE;
      else if (T > end) op = 1 - (T - end) / FADE;       /* cross-fade out */
      op = clamp(op);
    }
    el.style.opacity = (last && T > end ? 1 : op).toFixed(3);
    el.style.visibility = el.style.opacity === '0' ? 'hidden' : 'visible';
    if (t > -FADE && T < end + FADE) {
      capOf[i].forEach(function (ln, j) {
        var q = (still || (i === 0 && POSTER === 2)) ? 1 : ease((t - 0.12 - j * 0.2) / 0.62);
        ln.style.opacity = q.toFixed(3);
        ln.style.transform = 'translateY(' + ((1 - q) * 26).toFixed(1) + 'px)';
        ln.style.filter = 'blur(' + ((1 - q) * 12).toFixed(2) + 'px)';
      });
      var tt = (i === 0 && POSTER === 2) ? t + 0.3 : t; PAINT[i](el, still ? 1 : clamp(tt / b.d), still ? b.d : Math.max(0, tt));
      if (!still && el.className.indexOf('push') >= 0) {
        el.style.transform = 'scale(' + (1 + 0.035 * clamp(t / b.d)).toFixed(4) + ')';
      }
    }
  }
  /* the brand lockup is part of the poster, so it is on from frame one */
  var posterOn = PLAN[0] && T <= PLAN[0].s + PLAN[0].d;
  var w = posterOn ? 1 : ease((T - PLAN[1].s + 0.2) / 0.6);
  var lastB = PLAN[PLAN.length - 1]; if (T > lastB.s) w *= clamp(1 - (T - lastB.s) / 0.3);
  if (wmark) { wmark.style.opacity = (w * 0.9).toFixed(3); wmark.style.transform = 'translateY(' + ((1 - w) * 8).toFixed(1) + 'px)'; }
};
/* Safety net: if a picture is taller than the space left for it, scale the
   picture down rather than clip it. Measured once, in the beats' landed state,
   so the scale never changes mid-shot. Animation only moves things by a few
   pixels, so a fit taken from the end state is a fit for the whole beat. */
window.__fit = [];
/* Fit the picture to the space left for it - now in BOTH directions.

   It used to clamp at 1, so a scene could only ever be shrunk. Every picture in
   the library was drawn comfortably smaller than the stage, so nothing pulled it
   back up and the opening beats sat in a void: the classroom filled 57% of its
   stage, the desk 31%, the pupil phone 36%. That void is the dead space.

   It also measured [kid] plus descendants, so a scene whose wrapper was
   height:100% (.dk, .corr) always measured as the whole stage and could never
   grow - its real ink was a fraction of that. Now an element that fills the
   stage is treated as layout, not ink, and is skipped in the measurement, so
   the desk measures its books rather than its empty wrapper.

   GROW caps how far a picture may be blown up; scaling interpolation stays
   cheap and the art keeps its intended weight. It still never clips: the fit is
   the min over both axes, so the scaled ink always lands inside the stage. */
var GROW = Number('${process.env.FIT_GROW || 1.8}');
function fit() {
  function ink(kid, SW, SH) {
    var b = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    [kid].concat([].slice.call(kid.querySelectorAll('*'))).forEach(function (e) {
      if (e.classList && (e.classList.contains('arm') || e.classList.contains('tab'))) return;
      var r = e.getBoundingClientRect();
      if (!r.width && !r.height) return;
      /* layout, not picture: a box that is the whole stage is a wrapper */
      if (r.width >= SW - 2 && r.height >= SH - 2) return;
      b.left = Math.min(b.left, r.left); b.right = Math.max(b.right, r.right);
      b.top = Math.min(b.top, r.top); b.bottom = Math.max(b.bottom, r.bottom);
    });
    b.w = b.right - b.left; b.h = b.bottom - b.top;
    return b;
  }
  els.forEach(function (el, i) {
    var st = el.querySelector('.stage');
    if (!st) { window.__fit[i] = 1; return; }
    var kid = st.firstElementChild;
    if (!kid) { window.__fit[i] = 1; return; }
    /* The scale goes on .stage, NOT on the picture. Several paints write
       transform themselves at every frame (the phone rises with a translateY),
       so scaling the picture meant paint overwrote the fit on the first frame
       and the phone silently stayed at its drawn size. .stage is never touched
       by paint. */
    st.style.transformOrigin = 'center center';
    st.style.transform = 'none';
    var SW = st.clientWidth, SH = st.clientHeight;
    var d = ink(kid, SW, SH);
    if (!isFinite(d.w) || !isFinite(d.h) || d.w <= 0 || d.h <= 0) { window.__fit[i] = 1; return; }
    var s = Math.min(GROW, (SW - 4) / d.w, (SH - 4) / d.h);
    if (!isFinite(s) || s <= 0) s = 1;
    if (s > 0.985 && s < 1.015) s = 1;
    st.style.transform = s === 1 ? 'none' : 'scale(' + s.toFixed(4) + ')';
    /* A picture scales about the stage's centre, so anything sitting off-centre
       drifts a further-off-centre amount further out as it grows - the clock on
       the night desk ended up 48px into the right-hand inset. Measure where the
       ink actually landed and pull the scale back until it is inside the stage
       box again. Comparing widths was not enough: it has to be the edges. */
    for (var pass = 0; pass < 5; pass++) {
      var b = ink(kid, SW, SH);
      if (!isFinite(b.w) || !isFinite(b.h) || b.w <= 0 || b.h <= 0) break;
      var sb = st.getBoundingClientRect();
      var cx = (sb.left + sb.right) / 2, cy = (sb.top + sb.bottom) / 2;
      var hw = SW / 2 - 2, hh = SH / 2 - 2;
      var ox = Math.max((b.right - (cx + hw)) / hw, ((cx - hw) - b.left) / hw);
      var oy = Math.max((b.bottom - (cy + hh)) / hh, ((cy - hh) - b.top) / hh);
      var o = Math.max(ox, oy);
      if (!(o > 0.0008)) break;
      s = s / (1 + o);
      st.style.transform = 'scale(' + s.toFixed(4) + ')';
    }
    window.__fit[i] = +s.toFixed(3);
  });
}
PAINT.forEach(function (f, i) { f(els[i], 1, PLAN[i].d); });
fit();
window.__at(0);
</script>
</body></html>`;
}

/* ------------------------------------------------------------------- main */
async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const skipVo = process.argv.includes('--skip-vo');
  const only = args.find((a) => fs.existsSync(path.join(SCRIPTS, a + '.json'))) || null;
  const wantSize = args.find((a) => T.sizes.some((s) => s.id === a));
  if (!KEY && !skipVo) throw new Error('ElevenLabs key not found (social bot .env or ELEVENLABS_API_KEY)');

  const files = (only ? [only + '.json'] : fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.json'))).sort();
  const sizes = wantSize ? T.sizes.filter((s) => s.id === wantSize) : T.sizes.filter((s) => SIZES.includes(s.id));
  fs.mkdirSync(VODIR, { recursive: true });
  const qa = path.join(OUT, 'qa');
  if (QA) fs.mkdirSync(qa, { recursive: true });

  const browser = await chromium.launch();
  const sheet = [];
  let n = 0;

  for (const f of files) {
    const script = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
    const id = script.id || path.basename(f, '.json');
    const cfg = cfgFor(id);

    /* 1. picture per beat, and the voice that goes with it */
    const spoken = [];
    const beats = [];
    let start = 0;
    for (let i = 0; i < script.beats.length; i++) {
      const beat = script.beats[i];
      const scene = cfg.overrides[i] || S.pick(beat, cfg);
      const params = paramsFor(scene, i, beat, cfg);
      let vo = 0, mp3 = null;
      if (beat.vo && !skipVo) {
        mp3 = await voice(beat.vo, id, i);
        vo = dur(mp3) / SPEED;
      }
      const want = Math.max(Number(beat.seconds) || 3, Math.min(vo + BREATH, 9));
      const d = Math.max(1.8, want);
      beats.push({ beat, spec: { scene, params }, start, dur: d, vo, mp3 });
      start += d;
      console.log(`  ${id} beat ${i}  ${scene.padEnd(9)} ${d.toFixed(2)}s  vo ${vo.toFixed(2)}s  "${String(beat.onscreen).slice(0, 44)}"`);
    }
    const total = beats.reduce((a, b) => a + b.dur, 0);

    for (const size of sizes) {
      const html = page(id, script, cfg, size, beats);
      const pg = await (await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 })).newPage();
      await pg.setContent(html, { waitUntil: 'load' });
      await pg.waitForTimeout(120);

      if (QA) {
        for (let i = 0; i < beats.length; i++) {
          for (const ph of [0.6, 0.95]) {
            await pg.evaluate((x) => window.__at(x), beats[i].start + beats[i].dur * ph);
            await pg.waitForTimeout(30);
            await pg.screenshot({ path: path.join(qa, `${id}-${i}-${ph === 0.6 ? 'mid' : 'end'}.jpg`), type: 'jpeg', quality: 88 });
          }
        }
        await pg.close();
        continue;
      }

      const tmp = path.join(OUT, '_f-' + id + '-' + size.id);
      fs.mkdirSync(tmp, { recursive: true });
      const frames = Math.round(total * FPS);
      for (let k = 0; k < frames; k++) {
        await pg.evaluate((x) => window.__at(x), k / FPS);
        await pg.screenshot({ path: path.join(tmp, String(k).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 });
      }
      await pg.close();

      const file = path.join(OUT, `${id}-${size.id}${SUF}.mp4`);
      const args2 = ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, '%05d.jpg')];

      /* 2. the voice track: each line placed at its own beat, then a music bed */
      const audio = beats.filter((b) => b.mp3);
      if (audio.length) {
        /* The bed is mastered hot: mean -12.9 dB, peaking at 0.0. The voice sits
           at mean -15 dB, so the bed needs a deep cut to sit UNDER it, not with
           it. 0.075 (-22.5 dB) put the music at about -35 dB - inaudible, which
           is why the ads sounded like they had no music at all. 0.16 (-15.9 dB)
           lands the bed near -29 dB: clearly present, still under the words.
           MUSIC=0 renders voice-only. MUSIC_VOL overrides the level. */
        const music = process.env.MUSIC === '0' ? null : path.join(__dirname, 'out', 'background.mp3');
        const mvol = Number(process.env.MUSIC_VOL || 0.16);
        let idx = 1;
        const chains = [];
        for (const b of beats) {
          if (!b.mp3) continue;
          args2.push('-i', b.mp3);
          chains.push(`[${idx}:a]atempo=${SPEED},adelay=${Math.round(Math.max(0, b.start - 0.05) * 1000)}|${Math.round(Math.max(0, b.start - 0.05) * 1000)},volume=1.0[v${idx}]`);
          idx++;
        }
        const labels = chains.map((c, i) => `[v${i + 1}]`).join('');
        let fc = chains.join(';') + ';' + labels + `amix=inputs=${chains.length}:normalize=0:dropout_transition=0[vo]`;
        if (music && fs.existsSync(music)) {
          args2.push('-stream_loop', '-1', '-i', music);
          fc += `;[${idx}:a]volume=${mvol},afade=t=in:st=0:d=0.6,afade=t=out:st=${(total - 1.1).toFixed(2)}:d=1.1[mus];[vo][mus]amix=inputs=2:normalize=0[mix]`;
        } else {
          fc += ';[vo]anull[mix]';
        }
        fc += `;[mix]apad,afade=t=out:st=${(total - 0.7).toFixed(2)}:d=0.7[a]`;
        args2.push('-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-t', total.toFixed(2));
      }

      args2.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', file);
      run(args2);
      fs.rmSync(tmp, { recursive: true, force: true });
      sheet.push({ id, size: size.id, file, total });
      console.log(`  ok    ${id}-${size.id}  ${total.toFixed(1)}s  ${size.w}x${size.h}  ${(fs.statSync(file).size / 1048576).toFixed(2)} MB`);
    }
  }

  await browser.close();
  if (!QA) fs.writeFileSync(path.join(OUT, 'index.html'), sheetHtml(sheet));
  console.log(`\n  ${QA ? 'stills' : 'films'} -> marketing/out/beats`);
}

if (require.main === module) main().catch((e) => { console.error('\nFAIL ' + e.message); process.exit(1); });

function sheetHtml(sheet) {
  const tiles = sheet.map((m) => `<figure>
  <video src="${path.basename(m.file)}" controls muted loop playsinline preload="metadata"></video>
  <figcaption>${m.id} &middot; ${m.size} &middot; ${m.total.toFixed(1)}s</figcaption>
</figure>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Get It? adverts</title>
<style>body{margin:0;padding:40px;background:${T.colors.bg};color:${T.colors.text};font-family:${T.type.family}}
h1{font-size:20px;font-weight:800;margin:0 0 4px}p{color:${T.colors.muted};font-size:14px;margin:0 0 34px}
.grid{display:grid;gap:28px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));align-items:start}
figure{margin:0}video{width:100%;display:block;border-radius:10px;border:1px solid ${T.colors.line};background:#070a1a}
figcaption{margin-top:9px;font-size:12.5px;color:${T.colors.muted}}</style>
<h1>Get It? adverts</h1><p>${sheet.length} films &middot; beat engine &middot; script by Opus, pictures by scenes.js</p>
<div class="grid">${tiles}</div>`;
}

module.exports = { page, paramsFor };
