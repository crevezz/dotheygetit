/* scratch: put the advert in front of a vision model, frame by frame.
   We have no Gemini key, but the Kie key we already have proxies Google's
   models OpenAI-style at /<model>/v1/chat/completions, so this uses that.

   Shrinks each shot's midpoint to a small JPEG first: 1080x1920 PNGs are
   ~400KB each and eight of them in one request is a needless megabyte. */
const fs = require('fs'), path = require('path'), https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const ART = path.join(HERE, 'out', 'advert');
const EYES = path.join(ART, 'eyes');
const KEY = (process.env.KIE_KEY || fs.readFileSync(path.join(HERE, '.kie.key'), 'utf8')).trim();
const TL = JSON.parse(fs.readFileSync(path.join(ART, 'timeline.json'), 'utf8'));
const MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const VID = path.join(ART, 'advert.mp4');

fs.mkdirSync(EYES, { recursive: true });

/* one small JPEG per shot, taken at the middle of its beat */
const files = TL.shots.map(s => {
  const mid = (s.t + s.e) / 2;
  const out = path.join(EYES, s.id + '.jpg');
  spawnSync(ffmpeg, ['-y', '-hide_banner', '-ss', String(mid), '-i', VID, '-frames:v', '1',
    '-vf', 'scale=540:960', '-q:v', '4', out], { encoding: 'utf8' });
  return { id: s.id, at: +mid.toFixed(2), file: out, text: s.text || '' };
}).filter(f => fs.existsSync(f.file));

const ASK = `You are a creative director reviewing a 9:16 vertical advert for teachers before it goes out.
Attached are ${files.length} frames, one from the middle of each shot, in order.

Shot order and the voiceover line each one carries:
${TL.shots.map((s, i) => (i + 1) + '. ' + s.id + ' (' + s.t.toFixed(1) + 's-' + s.e.toFixed(1) + 's)').join('\n')}

Judge it as an advert, not as a screenshot. For EACH frame say: what is actually visible, whether the
on-screen words would read on a phone at a glance, and whether it looks designed or looks generated.
Then give the three worst problems in the whole film, worst first, and for each one the smallest change
that fixes it. Be blunt and specific. Do not praise. Do not describe things you cannot see.`;

function ask(model, messages) {
  return new Promise(res => {
    const body = JSON.stringify({ model, messages, temperature: 0.2, stream: false });
    const r = https.request({ hostname: 'api.kie.ai', path: '/' + model + '/v1/chat/completions',
      method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body) } }, x => {
      let d = ''; x.on('data', c => d += c); x.on('end', () => {
        let j = null; try { j = JSON.parse(d); } catch {}
        res({ http: x.statusCode, j, raw: d.slice(0, 400) });
      });
    });
    r.on('error', e => res({ http: 0, j: null, raw: e.message }));
    r.setTimeout(180000, () => r.destroy(new Error('timeout')));
    r.write(body); r.end();
  });
}

(async () => {
  const content = [{ type: 'text', text: ASK }];
  files.forEach(f => {
    content.push({ type: 'text', text: '--- ' + f.id + ' at ' + f.at + 's ---' });
    content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + fs.readFileSync(f.file).toString('base64') } });
  });
  console.log('sending ' + files.length + ' frames to ' + MODEL + ' ...');
  for (let i = 1; i <= 3; i++) {
    const r = await ask(MODEL, [{ role: 'user', content }]);
    const t = r.j && r.j.choices && r.j.choices[0] && r.j.choices[0].message && r.j.choices[0].message.content;
    if (t) { console.log('\n' + t + '\n'); return; }
    console.log('  try ' + i + ': http ' + r.http + '  ' + r.raw.replace(/\s+/g, ' ').slice(0, 200));
    await new Promise(z => setTimeout(z, 4000));
  }
  console.log('\nnothing came back. the frames are on disk at out/advert/eyes/ if you want to look.');
})();
