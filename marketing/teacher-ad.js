/* Teacher avatar feed ad (4:5, 15-25s).
 *   node teacher-ad.js [demoId=nod]
 * 0-INTRO: teacher full screen (hook). Then the app demo, FITTED whole (no crop) on a blurred fill,
 * with the teacher as a circular PiP bottom-right, still talking.
 * Pipeline: Kie image (teacher still) -> ElevenLabs v3 VO (sped up) -> Kie kling/ai-avatar-standard (lip-sync) -> ffmpeg.
 * Cached in out/teacher-ad/ : delete a file to regenerate that step.
 * Env: VOICE_ID (default George), TEMPO (default 1.12), INTRO (default 3.5)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = (() => { try { return require('ffmpeg-static'); } catch { return require('../tutorial/node_modules/ffmpeg-static'); } })();

const envText = fs.readFileSync('C:/Users/CREVE/Desktop/apps/Websites/RapidWeb/social bot/.env', 'utf8');
const env = (k) => ((envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const KIE = fs.readFileSync(path.join(__dirname, '..', 'tutorial', '.kie.key'), 'utf8').trim();
const XI = env('ELEVENLABS_API_KEY');
const VOICE = process.env.VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // George: warm, natural British male
const TEMPO = Number(process.env.TEMPO || 1.1);              // native ElevenLabs speed (ffmpeg stretching caused robotic artefacts)
const VO_MODEL = process.env.VO_MODEL || 'eleven_v4';
const INTRO = Number(process.env.INTRO || 3.5);              // seconds teacher is full screen
const BASE = 'https://api.kie.ai';

const DEMO_ID = process.argv[2] || 'nod';
// Native 4:5 render from beat-film.js (SIZES=feed) - fills the frame, nothing cropped.
const DEMO = path.join(__dirname, 'out', 'beats', `${DEMO_ID}-feed-app.mp4`);
const OUT = path.join(__dirname, 'out', 'teacher-ad'); fs.mkdirSync(OUT, { recursive: true });
const P = (f) => path.join(OUT, f);

// Spoken like a real teacher talking to a colleague: contractions, a sigh, short bursts. No ad-speak.
// Rules (AD-STANDARD): never say "phone", say "any device"; name got it / unsure / needs help in order.
// Plain, natural punctuation: heavy tags + stability 0 made v3 sound performed/robotic.
const VO =
  "Be honest. You ask, does everyone get it? Thirty kids nod. " +
  "Then you mark the books... and half didn't. " +
  "Now I use Get It. I type the topic, they answer on any device, " +
  "and I see who's got it, who's unsure, and who needs me. By name. " +
  "Free. Do they get it, dot app.";

const TEACHER_PROMPT = [
  "Candid, unretouched smartphone selfie photo, vertical 3:4 portrait, shot on an iPhone front camera at arm's length.",
  'Subject: a real British secondary school teacher, white male, about 38, kind slightly tired eyes, short brown hair a little messy,',
  'light stubble, faint smile lines, navy crew-neck jumper over a pale blue collared shirt, school lanyard with ID badge.',
  'Setting: his own UK comprehensive classroom at the end of the school day; whiteboard with faded maths working behind him,',
  'pupil work displays on the wall, grey plastic chairs and wooden desks, softly out of focus.',
  'Lighting: flat fluorescent ceiling light mixed with soft window daylight; natural skin texture, visible pores, no beauty filter.',
  'Framing: head and upper chest centred with headroom, eyes level with lens, looking straight into camera, mouth relaxed and closed,',
  'neutral friendly expression, both hands out of frame.',
  'Style: authentic, documentary, everyday; not a stock photo, not a model, not glamorous, not CGI. No text, no logos, no watermark.',
].join(' ');

const AVATAR_PROMPT =
  'A real teacher filming a quick handheld selfie video for other teachers. He talks naturally and conversationally to camera: ' +
  'relaxed micro head movements, natural blinking, eyebrows lift slightly on the question, a small exhale on the sigh, ' +
  'a knowing half-smile on "by name". Subtle shoulder shifts, very slight handheld camera sway. ' +
  'Accurate, natural lip-sync; no exaggerated mouth shapes, no stiff posture, no face warping, background stays still.';

// Attention beats: bold editorial illustrations for the pain lines, shown between intro and demo.
const ILLO_STYLE = 'Bold modern editorial illustration, flat shapes with subtle grain texture, thick confident linework, ' +
  'limited palette of deep navy, warm off-white and one punchy accent of signal orange, high contrast, strong single focal point, ' +
  'generous negative space at the top for a caption, vertical 3:4 composition, scroll-stopping social ad art in the style of a ' +
  'New Yorker / Guardian cover. No text, no letters, no logos, no watermark.';
const ILLOS_OFF = [
  { f: 'illo-nod.png', p: 'A UK secondary classroom seen from the teacher\'s desk: thirty pupils in navy school jumpers all nodding in unison, ' +
    'identical blank polite smiles, motion lines on their heads, one small pupil at the back secretly confused with a tiny question mark ' +
    'drawn as an orange shape above their head. Funny, knowing, relatable. ' + ILLO_STYLE },
  { f: 'illo-books.png', p: 'A towering, teetering stack of pupil exercise books on a teacher\'s desk at night under a desk lamp, ' +
    'the top book open showing big orange crosses, a cold mug of tea and a red pen beside it, the dark window behind. ' +
    'Dramatic, sinking-feeling moment every teacher knows. ' + ILLO_STYLE },
];
const ILLOS = [];                                          // AI illustrations disabled - the app animation is the visual
const ILLO_AT = [INTRO, INTRO], ILLO_LEN = 0;
const DEMO_FROM = Number(process.env.DEMO_FROM || 11.52); // skip chips/names hook - start at laptop "type a topic" beat
const MUSIC = P('background.mp3'), MUSIC_VOL = Number(process.env.MUSIC_VOL || 0.12);

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KIE}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function kieTask(model, input, label) {
  const r = await (await fetch(`${BASE}/api/v1/jobs/createTask`, { method: 'POST', headers: H, body: JSON.stringify({ model, input }) })).json();
  const id = r?.data?.taskId; if (!id) throw new Error(`${label}: ${JSON.stringify(r).slice(0, 300)}`);
  console.log(`${label} task ${id}`);
  for (;;) {
    await sleep(6000);
    const d = (await (await fetch(`${BASE}/api/v1/jobs/recordInfo?taskId=${id}`, { headers: H })).json()).data || {};
    const s = String(d.state || '').toLowerCase();
    if (s === 'success') return JSON.parse(d.resultJson).resultUrls[0];
    if (s === 'fail') throw new Error(`${label} failed: ${d.failMsg}`);
    process.stdout.write('.');
  }
}
async function upload(file, mime) {
  const body = { base64Data: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`, uploadPath: 'getit-ad', fileName: path.basename(file) };
  for (const host of [BASE, 'https://kieai.redpandaai.co']) {
    try {
      const r = await (await fetch(`${host}/api/file-base64-upload`, { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
      const u = r?.data?.downloadUrl || r?.data?.fileUrl; if (u) return u;
    } catch {}
  }
  throw new Error('upload failed ' + file);
}
const dl = async (u, f) => fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer()));
const run = (a) => { const r = spawnSync(ffmpeg, ['-y', ...a], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr.slice(-800)); };
const dur = (f) => { const m = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

(async () => {
  if (!fs.existsSync(DEMO)) throw new Error('No demo ' + DEMO);

  // 1. teacher still
  if (!fs.existsSync(P('teacher.png'))) {
    const u = await kieTask('gpt-image-2-5-flare-text-to-image', { prompt: TEACHER_PROMPT, aspect_ratio: '3:4', resolution: '2K' }, 'teacher');
    await dl(u, P('teacher.png'));
  }

  for (const il of ILLOS) if (!fs.existsSync(P(il.f))) {
    await dl(await kieTask('gpt-image-2-5-flare-text-to-image', { prompt: il.p, aspect_ratio: '3:4', resolution: '2K' }, il.f), P(il.f));
  }

  // 2. voiceover: low stability + high style = most human v3 delivery; then trim lead silence and speed up
  if (!fs.existsSync(P('vo.mp3'))) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST', headers: { 'xi-api-key': XI, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: VO, model_id: VO_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: TEMPO } }),
    });
    if (!r.ok) throw new Error('ElevenLabs ' + r.status + ' ' + (await r.text()).slice(0, 200));
    fs.writeFileSync(P('vo_raw.mp3'), Buffer.from(await r.arrayBuffer()));
    run(['-i', P('vo_raw.mp3'), '-af', `silenceremove=start_periods=1:start_threshold=-45dB`, P('vo.mp3')]);
  }
  if (process.argv.includes('--vo-only')) { console.log('VO ->', P('vo.mp3'), dur(P('vo.mp3')).toFixed(1) + 's'); return; }
  const voLen = dur(P('vo.mp3')); console.log(`VO ${voLen.toFixed(1)}s`);
  if (voLen > 24 || voLen < 14) console.warn('VO outside 15-25s window - adjust TEMPO or script.');

  // 3. talking avatar
  if (!fs.existsSync(P('avatar.mp4'))) {
    const [img, aud] = [await upload(P('teacher.png'), 'image/png'), await upload(P('vo.mp3'), 'audio/mpeg')];
    const u = await kieTask('kling/ai-avatar-standard', { image_url: img, audio_url: aud, prompt: AVATAR_PROMPT }, 'avatar');
    await dl(u, P('avatar.mp4'));
  }

  // 4. compose 1080x1350.
  // Demo is 9:16 -> FIT whole at 759x1350 (nothing cut off), left-aligned on a blurred dark fill.
  // PiP circle sits in the right margin, clear of FB's bottom CTA zone.
  const T = voLen + 0.6, pip = 300, DEMO_AT = ILLO_AT[1] + ILLO_LEN;
  const SPD = Math.max(1, (dur(DEMO) - DEMO_FROM) / (T - DEMO_AT));
  const fc = [
    `[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,setsar=1,split[tf][tp]`,
    // fit the rest of the demo (laptop -> device -> results -> domain) into the post-intro window so it always ends on the domain
    `[1:v]trim=start=${DEMO_FROM},setpts=(PTS-STARTPTS)/${SPD.toFixed(4)},scale=1080:1350,setsar=1,setpts=PTS+${DEMO_AT}/TB[demo]`,
    `[0:a]asplit=2[voa][vob]`,
    `[2:a]atrim=0:${T},volume=${MUSIC_VOL},afade=t=in:d=0.5,afade=t=out:st=${(T - 1.2).toFixed(2)}:d=1.2[mus]`,
    `[mus][voa]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[duck]`,
    `[duck][vob]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`,
    `[tp]crop=iw:iw:0:ih*0.05,scale=${pip}:${pip},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-${pip / 2},Y-${pip / 2}),${pip / 2 - 6}),255,0)'[circ]`,
    `color=white:s=${pip}x${pip},format=rgba,geq=r=255:g=255:b=255:a='if(lt(hypot(X-${pip / 2},Y-${pip / 2}),${pip / 2}),255,0)'[ring]`,
    `[ring][circ]overlay=0:0[pipc]`,
    `[tf][demo]overlay=0:0:eof_action=pass:enable='gte(t,${INTRO})'[bg]`,
    `[bg][pipc]overlay=W-w-24:H-h-260:enable='gte(t,${INTRO})',trim=0:${T}[v]`,
  ].join(';');
  const out = P(`teacher-ad-${DEMO_ID}-feed.mp4`);
  run(['-i', P('avatar.mp4'), '-i', DEMO, '-i', MUSIC, ...ILLOS.flatMap((il) => ['-loop', '1', '-t', String(ILLO_LEN), '-i', P(il.f)]), '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-t', String(T), out]);
  console.log(`\nDone (${T.toFixed(1)}s) -> ${out}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
