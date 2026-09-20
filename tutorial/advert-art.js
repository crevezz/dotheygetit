/* ============================================================================
   advert-art.js - the advert's atmosphere shots.

   Two stages, and the order matters:
     1. Seedream draws the FRAME. We control the composition.
     2. ffmpeg zoompan moves over THAT frame (Ken Burns).
   A video model was buying risk, not quality: these two clips are atmosphere
   behind a scrim for about four seconds in total, so a slow drift on a still
   reads the same, costs nothing, never returns a 422, and re-renders the moment
   the grade changes.

   Then the three things that stop generated footage looking generated:
     - keep the move slow enough that it never announces itself
     - blur it and drop the contrast (sharpness is what exposes it)
     - grade it into the same navy the rest of the advert uses, and hold it back
       just enough that the type on top still reads

   Reads art.json. Writes out/advert/art/<id>.mp4 at 1080x1920, 30fps.
   Each clip is cut to the length of the beat it backs (from timeline.json).
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT = path.join(HERE, 'out', 'advert');
const ART = path.join(OUT, 'art');
fs.mkdirSync(ART, { recursive: true });

const KEY = (process.env.KIE_KEY || fs.readFileSync(path.join(HERE, '.kie.key'), 'utf8')).trim();
const API = 'https://api.kie.ai';
const spec = JSON.parse(fs.readFileSync(path.join(HERE, 'art.json'), 'utf8'));

const W = 1080, H = 1920, FPS = 30;
const FORCE = process.env.FORCE === '1';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ---- Kie: create a task, wait for it, hand back the file URL --------------- */
function req(method, url, body) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: Object.assign({ Authorization: 'Bearer ' + KEY },
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, x => {
      const c = [];
      x.on('data', d => c.push(d));
      x.on('end', () => {
        const t = Buffer.concat(c).toString();
        let j = null;
        try { j = JSON.parse(t); } catch (e) { /* not json */ }
        if (!j) return rej(new Error('kie sent non-JSON (' + x.statusCode + '): ' + t.slice(0, 200)));
        if (j.code !== 200) return rej(new Error('kie error ' + j.code + ': ' + j.msg));
        res(j.data);
      });
    });
    r.on('error', rej);
    r.setTimeout(120000, () => r.destroy(new Error('kie request timed out')));
    if (data) r.write(data);
    r.end();
  });
}

function download(url, file) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, x => {
      if (x.statusCode >= 300 && x.statusCode < 400 && x.headers.location) {
        return download(x.headers.location, file).then(res, rej);
      }
      if (x.statusCode !== 200) { x.resume(); return rej(new Error('download ' + x.statusCode)); }
      const s = fs.createWriteStream(file);
      x.pipe(s);
      s.on('finish', () => res(file));
      s.on('error', rej);
    }).on('error', rej);
  });
}

async function task(model, input, what) {
  const d = await req('POST', API + '/api/v1/jobs/createTask', { model, input });
  const id = d && (d.taskId || d.task_id);
  if (!id) throw new Error(what + ': no taskId came back');
  const t0 = Date.now();
  for (;;) {
    await sleep(6000);
    const s = await req('GET', API + '/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(id));
    const state = s.state || s.status;
    if (state === 'success') {
      const r = typeof s.resultJson === 'string' ? JSON.parse(s.resultJson) : (s.resultJson || {});
      const urls = r.resultUrls || r.result_urls || [];
      if (!urls.length) throw new Error(what + ': succeeded but sent no resultUrls');
      return urls[0];
    }
    if (state === 'fail' || state === 'failed') {
      throw new Error(what + ' failed: ' + (s.failMsg || s.failCode || 'no reason given'));
    }
    process.stdout.write('    ' + what + ' ' + state + ' ' + Math.round((Date.now() - t0) / 1000) + 's\r');
  }
}

async function credits() {
  try { return (await req('GET', API + '/api/v1/chat/credit')); } catch (e) { return '?'; }
}

/* The Seedream endpoint documents a default for `quality` but still rejects the
   request without it - it comes back as a bare "This field is required". */
const stillInput = s => ({
  prompt: s.still, aspect_ratio: '9:16', quality: spec.quality || 'high', output_format: 'jpeg'
});
/* The camera move, in ffmpeg. The still is scaled up first so there is room to
   travel without softening, then zoompan crops a window out of it that slowly
   changes. `on` is the output frame number and D the total, so the move is
   expressed once as a fraction of the clip however long the clip is. */
const MOVES = {
  'push-in':     D => ({ z: '1+0.10*on/' + D, x: '(iw-iw/zoom)/2',      y: '(ih-ih/zoom)/2' }),
  'drift-right': D => ({ z: '1.06',          x: '(iw-iw/zoom)*on/' + D, y: '(ih-ih/zoom)/2' })
};
const move = (k, D) => (MOVES[k] || MOVES['push-in'])(D);

/* ---- ffmpeg ---------------------------------------------------------------- */
function ff(args, what) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('\n' + what + ' failed\n' + (r.stderr || '').split('\n').slice(-12).join('\n'));
    process.exit(1);
  }
}
function dur(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}

