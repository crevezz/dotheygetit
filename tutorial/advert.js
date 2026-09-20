/* ============================================================================
   The advert's VOICE, and the timeline everything else hangs off.

   An advert is not a tutorial. Same footage, different job: hook -> pain ->
   turn -> proof -> CTA in about twenty seconds, and it has to read with the
   sound OFF (feeds autoplay muted). So the picture is designed copy in the
   navy margins, and the voiceover sits on top for the people who unmute.
   No captions - the on-screen words are the design, not subtitles.

   THE POINT OF THIS FILE
   The whole script goes to ElevenLabs in ONE call. The old version asked for
   one line at a time and pasted the clips into fixed beats, so the voice
   stopped dead at every full stop and then sat in padded silence. That is
   exactly what "gaps are too long, it doesn't flow" sounds like. One call and
   the voice carries its own pace, with the punctuation doing the pausing.

   One call means no line boundaries, so we ask for them: the
   /with-timestamps endpoint returns a character-level alignment. Each shot
   then starts on the exact moment its sentence starts - measured, not guessed.

   Reads advert.json.
   Writes out/advert/voice.mp3, out/advert/mix.wav, out/advert/timeline.json
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT  = path.join(HERE, 'out', 'advert');
const VOA  = path.join(HERE, 'voice-advert');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VOA, { recursive: true });

const plan = JSON.parse(fs.readFileSync(path.join(HERE, 'advert.json'), 'utf8'));
const KEY  = (process.env.ELEVEN_KEY || fs.readFileSync(path.join(HERE, '.eleven.key'), 'utf8')).trim();
const SEG  = plan.segments;
const LEAD = Number(plan.lead || 0.35);
const TAIL = Number(plan.tail || 1.8);
const SCRIPT = SEG.map(s => s.text).join(' ');

function run(args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.error('\nffmpeg failed:\n' + String(r.stderr || '').slice(-3000));
    process.exit(1);
  }
  return r;
}
function dur(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

/* one call: the audio AND the alignment that says when every character is said */
function ttsTimed(voiceId, text, model, settings) {
  const body = JSON.stringify({ text, model_id: model, voice_settings: settings });
  return new Promise((res, rej) => {
    const r = https.request({
      hostname: 'api.elevenlabs.io',
      path: '/v1/text-to-speech/' + voiceId + '/with-timestamps?output_format=mp3_44100_128',
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(body), Accept: 'application/json' }
    }, x => {
      const chunks = [];
      x.on('data', c => chunks.push(c));
      x.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (x.statusCode !== 200) return rej(new Error('HTTP ' + x.statusCode + ' ' + raw.slice(0, 300)));
        let j; try { j = JSON.parse(raw); } catch (e) { return rej(new Error('not JSON: ' + raw.slice(0, 200))); }
        const a = j.alignment || j.normalized_alignment;
        if (!a || !a.characters || !a.character_start_times_seconds) return rej(new Error('no alignment in the response'));
        res({ mp3: Buffer.from(j.audio_base64, 'base64'), a });
      });
    });
    r.on('error', rej);
    r.setTimeout(180000, () => r.destroy(new Error('timeout')));
    r.write(body);
    r.end();
  });
}

/* words, with where they sit in the string - so punctuation and the em dash can
   be normalised away without losing the thread */
function words(s) {
  const out = [];
  const re = /[a-z0-9]+/gi;
  let m;
  while ((m = re.exec(s))) out.push({ w: m[0].toLowerCase(), i: m.index, n: m[0].length });
  return out;
}

/* find each sentence in the alignment and take its real start and end */
function marks(a) {
  const S = a.characters.join('');
  const W = words(S);
  const st = a.character_start_times_seconds, en = a.character_end_times_seconds;
  let cur = 0;
  return SEG.map(seg => {
    const want = words(seg.text).map(x => x.w);
    let hit = -1;
    for (let k = cur; k + want.length <= W.length && hit < 0; k++) {
      let ok = true;
      for (let j = 0; j < want.length; j++) if (W[k + j].w !== want[j]) { ok = false; break; }
      if (ok) hit = k;
    }
    if (hit < 0) return null;
    const first = W[hit], last = W[hit + want.length - 1];
    cur = hit + want.length;
    return { t: st[first.i], e: en[last.i + last.n - 1] };
  });
}

/* last resort: nobody's timings, so share the audio out by how long each
   sentence is. Only reached if the alignment cannot be read at all. */
function share(total) {
  const n = SEG.map(s => s.text.length);
  const sum = n.reduce((a, b) => a + b, 0);
  let t = 0;
  return SEG.map((s, i) => {
    const a = t, b = t + (n[i] / sum) * total;
    t = b;
    return { t: a, e: b };
  });
}

