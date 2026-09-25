/* ============================================================================
   infographics.js - the marketing visuals, drawn by Kie's GPT Image 2.5.

   Replaces marketing/cards.js. Those were hand-built in HTML and they looked
   hand-built. This hands the whole composition to the image model instead.

   THE FIRST JOB OF EVERY ONE OF THESE IS TO SAY WHAT THE APP IS. Not the
   feeling, not the badge - what it does, in plain words, in order.

   The model renders the copy, so the copy is spelled out on every line and
   "spell every word exactly as written" is repeated in the prompt. That does
   not make it reliable, it makes it usually right - so every image is read
   back and looked at before it counts.

   Run:  node marketing/infographics.js            (all of them)
         node marketing/infographics.js what-is    (one)
   Reads tutorial/.kie.key. Writes marketing/out/infographics/<id>-<ratio>.png
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HERE = __dirname;
const OUT = path.join(HERE, 'out', 'infographics');
fs.mkdirSync(OUT, { recursive: true });

const KEY = (process.env.KIE_KEY || fs.readFileSync(path.join(HERE, '..', 'tutorial', '.kie.key'), 'utf8')).trim();
const API = 'https://api.kie.ai';
const MODEL = 'gpt-image-2-5-flare-text-to-image';
const FORCE = process.env.FORCE === '1';
const only = process.argv[2];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ---- Kie plumbing (same shape as advert-art.js) ---------------------------- */
function req(method, url, body) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: Object.assign({ Authorization: 'Bearer ' + KEY },
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, x => {
      const c = [];
      x.on('data', d => c.push(d));
      x.on('end', () => {
        const t = Buffer.concat(c).toString();
        let j = null;
        try { j = JSON.parse(t); } catch (e) { /* not json */ }
        if (!j) return rej(new Error('kie sent non-JSON (' + x.statusCode + '): ' + t.slice(0, 200)));
        if (j.code !== 200) return rej(new Error('kie error ' + j.code + ': ' + j.msg));
        res(j.data);
      });
    });
    r.on('error', rej);
    r.setTimeout(180000, () => r.destroy(new Error('kie request timed out')));
    if (data) r.write(data);
    r.end();
  });
}

function download(url, file) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, x => {
      if (x.statusCode >= 300 && x.statusCode < 400 && x.headers.location) {
        return download(x.headers.location, file).then(res, rej);
      }
      if (x.statusCode !== 200) { x.resume(); return rej(new Error('download ' + x.statusCode)); }
      const s = fs.createWriteStream(file);
      x.pipe(s);
      s.on('finish', () => res(file));
      s.on('error', rej);
    }).on('error', rej);
  });
}

