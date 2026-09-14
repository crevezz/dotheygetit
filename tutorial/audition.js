/* ============================================================================
   Audition different ElevenLabs settings on ONE chapter so the voice can be
   picked by ear before re-recording everything.
       node audition.js            -> chapter 7
       node audition.js 2          -> chapter 2
   Writes tutorial/voice/auditions/<name>.mp3
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT = path.join(HERE, 'voice', 'auditions');
fs.mkdirSync(OUT, { recursive: true });

const KEY = (process.env.ELEVEN_KEY || fs.readFileSync(path.join(HERE, '.eleven.key'), 'utf8')).trim();
const plan = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'));
const N = Number(process.argv[2]) || 7;
const ch = plan.chapters.find(c => c.n === N);
if (!ch) { console.error('no chapter ' + N); process.exit(1); }

/* optional: an override script (with proper punctuation) instead of narration.json */
const tfIdx = process.argv.indexOf('--text');
const TEXT = tfIdx > -1 ? fs.readFileSync(process.argv[tfIdx + 1], 'utf8').trim() : ch.text;

/* ---- the candidates -----------------------------------------------------
   stability      low  = more variation in delivery (less flat), but can wobble
   style          high = more performance / exaggeration pushed into the read
   similarity     how tightly it hugs the original designed voice
   ------------------------------------------------------------------------ */
const VARIANTS = tfIdx > -1 ? [
  { name: 'b-punct-v2', model: 'eleven_multilingual_v2', s: { stability: 0.35, similarity_boost: 0.75, style: 0.35 } },
  { name: 'd-punct-v3', model: 'eleven_v3',              s: { stability: 0.30, similarity_boost: 0.75, style: 0.45 } }
] : [
  { name: 'a-current',   model: 'eleven_multilingual_v2', s: { stability: 0.50, similarity_boost: 0.80, style: 0.00 } },
  { name: 'b-warmer',    model: 'eleven_multilingual_v2', s: { stability: 0.35, similarity_boost: 0.75, style: 0.35 } },
  { name: 'c-lively',    model: 'eleven_multilingual_v2', s: { stability: 0.22, similarity_boost: 0.75, style: 0.60 } },
  { name: 'd-lively-v3', model: 'eleven_v3',              s: { stability: 0.30, similarity_boost: 0.75, style: 0.45 } }
];

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
        if (x.statusCode !== 200) return rej(new Error('HTTP ' + x.statusCode + ' ' + buf.toString().slice(0, 200)));
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
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

(async () => {
  console.log('\n  chapter ' + N + ' — ' + ch.id + '  (' + TEXT.trim().split(/\s+/).length + ' words)\n');
  console.log('  file                        stability  style   voice   size');
  for (const v of VARIANTS) {
    const file = path.join(OUT, v.name + '.mp3');
    try {
      const buf = await tts(plan.voice, TEXT, v.model, v.s);
      fs.writeFileSync(file, buf);
      console.log('  ' + v.name.padEnd(28) +
                  String(v.s.stability).padEnd(11) +
                  String(v.s.style).padEnd(8) +
                  duration(file).toFixed(1) + 's' +
                  '  ' + (buf.length / 1024).toFixed(0) + ' KB');
    } catch (e) {
      console.log('  ' + v.name.padEnd(28) + 'FAILED  ' + e.message);
    }
  }
  console.log('\n  -> ' + OUT);
  console.log('  Play them and say which letter.\n');
})();
