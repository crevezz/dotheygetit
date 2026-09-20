/* scratch: candidate brand marks for Get It?, drawn by Seedream.
   Icons only - no words. An image model is good at a shape and bad at type, so
   the wordmark stays in our own font (brand/mark.js draws everything from one
   file, and a generated PNG cannot go in that pipeline without breaking it).

   Writes brand/out/logo-candidates/<id>.jpg + a contact sheet.
   Re-runs are free: the still url is cached in <id>.url. FORCE=1 redraws. */
const fs = require('fs'), path = require('path'), https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT = path.join(HERE, '..', 'brand', 'out', 'logo-candidates');
const KEY = (process.env.KIE_KEY || fs.readFileSync(path.join(HERE, '.kie.key'), 'utf8')).trim();
const API = 'https://api.kie.ai';
const MODEL = 'seedream/5-pro-text-to-image';
const FORCE = process.env.FORCE === '1';
fs.mkdirSync(OUT, { recursive: true });

/* The rules every candidate shares. Written as constraints, because a model
   asked for "a logo" gives you a mockup with invented lettering on it. */
const RULES = ' Flat vector icon, app-icon style. ONE single simple symbol, dead centre, ' +
  'filling about 70% of the frame. Thick even strokes, rounded caps, generous negative space. ' +
  'NO text, NO letters, NO words, NO numbers, NO initials, NO watermark, NO mockup, NO shadow, ' +
  'NO 3D, NO photo, NO texture. Solid flat colours only.';

const CANDIDATES = [
  { id: 'c1-tick-tile', prompt:
    'A bold white check mark tick on a deep navy square tile with softly rounded corners, ' +
    'filled with a smooth blue to violet gradient, the tick drawn as two thick rounded strokes.' + RULES },
  { id: 'c2-tick-question', prompt:
    'A single mark that is a check mark tick whose tail curls up into the hook of a question mark, ' +
    'so it reads as both a tick and a question at once. Thick rounded white stroke on a deep navy ' +
    'square tile with softly rounded corners.' + RULES },
  { id: 'c3-tick-ring', prompt:
    'A white check mark tick inside a thick open circle ring, the ring broken at the top right ' +
    'so it suggests a question mark. Deep navy background, blue to violet gradient on the ring.' + RULES },
  { id: 'c4-two-strokes', prompt:
    'A minimalist check mark tick made of exactly two thick rounded strokes, the short stroke ' +
    'detached and floating slightly apart from the long one, in a bright blue to violet gradient ' +
    'on a near-black navy square.' + RULES }
];

function req(method, url, body) {
  return new Promise((res, rej) => {
    const s = body ? JSON.stringify(body) : null;
    const r = https.request({ hostname: 'api.kie.ai', path: url, method,
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
                 ...(s ? { 'Content-Length': Buffer.byteLength(s) } : {}) } }, x => {
      let d = ''; x.on('data', c => d += c); x.on('end', () => {
        let j = null; try { j = JSON.parse(d); } catch (e) { return rej(new Error('not json: ' + d.slice(0, 200))); }
        if (j.code !== 200) return rej(new Error('kie error ' + j.code + ': ' + j.msg));
        res(j.data || j);
      });
    });
    r.on('error', rej);
    r.setTimeout(120000, () => r.destroy(new Error('timeout')));
    if (s) r.write(s);
    r.end();
  });
}
function download(url, file) {
  return new Promise((res, rej) => {
    https.get(url, x => {
      if (x.statusCode >= 300 && x.statusCode < 400 && x.headers.location) return download(x.headers.location, file).then(res, rej);
      if (x.statusCode !== 200) return rej(new Error('http ' + x.statusCode));
      const f = fs.createWriteStream(file); x.pipe(f); f.on('finish', () => f.close(res));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(z => setTimeout(z, ms));

async function task(input, what) {
  const d = await req('POST', '/api/v1/jobs/createTask', { model: MODEL, input });
  const id = d.taskId || d.task_id;
  if (!id) throw new Error(what + ': no taskId');
  const t0 = Date.now();
  for (;;) {
    await sleep(6000);
    const s = await req('GET', '/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(id));
    const state = s.state || s.status;
    if (state === 'success') {
      const r = typeof s.resultJson === 'string' ? JSON.parse(s.resultJson) : (s.resultJson || {});
      const urls = r.resultUrls || r.result_urls || [];
      if (!urls.length) throw new Error(what + ': no resultUrls');
      return urls[0];
    }
    if (state === 'fail' || state === 'failed') throw new Error(what + ' failed: ' + (s.failMsg || 'no reason'));
    process.stdout.write('    ' + what + ' ' + state + ' ' + Math.round((Date.now() - t0) / 1000) + 's\r');
  }
}

(async () => {
  for (const c of CANDIDATES) {
    const jpg = path.join(OUT, c.id + '.jpg');
    const cache = path.join(OUT, c.id + '.url');
    if (fs.existsSync(jpg) && !FORCE) { console.log('  ' + c.id + '  cached'); continue; }
    let url = !FORCE && fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8').trim() : null;
    if (!url) {
      url = await task({ prompt: c.prompt, aspect_ratio: '1:1', quality: 'high', output_format: 'jpeg' }, c.id);
      fs.writeFileSync(cache, url);
    }
    await download(url, jpg);
    console.log('\n  ' + c.id + '  ' + (fs.statSync(jpg).size / 1024).toFixed(0) + ' KB');
  }
  /* one sheet: 2x2, each 512, so all four can be judged side by side */
  const have = CANDIDATES.map(c => path.join(OUT, c.id + '.jpg')).filter(f => fs.existsSync(f));
  const args = ['-y', '-hide_banner'];
  have.forEach(f => args.push('-i', f));
  const fc = have.map((f, i) => '[v' + i + ']').join('') +
    'xstack=inputs=' + have.length + ':layout=' +
    have.map((f, i) => (i % 2) * 512 + '_' + Math.floor(i / 2) * 512).join('|') + '[out]';
  have.forEach(f => args.push('-i', f));
  const scale = have.map((f, i) => '[' + (have.length + i) + ':v]scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x0b1224[s' + i + ']').join(';');
  spawnSync(ffmpeg, ['-y', '-hide_banner'].concat(
    have.map(f => ['-i', f]).flat()).concat(['-filter_complex',
    scale + ';' + have.map((f, i) => '[s' + i + ']').join('') + 'xstack=inputs=' + have.length +
    ':layout=' + have.map((f, i) => (i % 2) * 512 + '_' + Math.floor(i / 2) * 512).join('|') + '[out]',
    '-map', '[out]', '-frames:v', '1', path.join(OUT, '_sheet.jpg')]), { encoding: 'utf8' });
  console.log('\n  sheet -> brand/out/logo-candidates/_sheet.jpg');
})();
