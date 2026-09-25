/* Adds a voiceover to every ad film.
 *   node marketing/ad-vo.js
 * Reads ElevenLabs keys from the social bot .env (never committed here).
 * Each film's last frame is held so the video runs as long as the voice.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();

const envText = fs.readFileSync('C:/Users/CREVE/Desktop/apps/Websites/RapidWeb/social bot/.env', 'utf8');
const env = (k) => ((envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
/* New default voice; override per run with VOICE_ID=... */
const KEY = env('ELEVENLABS_API_KEY'), VOICE = process.env.VOICE_ID || 'llNlEi50DSCIEuoOIaH7';
/* TikTok/Reels only take the tall frame, so we only build 'story' unless
   SIZES is set (SIZES=square,feed,story,wide). */
const SIZES = (process.env.SIZES || 'story').split(',');
if (!KEY || !VOICE) throw new Error('Missing ElevenLabs key/voice');

const SCRIPT = {
  nodding: 'Thirty students nodded. But nodding isn\'t understanding. Get It is the free two-minute check that shows who really got it. Try it free.',
  topic:   'Type your lesson topic, and get a check in seconds. Get It. The free understanding check for teachers. Try it free.',
  minutes: 'Pupils answer on their phones. You know who understood in two minutes. Get It. Free for teachers. Try it free.',
  before:  'Know who didn\'t get it, before the next lesson. Get It is the free two-minute check for teachers. Try it free.',
  faking:  'Who got it. Who is unsure. And who needs your help. Get It shows you in two minutes, free. Try it free.',
  marking: 'No marking. No photocopying. Just who understood. Get It. The free two-minute check for teachers. Try it free.',
  sayit:   'Not every pupil will write an answer. They can just say it out loud. Get It turns speech into text, so you still see who understood. Try it free at dotheygetit dot app.',
};

const FILM = path.join(__dirname, 'out', 'adfilm');
const OUT = path.join(__dirname, 'out', 'adfilm-vo');
fs.mkdirSync(path.join(OUT, 'vo'), { recursive: true });

const run = (args) => { const r = spawnSync(ffmpeg, args, { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr.slice(-600)); return r.stderr; };
const dur = (f) => { const m = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

(async () => {
  for (const [id, text] of Object.entries(SCRIPT)) {
    const mp3 = path.join(OUT, 'vo', id + '.mp3');
    if (!fs.existsSync(mp3)) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
        method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_v3', voice_settings: { stability: 0.5 } }),
      });
      if (!res.ok) throw new Error('ElevenLabs ' + res.status + ': ' + (await res.text()).slice(0, 300));
      fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
    }
    const speed = 1.12;                       /* upbeat ad pace */
    const len = dur(mp3) / speed + 0.6;
    for (const size of SIZES) {
      const src = path.join(FILM, `${id}-${size}.mp4`), dst = path.join(OUT, `${id}-${size}.mp4`);
      const hold = Math.max(0, len - dur(src));
      run(['-y', '-i', src, '-i', mp3, '-filter_complex', `[0:v]tpad=stop_mode=clone:stop_duration=${hold.toFixed(2)}[v];[1:a]atempo=${speed},apad[a]`,
        '-map', '[v]', '-map', '[a]', '-t', len.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dst]);
      console.log(`  ok  ${id}-${size}  ${len.toFixed(1)}s`);
    }
  }
  console.log('\n  done -> marketing/out/adfilm-vo');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