(async () => {
  console.log('advert voice  ' + SEG.length + ' beats   ' + SCRIPT.length + ' characters in one call\n');

  /* 1. the voice, and where every word of it lands ----------------------- */
  const voice = path.join(OUT, 'voice.mp3');
  const stamp = path.join(OUT, 'script.txt');
  /* a cached voice that no longer matches the script would time the shots to
     the wrong words, so re-record whenever the script changes */
  const changed = !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== SCRIPT;
  if (changed && fs.existsSync(voice)) console.log('  the script changed - re-recording');
  if (!fs.existsSync(voice) || changed || process.env.FORCE === '1') {
    console.log('  asking ElevenLabs for the whole read ...');
    const { mp3, a } = await ttsTimed(plan.voice, SCRIPT, plan.model, plan.settings);
    fs.writeFileSync(voice, mp3);
    fs.writeFileSync(path.join(OUT, 'alignment.json'), JSON.stringify(a));
    fs.writeFileSync(stamp, SCRIPT);
    console.log('  + voice.mp3  ' + (mp3.length / 1024).toFixed(0) + ' KB');
  } else {
    console.log('  voice.mp3 already here (FORCE=1 to re-record)');
  }
  const VOICE_DUR = dur(voice);
  const alignFile = path.join(OUT, 'alignment.json');
  const m = fs.existsSync(alignFile) ? marks(JSON.parse(fs.readFileSync(alignFile, 'utf8'))) : SEG.map(() => null);
  const missed = m.filter(x => !x).length;
  const mk = missed ? share(VOICE_DUR) : m;
  if (missed) console.log('  ! ' + missed + ' sentence(s) not found in the alignment - timing shared by length instead');

  const TOTAL = +(LEAD + VOICE_DUR + TAIL).toFixed(2);
  console.log('\n  voice ' + VOICE_DUR.toFixed(2) + 's   + lead ' + LEAD + 's   + tail ' + TAIL + 's   = ' + TOTAL + 's');

  /* 2. the timeline: a shot starts when its sentence does ----------------- */
  const shots = SEG.map((s, i) => {
    const t = Math.max(0, +(LEAD + mk[i].t - 0.12).toFixed(2));
    const e = i < SEG.length - 1 ? +(LEAD + mk[i + 1].t - 0.12).toFixed(2) : TOTAL;
    return { id: s.id, t: t, e: Math.max(t + 0.5, e), clip: s.clip || null,
             vid: s.clip ? 'v-' + s.id : null, ss: s.ss === undefined ? null : s.ss };
  });
  console.log('');
  shots.forEach((s, i) => {
    console.log('  ' + s.id + '  ' + s.t.toFixed(2).padStart(6) + ' -> ' + s.e.toFixed(2).padStart(6) +
                '  (' + (s.e - s.t).toFixed(2) + 's)  ' + SEG[i].text);
  });

  fs.writeFileSync(path.join(OUT, 'timeline.json'),
    JSON.stringify({ total: TOTAL, voice: VOICE_DUR, lead: LEAD, tail: TAIL, shots: shots }, null, 2));

  /* 3. a quiet bed, so it is not just a voice in a void ------------------ */
  const bed = path.join(OUT, 'bed.wav');
  const sine = f => ['-f', 'lavfi', '-i', 'sine=frequency=' + f + ':duration=' + TOTAL];
  run(['-y', ...sine(110), ...sine(164.81), ...sine(220),
       '-filter_complex',
       '[0:a][1:a][2:a]amix=inputs=3:normalize=0,lowpass=f=900,volume=0.055,' +
       'tremolo=f=0.16:d=0.35,afade=t=in:st=0:d=1.5,afade=t=out:st=' + (TOTAL - 2).toFixed(2) + ':d=2[out]',
       '-map', '[out]', '-ar', '44100', '-ac', '2', bed]);

  /* 4. one continuous read, pushed back by the lead, over the bed -------- */
  const mix = path.join(OUT, 'mix.wav');
  run(['-y', '-i', bed, '-i', voice, '-filter_complex',
       '[1:a]adelay=' + Math.round(LEAD * 1000) + ':all=1[vo];' +
       '[0:a][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]',
       '-map', '[out]', '-ar', '44100', '-ac', '2', mix]);

  console.log('\n  out/advert/mix.wav      ' + TOTAL + 's');
  console.log('  out/advert/timeline.json   ' + shots.length + ' shots');
  console.log('  next:  node advert-film.js');
})();
