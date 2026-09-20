/* ============================================================================
   Build a short promo advert (9:16, 1080x1920) from the PHONE tutorial take.

   An advert is not a tutorial. Same footage, different job: hook -> pain ->
   reveal -> proof -> logo, in about twenty seconds, and it has to read with the
   sound OFF (feeds autoplay muted). So each beat carries a short designed
   headline in the navy margins, and the voiceover sits on top for the people
   who unmute. No captions - the on-screen words are the design, not subtitles.

   Reads advert.json. Writes out/advert/advert-test.mp4
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const OUT  = path.join(HERE, 'out', 'advert');
const VOA  = path.join(HERE, 'voice-advert');
const CLIPS = path.join(HERE, 'out', 'tutorials-mobile');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VOA, { recursive: true });

const plan = JSON.parse(fs.readFileSync(path.join(HERE, 'advert.json'), 'utf8'));
const KEY  = (process.env.ELEVEN_KEY || fs.readFileSync(path.join(HERE, '.eleven.key'), 'utf8')).trim();

/* canvas + brand */
const W = 1080, H = 1920, FPS = 30;
const NAVY = '0x070b16', ACCENT = '0x4f8cff', WHITE = 'white', RED = '0xff5a6a', MUTED = '0x9fb0d0';
const FONT = "C\\:/Windows/Fonts/segoeuib.ttf";   /* Segoe UI Bold, colon escaped for the filter parser */
/* the phone sits in a panel, leaving navy margins top and bottom for the words */
const PHW = 555, PHH = 1200, PX = 262, PY = 430;
const LOGO = path.join(HERE, '..', 'public', 'android-chrome-512.png');

function run(args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.error('\nffmpeg failed:\n' + String(r.stderr || '').slice(-3000));
    process.exit(1);
  }
  return r;
}

/* commas and colons would otherwise be read as filter separators */
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,');
}
function dt(text, o) {
  o = o || {};
  return "drawtext=fontfile='" + FONT + "':text='" + esc(text) + "':fontsize=" + (o.size || 80) +
         ":fontcolor=" + (o.color || WHITE) + ":x=" + (o.x || '(w-text_w)/2') + ":y=" + (o.y || 0);
}
function fades(D) { return ',fade=t=in:st=0:d=0.22,fade=t=out:st=' + (D - 0.22).toFixed(2) + ':d=0.22'; }

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