async function draw(prompt, ratio, resolution, what) {
  const d = await req('POST', API + '/api/v1/jobs/createTask',
    { model: MODEL, input: { prompt, aspect_ratio: ratio, resolution } });
  const id = d && (d.taskId || d.task_id);
  if (!id) throw new Error(what + ': no taskId came back');
  const t0 = Date.now();
  for (;;) {
    await sleep(6000);
    const s = await req('GET', API + '/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(id));
    const state = s.state || s.status;
    if (state === 'success') {
      const r = typeof s.resultJson === 'string' ? JSON.parse(s.resultJson) : (s.resultJson || {});
      const urls = r.resultUrls || r.result_urls || [];
      if (!urls.length) throw new Error(what + ': succeeded but sent no resultUrls');
      return urls[0];
    }
    if (state === 'fail' || state === 'failed') {
      throw new Error(what + ' failed: ' + (s.failMsg || s.failCode || 'no reason given'));
    }
    process.stdout.write('    ' + what + ' ' + state + ' ' + Math.round((Date.now() - t0) / 1000) + 's\r');
  }
}

const credits = async () => { try { return await req('GET', API + '/api/v1/chat/credit'); } catch (e) { return '?'; } };

/* ---- the house look, written down for a model to follow -------------------- */
const LOOK = [
  'Flat modern minimal vector infographic, no photograph, no 3D, no gradient mesh clutter.',
  'Background: very dark navy blue (#0B1220) with a soft subtle radial glow behind the headline only.',
  'Accent colour: a bright blue-to-violet gradient (#4F8CFF to #A98BFF) used on icons, arrows and one key word.',
  'A single red accent (#FF5C5C) is allowed on exactly one element if the brief mentions red.',
  'Typography: heavy bold modern sans-serif (like Inter or Poppins ExtraBold), white, tightly tracked, generous line spacing.',
  'Sharply aligned, lots of empty space, everything on a clear grid, small consistent margins.',
  'Render every word of the copy EXACTLY as written below, in correct English spelling, with correct punctuation. Do not add words, do not repeat words, do not abbreviate, do not translate.',
  'No watermark, no signature, no extra text, no lorem ipsum, no gibberish letters anywhere.'
].join(' ');

const FREE = 'A small rounded pill badge, top centre: a blue-to-violet gradient pill with white bold text reading "FREE FOR A LIMITED TIME".';

/* ---- the pieces ------------------------------------------------------------ */
const PIECES = [
  {
    id: 'what-is',
    ratio: '1:1',
    resolution: '2K',
    brief: [
      'A single explanatory infographic that answers the question: what is this app?',
      'Top third: a small app wordmark reading "Get It?" in heavy white type, and under it a thin white line of text reading "Shows you who actually understood."',
      'Centre: four equal rounded cards stacked vertically, each with a simple flat icon on the left and one line of bold white text on the right, joined by short downward gradient arrows so it reads as a sequence.',
      'Card 1 icon: a small speaker or a text cursor in a chat bubble. Card 1 text: "You type the topic"',
      'Card 2 icon: a sheet of paper with a question mark. Card 2 text: "It writes the questions"',
      'Card 3 icon: a simple phone with a tick. Card 3 text: "They answer on their phones"',
      'Card 4 icon: a bar chart with one red bar. Card 4 text (make the words "who got it" gradient blue-to-violet): "You see who got it, in minutes"',
      'Bottom: the pill badge, and under it small grey text reading "dotheygetit.app"',
    ]
  },
  {
    id: 'the-problem',
    ratio: '1:1',
    resolution: '2K',
    brief: [
      'A bold typographic poster, two statements and one reveal, no icons needed.',
      'Upper half, in large white heavy type, two lines: "Thirty students nodded." then "Nodding is not understanding."',
      'Below that, a left-aligned vertical gradient bar, and next to it in gradient blue-to-violet heavy type: "Get It? shows you who did."',
      'Lower third: a simple flat illustration of a hand holding a phone, screen glowing blue-violet, tilted slightly, sitting quietly in the corner - keep it small and simple, do not let it dominate.',
      'Bottom: the pill badge.',
    ]
  },
  {
    id: 'how-it-works',
    ratio: '1:1',
    resolution: '2K',
    brief: [
      'A three step how-it-works infographic.',
      'Top: heavy white headline reading "How it works"',
      'Below: exactly three columns side by side, each with a large numeral above it - "1", "2", "3" - the numerals in gradient blue-to-violet, then a simple flat icon, then a bold white caption, then one short grey line of explanation.',
      'Column 1 icon: a text cursor in a chat bubble. Caption: "Type a topic". Grey line: "Any subject, any lesson."',
      'Column 2 icon: a sheet of paper with a question mark. Caption: "Get the questions". Grey line: "Written for you, instantly."',
      'Column 3 icon: a simple phone with a tick and a bar chart. Caption: "See who got it". Grey line: "In minutes, not next week."',
      'Bottom centre: the pill badge.',
    ]
  },
  {
    id: 'what-you-see',
    ratio: '1:1',
    resolution: '2K',
    brief: [
      'An infographic about the result screen.',
      'Top: heavy white headline reading "What you see"',
      'Below: a simple flat mock of a results screen - a dark rounded card listing four short pupil rows, each row a small circle avatar, a first name as a grey placeholder, and a coloured status chip on the right.',
      'The four chips must read exactly: "got it" in green, "got it" in green, "nearly" in amber, "not yet" in red.',
      'To the right of the mock, three short white lines of text stacked: "Who got it", "Who is nearly there", "Who is only nodding" - with the last line in red.',
      'Bottom: the pill badge, and under it small grey text reading "dotheygetit.app"',
    ]
  }
];

/* ---- go -------------------------------------------------------------------- */
(async () => {
  const list = only ? PIECES.filter(p => p.id === only) : PIECES;
  if (!list.length) { log('no piece called ' + only); process.exit(1); }

  log('infographics  ' + list.length + ' piece(s)  model ' + MODEL + '  credits ' + (await credits()));

  for (const p of list) {
    const ratio = p.ratio.replace(':', 'x');
    const file = path.join(OUT, p.id + '-' + ratio + '.png');
    const urlFile = path.join(OUT, p.id + '-' + ratio + '.url');

    if (fs.existsSync(file) && !FORCE) { log('  ' + p.id + '  cached'); continue; }

    const prompt = LOOK + ' THE COPY IS: ' + p.brief.join(' ') + ' ' + FREE;
    log('  ' + p.id + '  ' + p.ratio + ' ' + p.resolution + '  drawing ...');
    try {
      const url = await draw(prompt, p.ratio, p.resolution, p.id);
      await download(url, file);
      fs.writeFileSync(urlFile, url);
      log('\n  + ' + path.basename(file) + '  ' + (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
    } catch (e) {
      log('\n  ! ' + p.id + ': ' + e.message);
    }
  }

  log('\n  credits ' + (await credits()));
  log('  ' + OUT);
})();