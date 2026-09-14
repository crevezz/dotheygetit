/* ============================================================================
   Generate the tutorial voiceover from narration.json (ElevenLabs).
   One mp3 per chapter -> tutorial/voice/<id>.mp3
   Also prints the measured duration of each clip so it can be matched against
   the video chapter length.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const VOICE_DIR = path.join(HERE, 'voice');
fs.mkdirSync(VOICE_DIR, { recursive: true });

const KEY = (process.env.ELEVEN_KEY || fs.readFileSync(path.join(HERE, '.eleven.key'), 'utf8')).trim();
const plan = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'));

function tts(voiceId, text, model, settings) {
  const body = JSON.stringify({ text, model_id: model, voice_settings: settings });
  return new Promise((res, rej) => {
    const r = https.request({
      hostname: 'api.elevenlabs.io',
      path: '/v1/text-to-speech/' + voiceId + '?output_format=mp3_44100_128',
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Accept: 'audio/mpeg' }
    }, x => {
      const chunks = [];
      x.on('data', c => chunks.push(c));
      x.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (x.statusCode !== 200) return rej(new Error('HTTP ' + x.statusCode + ' ' + buf.toString().slice(0, 300)));
        res(buf);
      });
    });
    r.on('error', rej);
    r.setTimeout(120000, () => r.destroy(new Error('timeout')));
    r.write(body);
    r.end();
  });
}

function duration(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

/* how long each video chapter actually is (from blackdetect on the raw takes) */
const VIDEO = require('./chapters.json');

(async () => {
  const rows = [];
  for (const ch of plan.chapters) {
    const file = path.join(VOICE_DIR, ch.id + '.mp3');
    if (process.env.FORCE !== '1' && fs.existsSync(file)) {
      console.log('  · ' + ch.id + '  (kept)');
    } else {
      const buf = await tts(plan.voice, ch.text, plan.model, plan.settings);
      fs.writeFileSync(file, buf);
      console.log('  ✓ ' + ch.id + '  ' + (buf.length / 1024).toFixed(0) + ' KB');
    }
    const words = ch.text.trim().split(/\s+/).length;
    const vo = duration(file);
    const vid = VIDEO.chapters.find(c => c.n === ch.n) || {};
    const have = (vid.window || 0);
    rows.push({ n: ch.n, id: ch.id, words, vo, video: vid.span, window: have, gap: have && vo ? +(have - vo).toFixed(2) : null });
  }

  console.log('\n  ch  words    voice     video   window    slack   speed');
  for (const r of rows) {
    const f = v => (v === null || v === undefined ? '   -' : v.toFixed(1));
    const sp = r.vo ? (r.window + 1.6) / (r.vo + 1.6) : null;
    console.log('  ' + String(r.n).padEnd(4) + String(r.words).padEnd(8) + f(r.vo).padStart(6) + 's' +
                f(r.video).padStart(8) + 's' + f(r.window).padStart(8) + 's' + f(r.gap).padStart(8) + 's' +
                (sp ? sp.toFixed(2) + 'x' : '') +
                (sp && sp > 1.35 ? '   <-- too fast, add words' : ''));
  }
  const bad = rows.filter(r => r.vo && (r.window + 1.6) / (r.vo + 1.6) > 1.35);
  console.log(bad.length ? '\n  ' + bad.length + ' chapter(s) need more narration.' : '\n  All chapters fit at a natural pace.');
  console.log('\n  total voice: ' + rows.reduce((a, r) => a + (r.vo || 0), 0).toFixed(1) + 's');
})();