(async () => {
  const tl = JSON.parse(fs.readFileSync(path.join(OUT, 'timeline.json'), 'utf8'));
  const beat = id => { const s = tl.shots.find(x => x.id === id); return s ? s.e - s.t : 3; };

  log('advert art  ' + spec.shots.length + ' shots   credits ' + (await credits()));

  for (const s of spec.shots) {
    const clip = path.join(ART, s.id + '.mp4');
    const still = path.join(ART, s.id + '-still.jpg');
    const urlFile = path.join(ART, s.id + '-still.url');
    const want = +(beat(s.for) + 0.8).toFixed(2);

    if (fs.existsSync(clip) && !FORCE) { log('  ' + s.id + '  cached'); continue; }

    /* 1. the frame */
    let src = null;
    if (!FORCE && fs.existsSync(urlFile)) src = fs.readFileSync(urlFile, 'utf8').trim();
    if (!src || !fs.existsSync(still)) {
      log('  ' + s.id + '  drawing the frame ...');
      src = await task(spec.still_model, stillInput(s), 'still');
      await download(src, still);
      fs.writeFileSync(urlFile, src);
      log('\n  + ' + path.basename(still) + '  ' + (fs.statSync(still).size / 1024).toFixed(0) + ' KB');
    }

    /* 2. move over that frame (Ken Burns) and grade it into the navy -------- */
    const frames = Math.max(2, Math.round(want * FPS));
    const M = move(s.kb, frames);
    log('  ' + s.id + '  ' + (s.kb || 'push-in') + ' over the still, ' + want.toFixed(2) + 's ...');
    ff(['-y', '-hide_banner', '-i', still,
      '-vf', 'scale=' + (W * 1.5) + ':' + (H * 1.5) + ':force_original_aspect_ratio=increase,' +
             'crop=' + (W * 1.5) + ':' + (H * 1.5) + ',' +
             "zoompan=z='" + M.z + "':x='" + M.x + "':y='" + M.y + "':d=" + frames +
             ':s=' + W + 'x' + H + ':fps=' + FPS + ',' +
             'gblur=sigma=1.6,' +
             'eq=saturation=0.62:contrast=0.92:brightness=-0.02,' +
             'colorbalance=bs=0.07:bm=0.045:bh=0.02,' +   /* b=blue, s/m/h = shadows/mid/high */
             'vignette=PI/5,' +
             'format=yuv420p',
      '-frames:v', String(frames),
      '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', clip], s.id + ' ken burns');

    log('  = ' + path.basename(clip) + '  ' + dur(clip).toFixed(2) + 's (beat ' +
        beat(s.for).toFixed(2) + 's)  ' + (fs.statSync(clip).size / 1048576).toFixed(1) + ' MB');
    /* the still is kept: it is the only way to see what the grade is doing, and
       re-drawing one to compare costs credits */
  }

  log('\n  credits ' + (await credits()));
  log('  ' + ART);
})();