function dur(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

(async () => {
  const beats = plan.beats;
  let t = 0;
  beats.forEach(b => { b.at = +t.toFixed(2); t += b.dur; });
  const TOTAL = +t.toFixed(2);
  console.log('advert  ' + W + 'x' + H + '   ' + beats.length + ' beats   ' + TOTAL + 's\n');

  /* 1. voice ------------------------------------------------------------- */
  console.log('voice');
  for (const b of beats) {
    const f = path.join(VOA, b.id + '.mp3');
    if (!fs.existsSync(f) || process.env.FORCE === '1') {
      const buf = await tts(plan.voice, b.text, plan.model, plan.settings);
      fs.writeFileSync(f, buf);
      console.log('  + ' + b.id + '  ' + (buf.length / 1024).toFixed(0) + ' KB');
    }
    const vo = dur(f);
    const slack = b.dur - vo;
    console.log('  ' + b.id + '  vo ' + vo.toFixed(1) + 's in a ' + b.dur.toFixed(1) + 's beat' +
                (slack < 0.15 ? '   <-- too tight, lengthen the beat' : '   slack ' + slack.toFixed(1) + 's'));
  }

  /* 2. picture ----------------------------------------------------------- */
  console.log('\npicture');
  for (const b of beats) {
    const out = path.join(OUT, b.id + '.mp4');
    const D = b.dur;
    const bg = ['-f', 'lavfi', '-t', String(D), '-i', 'color=c=' + NAVY + ':s=' + W + 'x' + H + ':r=' + FPS];
    let args;
    if (b.type === 'card') {
      const col = b.accent === 'red' ? RED : WHITE;
      const vf = [dt(b.line1, { size: 112, y: 790, color: col }), dt(b.line2, { size: 112, y: 930, color: col })].join(',');
      args = ['-y', ...bg, '-vf', vf + fades(D)];
    } else if (b.type === 'clip') {
      const src = path.join(CLIPS, b.src + '.mp4');
      /* the app is dark navy and so is the canvas, so the panel needs an edge:
         a soft accent glow, then a crisp border, then the phone on top */
      const fc = '[1:v]scale=' + PHW + ':' + PHH + ',setsar=1[ph];' +
                 '[0:v]drawbox=x=' + (PX - 20) + ':y=' + (PY - 20) + ':w=' + (PHW + 40) + ':h=' + (PHH + 40) +
                 ':color=0x4f8cff@0.08:t=20,' +
                 'drawbox=x=' + (PX - 3) + ':y=' + (PY - 3) + ':w=' + (PHW + 6) + ':h=' + (PHH + 6) +
                 ':color=0x33507f@0.85:t=3[bg];' +
                 '[bg][ph]overlay=' + PX + ':' + PY + ':shortest=1[o];' +
                 '[o]' + dt(b.line1, { size: 74, y: 190 }) + ',' + dt(b.line2, { size: 74, y: 292 }) + fades(D);
      args = ['-y', ...bg, '-ss', String(b.ss), '-t', String(D), '-i', src, '-filter_complex', fc];
    } else {
      const fc = '[1:v]scale=340:340[lg];[0:v][lg]overlay=(W-w)/2:470[o];' +
                 '[o]' + dt('Get It?', { size: 150, y: 900 }) + ',' +
                 dt('dotheygetit.app', { size: 58, y: 1120, color: ACCENT }) + ',' +
                 dt('Free for teachers.', { size: 42, y: 1210, color: MUTED }) + fades(D);
      args = ['-y', ...bg, '-i', LOGO, '-filter_complex', fc];
    }
    run([...args, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), out]);
    console.log('  ' + b.id + '  ' + b.type.padEnd(5) + ' ' + D.toFixed(1) + 's');
  }

  /* 3. join the pictures ------------------------------------------------- */
  const list = path.join(OUT, 'list.txt');
  fs.writeFileSync(list, beats.map(b => "file '" + b.id + ".mp4'").join('\n'));
  run(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(OUT, 'video.mp4')]);

  /* 4. a quiet bed so it is not just voice in a void --------------------- */
  const bed = path.join(OUT, 'bed.wav');
  const sine = f => ['-f', 'lavfi', '-i', 'sine=frequency=' + f + ':duration=' + TOTAL];
  run(['-y', ...sine(110), ...sine(164.81), ...sine(220),
       '-filter_complex',
       '[0:a][1:a][2:a]amix=inputs=3:normalize=0,lowpass=f=900,volume=0.055,' +
       'tremolo=f=0.16:d=0.35,afade=t=in:st=0:d=1.5,afade=t=out:st=' + (TOTAL - 2).toFixed(2) + ':d=2[out]',
       '-map', '[out]', '-ar', '44100', '-ac', '2', bed]);

  /* 5. voice at each beat's own offset, over the bed --------------------- */
  const inputs = [bed, ...beats.map(b => path.join(VOA, b.id + '.mp3'))];
  const a = ['-y'];
  inputs.forEach(f => a.push('-i', f));
  let fc = '';
  beats.forEach((b, i) => {
    fc += '[' + (i + 1) + ':a]adelay=' + Math.round(b.at * 1000) + ':all=1[a' + (i + 1) + '];';
  });
  fc += beats.map((b, i) => '[a' + (i + 1) + ']').join('') + 'amix=inputs=' + beats.length + ':normalize=0[vo];';
  fc += '[0:a][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]';
  const mix = path.join(OUT, 'mix.wav');
  run([...a, '-filter_complex', fc, '-map', '[out]', '-ar', '44100', '-ac', '2', mix]);

  /* 6. mux --------------------------------------------------------------- */
  const final = path.join(OUT, 'advert-test.mp4');
  run(['-y', '-i', path.join(OUT, 'video.mp4'), '-i', mix,
       '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
       '-movflags', '+faststart', final]);

  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', final], { encoding: 'utf8' });
  const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  console.log('\ndone  ' + path.relative(HERE, final) + '  ' +
              (fs.statSync(final).size / 1048576).toFixed(1) + ' MB  ' +
              (d ? d[1] + ':' + d[2] + ':' + d[3] : '?'));
  console.log((r.stderr || '').split('\n').filter(l => /Stream #/.test(l)).map(l => l.trim()).join('\n'));
})();