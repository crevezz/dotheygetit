/* Joins several ad films into one story with a single voiceover.
 *   node marketing/ad-combo.js
 * Order: problem (nodding, faking) -> answer (minutes) -> payoff (marking).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();

const envText = fs.readFileSync('C:/Users/CREVE/Desktop/apps/Websites/RapidWeb/social bot/.env', 'utf8');
const env = (k) => ((envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const KEY = env('ELEVENLABS_API_KEY'), VOICE = process.env.VOICE_ID || 'llNlEi50DSCIEuoOIaH7';

const ORDER = ['nodding', 'faking', 'minutes', 'marking'];
const HOOK_LEN = 1.5;                 // frozen cover card: held 1.5s, VO starts after
const SIZES = { story: [1080, 1920], feed: [1080, 1350], square: [1080, 1080], wide: [1200, 628] };
// eleven_v3 audio tags tune the delivery. Short lines + [cheerful] keep the pace up.
const VO = "[warm] The two-minute understanding check for teachers. " +
  "[excited] Thirty students nodded. But nodding isn't understanding. " +
  "[curious] Who got it? Who needs help? " +
  "[cheerful] With Get It, pupils answer on their phones, and you know in two minutes. " +
  "[upbeat] No marking. Free for teachers. Try it at do they get it dot app.";
const MUSIC = path.join(__dirname, 'out', 'background.mp3');

const FILM = path.join(__dirname, 'out', 'adfilm');
const OUT = path.join(__dirname, 'out', 'adfilm-combo');
fs.mkdirSync(OUT, { recursive: true });
const run = (a) => { const r = spawnSync(ffmpeg, a, { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr.slice(-600)); };
const dur = (f) => { const m = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

(async () => {
  const mp3 = path.join(OUT, 'vo.mp3');
  if (!fs.existsSync(mp3)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: VO, model_id: 'eleven_v3', voice_settings: { stability: 0.5 } }),
    });
    if (!res.ok) throw new Error('ElevenLabs ' + res.status + ': ' + (await res.text()).slice(0, 300));
    fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  }
  // 1.12x speed reads as an ad rather than a narration; +0.4s tail to land the CTA.
  const speed = Number(process.env.VO_SPEED || 1.12);
  const voLen = dur(mp3) / speed + 0.4;
  const total = voLen; // VO now runs from 0, so the film is exactly the VO length
  const per = (voLen - HOOK_LEN) / ORDER.length; // scenes share what's left after the 1.5s card
  for (const size of Object.keys(SIZES)) {
    const [w, h] = SIZES[size];
    const thumb = path.join(__dirname, 'out', 'ads', `thumb-${size}@2x.png`);
    // frozen opening card: hold the cover still for HOOK_LEN, no animation
    const parts = [`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,trim=duration=${HOOK_LEN.toFixed(2)},setpts=PTS-STARTPTS[v0]`];
    const films = [];
    ORDER.forEach((id, i) => {
      const n = i + 1;
      const src = path.join(FILM, `${id}-${size}.mp4`);
      films.push(src);
      const hold = Math.max(0, per - dur(src)).toFixed(2);
      parts.push(`[${n}:v]tpad=stop_mode=clone:stop_duration=${hold},trim=duration=${per.toFixed(2)},setpts=PTS-STARTPTS,fps=30[v${n}]`);
    });
    const cat = Array.from({ length: ORDER.length + 1 }, (_, i) => `[v${i}]`).join('') + `concat=n=${ORDER.length + 1}:v=1:a=0[v]`;
    const dst = path.join(OUT, `get-it-story-${size}.mp4`);
    // voice delayed to start after the frozen card; music loops under everything at ~12%, fading out at the end
    const n = ORDER.length + 1;
    const mix = `;[${n}:a]atempo=${speed}[vo];[${n + 1}:a]volume=0.12,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[bg];[vo][bg]amix=inputs=2:duration=longest:dropout_transition=0,atrim=duration=${total.toFixed(2)}[a]`;
    run(['-y', '-loop', '1', '-framerate', '30', '-t', HOOK_LEN.toFixed(2), '-i', thumb,
      ...films.flatMap((f) => ['-i', f]), '-i', mp3, '-stream_loop', '-1', '-t', total.toFixed(2), '-i', MUSIC, '-filter_complex', parts.join(';') + ';' + cat + mix,
      '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dst]);
    console.log(`  ok  get-it-story-${size}  ${total.toFixed(1)}s`);
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
