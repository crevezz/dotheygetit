/* ============================================================================
   story-voice.js - the VOICE and the timeline for the story adverts.

   Same engine as advert.js, but it reads stories.json (an ARRAY of stories) and
   gives each one its own folder: out/stories/<id>/{voice.mp3,mix.wav,timeline.json}

   The whole script of a story goes to ElevenLabs in ONE call and the
   character-level alignment is read back, so every shot starts on the exact
   moment its sentence starts. Timing is measured, never invented.

     node story-voice.js            # every story that has no voice yet
     node story-voice.js quiet-one  # just one
     FORCE=1 node story-voice.js    # re-record even if nothing changed
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const ROOT = path.join(HERE, 'out', 'stories');
const KEY = (process.env.ELEVEN_KEY || fs.readFileSync(path.join(HERE, '.eleven.key'), 'utf8')).trim();
const STORIES = JSON.parse(fs.readFileSync(path.join(HERE, 'stories.json'), 'utf8'));
const ONLY = process.argv[2] || null;

function run(args, what) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.error('\n' + (what || 'ffmpeg') + ' failed:\n' + String(r.stderr || '').slice(-3000));
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

function words(s) {
  const out = [];
  const re = /[a-z0-9]+/gi;
  let m;
  while ((m = re.exec(s))) out.push({ w: m[0].toLowerCase(), i: m.index, n: m[0].length });
  return out;
}

/* captions keep the words as they were SPOKEN (case and all), grouped a few at a
   time, so a muted feed still reads the advert - which on TikTok is most of it */
function capsWords(s) {
  const out = [];
  const re = /[A-Za-z0-9']+/g;
  let m;
  while ((m = re.exec(s))) out.push({ w: m[0], i: m.index, n: m[0].length });
  return out;
}
function captions(a, lead, per) {
  const S = a.characters.join('');
  const W = capsWords(S);
  const st = a.character_start_times_seconds, en = a.character_end_times_seconds;
  const caps = [];
  let g = [];
  const flush = () => {
    if (!g.length) return;
    const f = g[0], l = g[g.length - 1];
    caps.push({ t: +(lead + st[f.i]).toFixed(2), e: +(lead + en[l.i + l.n - 1]).toFixed(2), text: g.map(x => x.w).join(' ') });
    g = [];
  };
  for (const w of W) { g.push(w); if (g.length >= (per || 4)) flush(); }
  flush();
  return caps;
}

/* a design line is often not a verbatim slice of the sentence - match the
   longest run of its words that IS there, so it lands when the voice reaches it */
function findLine(W, from, to, text, st, en) {
  const w = words(text).map(x => x.w);
  for (let n = w.length; n >= 1; n--) {
    for (let k = from; k + n <= to; k++) {
      let ok = true;
      for (let j = 0; j < n; j++) if (W[k + j].w !== w[j]) { ok = false; break; }
      if (!ok) continue;
      return { t: st[W[k].i], e: en[W[k + n - 1].i + W[k + n - 1].n - 1] };
    }
  }
  return null;
}

function marks(a, SEG) {
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
    const end = hit + want.length;
    cur = end;
    /* only the "lines" of a type shot are timed clause by clause. Kept in step
       with seg.lines by index (null where nothing matched), so the text of a
       line can never slide onto the timing of the line before it. */
    const lines = (seg.lines || [])
      .map(L => (L && L.t) ? findLine(W, hit, end, L.t, st, en) : null);
    return { t: st[first.i], e: en[last.i + last.n - 1], lines };
  });
}

function share(total, SEG) {
  const n = SEG.map(s => s.text.length);
  const sum = n.reduce((a, b) => a + b, 0);
  let t = 0;
  return SEG.map((s, i) => {
    const a = t, b = t + (n[i] / sum) * total;
    t = b;
    return { t: a, e: b };
  });
}

