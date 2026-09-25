/* ============================================================================
   Upload the Get It? advert to YouTube.

   upload-youtube.js pushes the fourteen tutorial chapters and knows nothing
   about the advert, so this is the advert's own path. It reuses the same
   client_secret.json + youtube_token.json, so authorising the tutorial set
   already authorises this.

   The advert is already rendered in every ratio by advert.js:

     out/advert/advert-16x9.mp4   1920x1080   34.9s   <- YouTube proper
     out/advert/advert-9x16.mp4   1080x1920   34.9s   <- Shorts / TikTok
     out/advert/advert-1x1.mp4    1080x1080   34.9s   <- feed
     out/advert/advert-4x5.mp4    1080x1350   34.9s   <- feed

   (out/advert/advert.mp4 is an older 27s cut - ignore it.)

   Usage:
     node upload-advert.js --dry          print exactly what would go up
     node upload-advert.js                upload the 16:9, public
     node upload-advert.js --short        upload the 9:16 as a Short instead
     node upload-advert.js --both         upload both
     node upload-advert.js --unlisted     hide it while you check it
     node upload-advert.js --private      fully private

   First time on a new machine: run `node upload-youtube.js --auth` first.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const OUT = path.join(HERE, 'out', 'advert');

const CRED_PATH = path.join(ROOT, 'client_secret.json');
const TOKEN_PATH = path.join(ROOT, 'youtube_token.json');
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'youtube.json'), 'utf8'));

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

/* ------------------------------------------------------------------- args */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

const DRY = has('--dry');
const SHORT = has('--short');
const BOTH = has('--both');
const MODE = has('--unlisted') ? 'unlisted' : has('--private') ? 'private' : 'public';

/* --------------------------------------------------------------- metadata */

const HOOK = "Thirty students nodded. That's not the same as understanding.";

const TITLE = {
  long: 'Thirty students nodded. Nodding is not understanding. | Get It?',
  short: 'Thirty students nodded. Nodding is not understanding. #Shorts',
};

function description(forShort) {
  return [
    HOOK,
    '',
    'Get It? gives your class one code. They answer on their phones — two minutes,',
    'no logins, no apps, and nothing to mark. You see exactly who got it, who is',
    'shaky, and who is quietly faking it, before the test does.',
    '',
    CFG.free,
    '',
    `Try it on one class  →  ${CFG.links.app}`,
    `What it is          →  ${CFG.links.site}`,
    `Teacher help        →  ${CFG.links.help}`,
    '',
    CFG.hashtags + (forShort ? ' ' + CFG.shorts : ''),
  ].join('\n');
}

/* ------------------------------------------------------------------- oauth */

function makeOAuth() {
  if (!fs.existsSync(CRED_PATH)) {
    console.error(`\n  No client_secret.json at ${CRED_PATH}\n`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const c = raw.installed || raw.web;
  const redirect = (c.redirect_uris && c.redirect_uris[0]) || 'http://localhost';
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirect);
}

function authorize() {
  const o = makeOAuth();
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error(`\n  No youtube_token.json at ${TOKEN_PATH}`);
    console.error('  Run:  node upload-youtube.js --auth\n');
    process.exit(1);
  }
  const t = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  if (!t.refresh_token) {
    console.error('\n  Token has no refresh_token. Run:  node upload-youtube.js --auth\n');
    process.exit(1);
  }
  o.setCredentials(t);
  return o;
}

/* ------------------------------------------------------------------ upload */

function insertVideo(youtube, params, totalBytes) {
  return new Promise((resolve, reject) => {
    youtube.videos.insert(params, {
      onUploadProgress: (e) => {
        /* googleapis does not always set contentLength, which made this print
           NaN%. Fall back to the size we measured off disk. */
        const total = e.contentLength || totalBytes || 0;
        const pct = total ? Math.round((e.bytesRead / total) * 100) : 0;
        process.stdout.write(`\r  uploading... ${pct}%   `);
      },
    }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

async function uploadOne(youtube, spec) {
  const file = path.join(OUT, spec.file);
  if (!fs.existsSync(file)) {
    console.error(`  MISSING ${spec.file} - run advert.js first`);
    return null;
  }

  const bytes = fs.statSync(file).size;
  const mb = (bytes / 1024 / 1024).toFixed(1);

  console.log(`\n  ${spec.label}`);
  console.log(`    file      ${spec.file}  (${mb} MB)`);
  console.log(`    title     ${spec.title}`);
  console.log(`    privacy   ${MODE}`);
  console.log(`    tags      ${CFG.tags.slice(0, 6).join(', ')}...`);

  if (DRY) {
    console.log('    (dry run - nothing sent)');
    console.log('\n    --- description ---');
    console.log(spec.description.split('\n').map((l) => '    ' + l).join('\n'));
    return { dry: true, title: spec.title };
  }

  const res = await insertVideo(youtube, {
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: spec.title,
        description: spec.description,
        tags: CFG.tags,
        categoryId: CFG.categoryId,
      },
      status: {
        privacyStatus: MODE,
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: fs.createReadStream(file) },
  }, bytes);

  const id = res.data.id;
  console.log(`\r    uploaded        https://youtu.be/${id}          `);
  return { id, title: spec.title };
}

async function main() {
  const jobs = [];

  if (SHORT || BOTH) {
    jobs.push({
      label: 'Advert (9:16 - Shorts)',
      file: 'advert-9x16.mp4',
      title: TITLE.short,
      description: description(true),
    });
  }
  if (!SHORT || BOTH) {
    jobs.push({
      label: 'Advert (16:9 - main)',
      file: 'advert-16x9.mp4',
      title: TITLE.long,
      description: description(false),
    });
  }

  console.log('\n' + '='.repeat(72));
  console.log('  Get It? advert → YouTube');
  console.log('='.repeat(72));

  let youtube = null;
  if (!DRY) {
    youtube = google.youtube({ version: 'v3', auth: authorize() });
    const r = await youtube.channels.list({ part: 'snippet', mine: true });
    const ch = r.data.items && r.data.items[0];
    if (!ch) throw new Error('this account has no YouTube channel');
    console.log(`\n  channel: ${ch.snippet.title}`);
  }

  const done = [];
  for (const job of jobs) {
    const out = await uploadOne(youtube, job);
    if (out) done.push(out);
  }

  console.log('\n' + '='.repeat(72));
  if (DRY) {
    console.log(`  dry run complete - ${done.length} video(s) would be uploaded`);
    console.log('  re-run without --dry to send them');
  } else {
    console.log(`  ${done.length} video(s) uploaded`);
    for (const d of done) console.log(`    https://youtu.be/${d.id}  ${d.title}`);
  }
  console.log('='.repeat(72) + '\n');
}

main().catch((e) => {
  const msg = (e && e.message) || String(e);
  console.error('\n  FAILED: ' + msg);
  if (/invalid_grant|invalid_request|unauthorized/i.test(msg)) {
    console.error('\n  The stored token is stale. Re-authorise with:');
    console.error('    node upload-youtube.js --auth\n');
  }
  if (/quota/i.test(msg)) {
    console.error('\n  Quota is used up. Uploads cost 1,600 units of 10,000/day.\n');
  }
  process.exit(1);
});
