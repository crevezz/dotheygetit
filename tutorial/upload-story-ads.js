/* ============================================================================
   Schedule the 10 Get It? story adverts on YouTube.

   These are the finished vertical adverts in marketing/out/beats/*-story-app.mp4
   (1080x1920, ~27-33s) - so they go up as Shorts. upload-advert.js is for the
   older single tutorial advert and is NOT used here.

   Usage:
     node upload-story-ads.js --dry                 print the schedule + copy
     node upload-story-ads.js                       schedule them (private + publishAt)
     node upload-story-ads.js --start=2026-10-01    first day (default: tomorrow)
     node upload-story-ads.js --only=nod,quiet      just these
     node upload-story-ads.js --now                 publish all immediately (no schedule)

   Scheduling on YouTube = privacyStatus 'private' PLUS a status.publishAt time.
   The video appears at that time automatically.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const BEATS = path.join(ROOT, 'marketing', 'out', 'beats');

const CRED_PATH = path.join(ROOT, 'client_secret.json');
const TOKEN_PATH = path.join(ROOT, 'youtube_token.json');
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'youtube.json'), 'utf8'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const a = argv.find((x) => x.startsWith(f + '=')); return a ? a.split('=').slice(1).join('=') : d; };

const DRY = has('--dry');
const NOW = has('--now');
const ONLY = val('--only', '').split(',').filter(Boolean);

/* Order matters: this is the run order. Each ad: file id, title, opening line. */
/* quiet is deliberately NOT here: it did not come out well and was deleted
   from YouTube. Everything else runs one a day. */
const ADS = [
  { id: 'explainer', file: 'explainer-hd-app.mp4', wide: 1, title: 'What is Get It? Know who got it, in about 2 minutes | Get It?', hook: 'Type a topic, every pupil answers privately on any device (typed or spoken), and you see who got it, who is unsure and who needs help, by name. Year 5 to college. Free during beta.' },
  { id: 'nod', title: 'Thirty students nodded. Nodding is not understanding. | Get It?',
    hook: "Thirty students nodded. That's not the same as thirty students understanding." },
  { id: 'ninepm', title: '30 books. 9pm. Still no idea who got it. | Get It?',
    hook: '30 books marked, 9pm, and still no idea who actually got it.' },
  { id: 'twominutes', title: 'Exit tickets read at 10pm are useless by then. | Get It?',
    hook: 'Exit tickets read at 10pm tell you nothing you can still use.' },
  { id: 'middle', title: 'You know your top five and bottom five. Name the middle. | Get It?',
    hook: 'You know your top five and your bottom five. The middle is the mystery.' },
  { id: 'cover', title: 'Cover lesson. Not your subject. One sticky note. | Get It?',
    hook: 'Cover lesson, not your subject, one sticky note. Did they get it?' },
  { id: 'proof', title: '"How do you know they got it?" - your head of department | Get It?',
    hook: '"How do you know they got it?" - your head of department.' },
  { id: 'before', title: "Don't find out in the mock. | Get It?",
    hook: "Don't find out in the mock. Find out while you can still fix it." },
  { id: 'speak', title: "He can explain it perfectly. He just won't write it. | Get It?",
    hook: "He can explain it perfectly. He just won't write it down." },
  { id: 'plainly', title: 'Cold calling, without the cold. | Get It?',
    hook: 'Cold calling, without the cold. Every pupil answers, nobody is put on the spot.' },
];

function description(a) {
  return [
    a.hook,
    '',
    'Get It? gives your class one code. They answer in two minutes on any device,',
    'no logins, no apps, nothing to mark. You see exactly who got it, who is shaky,',
    'and who is quietly faking it, before the test does.',
    '',
    CFG.free,
    '',
    `Try it on one class  \u2192  ${CFG.links.app}`,
    `What it is          \u2192  ${CFG.links.site}`,
    `Teacher help        \u2192  ${CFG.links.help}`,
    '',
    CFG.hashtags + (a.wide ? '' : ' ' + CFG.shorts),
  ].join('\n');
}

/* ------------------------------------------------------------ oauth/upload */