async function one(story) {
  const OUT = path.join(ROOT, story.id);
  fs.mkdirSync(OUT, { recursive: true });
  const SEG = story.segments;
  const LEAD = Number(story.lead || 0.35);
  const TAIL = Number(story.tail || 1.8);
  const SCRIPT = SEG.map(s => s.text).join(' ');
  console.log('\n=== ' + story.id + '  "' + story.title + '"  ' + SEG.length + ' beats\n');

  const voice = path.join(OUT, 'voice.mp3');
  const stamp = path.join(OUT, 'script.txt');
  const changed = !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== SCRIPT;
  if (changed && fs.existsSync(voice)) console.log('  the script changed - re-recording');
  if (!fs.existsSync(voice) || changed || process.env.FORCE === '1') {
    console.log('  asking ElevenLabs for the whole read ...');
    const { mp3, a } = await ttsTimed(story.voice, SCRIPT, story.model, story.settings);
    fs.writeFileSync(voice, mp3);
    fs.writeFileSync(path.join(OUT, 'alignment.json'), JSON.stringify(a));
    fs.writeFileSync(stamp, SCRIPT);
    console.log('  + voice.mp3  ' + (mp3.length / 1024).toFixed(0) + ' KB');
  } else {
    console.log('  voice.mp3 already here (FORCE=1 to re-record)');
  }
  const VOICE_DUR = dur(voice);
  const alignFile = path.join(OUT, 'alignment.json');
  const ALIGN = fs.existsSync(alignFile) ? JSON.parse(fs.readFileSync(alignFile, 'utf8')) : null;
  const m = ALIGN ? marks(ALIGN, SEG) : SEG.map(() => null);
  /* burned-in captions (TikTok is watched muted): off unless the story asks */
  const caps = (story.captions && ALIGN) ? captions(ALIGN, LEAD, story.captionWords || 4) : [];
  const missed = m.filter(x => !x).length;
  const mk = missed ? share(VOICE_DUR, SEG) : m;
  if (missed) console.log('  ! ' + missed + ' sentence(s) not found - timing shared by length');

  const TOTAL = +(LEAD + VOICE_DUR + TAIL).toFixed(2);
  console.log('  voice ' + VOICE_DUR.toFixed(2) + 's + lead ' + LEAD + ' + tail ' + TAIL + ' = ' + TOTAL + 's');

  const shots = SEG.map((s, i) => {
    const t = Math.max(0, +(LEAD + mk[i].t - 0.12).toFixed(2));
    const e = i < SEG.length - 1 ? +(LEAD + mk[i + 1].t - 0.12).toFixed(2) : TOTAL;
    /* the timed line starts are matched back to their design text BY INDEX, so
       the renderer only ever needs the text of each line */
    const lines = (mk[i].lines || []).map((L, j) => ({
      t: L && +(LEAD + L.t).toFixed(2), e: L && +(LEAD + L.e).toFixed(2),
      text: (s.lines && s.lines[j] && s.lines[j].t) || '',
      c: (s.lines && s.lines[j] && s.lines[j].c) || ''
    })).filter(L => L.text && L.t);
    return { id: s.id, kind: s.kind || 'type', t: t, e: Math.max(t + 0.5, e),
             clip: s.clip || null, ss: s.ss === undefined ? null : s.ss,
             head: s.head || null,
             lines: lines };
  });

  fs.writeFileSync(path.join(OUT, 'timeline.json'),
    JSON.stringify({ id: story.id, title: story.title, total: TOTAL, voice: VOICE_DUR, lead: LEAD, tail: TAIL, captions: caps, shots }, null, 2));
  shots.forEach(s => console.log('  ' + s.id + '  ' + s.t.toFixed(2).padStart(6) + ' -> ' + s.e.toFixed(2).padStart(6) +
    '  ' + s.kind.padEnd(6) + '  ' + SEG.find(x => x.id === s.id).text));

  /* music: same bed, same ducking as the advert */
  const MUSIC = path.join(HERE, 'bg.mp3');
  if (!fs.existsSync(MUSIC)) throw new Error('bg.mp3 is missing');
  const mix = path.join(OUT, 'mix.wav');
  run(['-y', '-i', MUSIC, '-i', voice, '-filter_complex',
       '[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,' +
       'volume=0.26,afade=t=in:st=0:d=0.15,' +
       'afade=t=out:st=' + (TOTAL - 2.5).toFixed(2) + ':d=2.5[m];' +
       '[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,' +
       'adelay=' + Math.round(LEAD * 1000) + ':all=1,apad=whole_dur=' + TOTAL + ',asplit=2[vo][key];' +
       '[m][key]sidechaincompress=threshold=0.05:ratio=8:attack=10:release=400[md];' +
       '[md][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]',
       '-map', '[out]', '-t', String(TOTAL), '-ar', '44100', '-ac', '2', mix], 'mix');
  const mixed = dur(mix);
  if (Math.abs(mixed - TOTAL) > 0.15) throw new Error('mix is ' + mixed.toFixed(2) + 's, expected ' + TOTAL + 's');
  if (caps.length) console.log('  captions: ' + caps.length + ' (burned in for muted feeds)');
  console.log('  + mix.wav ' + TOTAL + 's   + timeline.json ' + shots.length + ' shots');
}

(async () => {
  const list = ONLY ? STORIES.filter(s => s.id === ONLY) : STORIES;
  if (!list.length) { console.error('no story called "' + ONLY + '" in stories.json'); process.exit(1); }
  for (const s of list) await one(s);
  console.log('\nnext:  node story-film.js');
})();