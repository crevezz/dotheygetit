/* marketing/_eyes.js - put a beat film in front of a vision model.
   Same trick as tutorial/_eyes.js: no Gemini key of our own, but the Kie key
   proxies Google's models OpenAI-style, so a data-URL JPEG per frame works.

   usage: node marketing/_eyes.js quiet [t1,t2,...]        (default: 7 samples)
          node marketing/_eyes.js quiet-story-motion.mp4 0,2,9
   Writes the sampled frames to marketing/out/beats/eyes/ so they can be
   re-sent cheaply, and prints the model's answer verbatim. */
const fs = require('fs'), path = require('path'), https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();

const HERE = __dirname;
const OUT = path.join(HERE, 'out', 'beats');
const EYES = path.join(OUT, 'eyes');
const KEYPATH = path.join(HERE, '..', 'tutorial', '.kie.key');
const KEY = (process.env.KIE_KEY || fs.readFileSync(KEYPATH, 'utf8')).trim();
const MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

const arg = process.argv[2] || 'quiet';
const name = arg.endsWith('.mp4') ? arg : arg + '-story.mp4';
const VID = path.join(OUT, name);
if (!fs.existsSync(VID)) throw new Error('no such film: ' + VID);
const id = name.replace(/-story.*\.mp4$/, '');
const SPEC = process.argv[3] || '';
const TL = fs.existsSync(path.join(OUT, 'qa'))
  ? JSON.parse(fs.readFileSync(path.join(HERE, 'scripts', id + '.json'), 'utf8')) : null;

fs.mkdirSync(EYES, { recursive: true });

let times;
if (SPEC) times = SPEC.split(',').map(Number);
else if (TL && TL.beats) {
  /* beat 0 at 0s (that is the frame platforms grab as the thumbnail), then the
     middle of each beat, so every line has one frame looking at it */
  const BEAT = 3.2;
  times = [0].concat(TL.beats.map((b, i) => +(i * BEAT + (Number(b.seconds) || BEAT) / 2).toFixed(2)));
} else times = [0, 3, 7, 11, 15, 19, 24];

const files = times.map((t) => {
  const out = path.join(EYES, id + '-' + String(t).replace('.', '_') + '.jpg');
  spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', VID,
    '-frames:v', '1', '-vf', 'scale=540:960', '-q:v', '4', out], { encoding: 'utf8' });
  return { t, file: out, ok: fs.existsSync(out) };
}).filter((f) => f.ok);

const ASK = `You are a creative director reviewing a 9:16 vertical advert for teachers before it goes out.
${files.length} frames from the film "${id}" (${times.length} samples), in order. The script's own lines are:
${TL && TL.beats ? TL.beats.map((b, i) => (i + 1) + '. on screen: "' + b.onscreen + '"  voice: "' + b.vo + '"').join('\n') : '(script not found)'}

Answer in this order, blunt and specific, no praise:
1. For EACH frame: what is actually visible (objects, shapes, text), and in one sentence whether it reads at a glance on a phone.
2. THE OPENING FRAME specifically: describe exactly what you see. Does it read as a classroom? Does it read as pupils raising their hands, or does it read as something else (a diagram, blobs, an abstract pattern)?
3. What looks broken, wrong, ugly or generated in this art - name the specific shapes/colours you dislike.
4. The three worst problems, worst first, each with the smallest change that fixes it.
Do not describe things you cannot see. If something is unclear, say it is unclear.`;

function ask(messages) {
  return new Promise((res) => {
    const body = JSON.stringify({ model: MODEL, messages, temperature: 0.2, stream: false });
    const r = https.request({
      hostname: 'api.kie.ai', path: '/' + MODEL + '/v1/chat/completions', method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (x) => {
      let d = ''; x.on('data', (c) => d += c); x.on('end', () => {
        let j = null; try { j = JSON.parse(d); } catch {}
        res({ http: x.statusCode, j, raw: d.slice(0, 400) });
      });
    });
    r.on('error', (e) => res({ http: 0, j: null, raw: e.message }));
    r.setTimeout(180000, () => r.destroy(new Error('timeout')));
    r.write(body); r.end();
  });
}

(async () => {
  const content = [{ type: 'text', text: ASK }];
  files.forEach((f) => {
    content.push({ type: 'text', text: '--- frame at ' + f.t + 's ---' });
    content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + fs.readFileSync(f.file).toString('base64') } });
  });
  console.log('sending ' + files.length + ' frames of ' + name + ' to ' + MODEL + ' ...');
  for (let i = 1; i <= 3; i++) {
    const r = await ask([{ role: 'user', content }]);
    const t = r.j && r.j.choices && r.j.choices[0] && r.j.choices[0].message && r.j.choices[0].message.content;
    if (t) { console.log('\n' + t + '\n'); return; }
    console.log('  try ' + i + ': http ' + r.http + '  ' + r.raw.replace(/\s+/g, ' ').slice(0, 200));
    await new Promise((z) => setTimeout(z, 4000));
  }
  console.log('\nnothing came back. frames are in ' + EYES);
})();