function authorize() {
  if (!fs.existsSync(CRED_PATH)) { console.error('No client_secret.json at ' + CRED_PATH); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const c = raw.installed || raw.web;
  const o = new google.auth.OAuth2(c.client_id, c.client_secret, (c.redirect_uris && c.redirect_uris[0]) || 'http://localhost');
  if (!fs.existsSync(TOKEN_PATH)) { console.error('No youtube_token.json. Run: node upload-youtube.js --auth'); process.exit(1); }
  const t = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  if (!t.refresh_token) { console.error('Token has no refresh_token. Run: node upload-youtube.js --auth'); process.exit(1); }
  o.setCredentials(t);
  return o;
}

function insertVideo(youtube, params, totalBytes) {
  return new Promise((resolve, reject) => {
    youtube.videos.insert(params, {
      onUploadProgress: (e) => {
        const total = e.contentLength || totalBytes || 0;
        process.stdout.write(`\r    uploading... ${total ? Math.round((e.bytesRead / total) * 100) : 0}%   `);
      },
    }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

/* ----------------------------------------------------------- schedule calc */

/* London local -> RFC3339 with the right offset (handles BST/GMT). */
function londonRFC(y, m, d, h, min) {
  const guessUTC = Date.UTC(y, m - 1, d, h, min);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guessUTC)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  const offsetMin = Math.round((asUTC - guessUTC) / 60000); // +60 in BST
  const real = new Date(guessUTC - offsetMin * 60000);
  const s = new Date(real.getTime() + offsetMin * 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const oh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const om = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  const pad = (n) => String(n).padStart(2, '0');
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}T${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:00${sign}${oh}:${om}`;
}

function buildSlots(n) {
  const start = val('--start', '');
  const base = start ? new Date(start + 'T12:00:00Z') : new Date(Date.now() + 24 * 3600 * 1000);
  /* One a day, end of day (18:00 UK), so it is not spammy. */
  const hours = [Number(val('--hour', 18))];
  const slots = [];
  let day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  while (slots.length < n) {
    for (const h of hours) {
      if (slots.length >= n) break;
      slots.push(londonRFC(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, 0));
    }
    day = new Date(day.getTime() + 24 * 3600 * 1000);
  }
  return slots;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const list = ONLY.length ? ADS.filter((a) => ONLY.includes(a.id)) : ADS;
  const slots = NOW ? list.map(() => null) : buildSlots(list.length);

  console.log('\n' + '='.repeat(72));
  console.log(`  Get It? story adverts -> YouTube  (${list.length} videos, ${NOW ? 'publish now' : 'scheduled'})`);
  console.log('='.repeat(72));

  let youtube = null;
  if (!DRY) {
    youtube = google.youtube({ version: 'v3', auth: authorize() });
    const r = await youtube.channels.list({ part: 'snippet', mine: true });
    const ch = r.data.items && r.data.items[0];
    if (!ch) throw new Error('this account has no YouTube channel');
    console.log('\n  channel: ' + ch.snippet.title);
  }

  const results = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const file = path.join(BEATS, a.file || `${a.id}-story-app.mp4`);
    const publishAt = slots[i];
    console.log(`\n  ${a.id}`);
    console.log(`    file     ${path.basename(file)} ${fs.existsSync(file) ? '(' + (fs.statSync(file).size / 1048576).toFixed(1) + ' MB)' : '*** MISSING ***'}`);
    console.log(`    title    ${a.title}`);
    console.log(`    publish  ${publishAt || 'immediately'}`);

    if (!fs.existsSync(file)) { console.log('    SKIP - run beat-film.js for this ad'); continue; }
    if (DRY) { console.log('    (dry run)'); continue; }

    const status = publishAt
      ? { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
      : { privacyStatus: 'public', selfDeclaredMadeForKids: false };

    const res = await insertVideo(youtube, {
      part: 'snippet,status',
      requestBody: {
        snippet: { title: a.title, description: description(a), tags: CFG.tags, categoryId: CFG.categoryId },
        status,
      },
      media: { body: fs.createReadStream(file) },
    }, fs.statSync(file).size);

    console.log(`\r    queued  https://youtu.be/${res.data.id}   `);
    results.push({ id: a.id, yt: res.data.id, publishAt });
  }

  console.log('\n' + '='.repeat(72));
  if (DRY) console.log('  dry run complete. Re-run without --dry to schedule.');
  else { console.log(`  ${results.length} video(s) scheduled`); for (const r of results) console.log(`    ${r.id.padEnd(10)} https://youtu.be/${r.yt}  ${r.publishAt || 'now'}`); }
  console.log('='.repeat(72) + '\n');
}

main().catch((e) => {
  const msg = (e && e.message) || String(e);
  console.error('\n  FAILED: ' + msg);
  if (/invalid_grant|invalid_request|unauthorized/i.test(msg)) console.error('\n  Stale token. Re-authorise: node upload-youtube.js --auth\n');
  if (/quota/i.test(msg)) console.error('\n  Quota used up. Uploads cost 1,600 of 10,000/day. 10 ads = 16,000, so split across two days.\n');
  process.exit(1);
});
