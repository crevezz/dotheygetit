/* ============================================================================
   Upload the whole tutorial set to YouTube - one command, not fourteen.

   Same shape as apps/briefs/upload.js: OAuth2 with a stored refresh token,
   8AM / 3PM UK scheduling, per-video metadata and thumbnail, a duplicate
   shield, and a ledger so a re-run never uploads a chapter twice and picks up
   exactly where the quota stopped it.

   THE CEILING IS REAL: a fresh Google Cloud project gets 10,000 quota units a
   day. One upload costs 1,600, plus 50 for the thumbnail and 50 to file it in
   the playlist, so 1,700 each. Five is therefore the honest maximum a day, and
   that is the default. Asking for more than the quota allows does not fail the
   batch - it stops it cleanly and the next run picks up exactly where it left.

   Usage:
     node upload-youtube.js                 laptop set, up to 5 uploads, live straight away
     node upload-youtube.js --mobile        the phone set instead
     node upload-youtube.js --limit 2       smaller batch
     node upload-youtube.js --schedule      go up at 8AM / 3PM UK instead of straight away
     node upload-youtube.js --unlisted      unlisted, no schedule
     node upload-youtube.js --private       private, no schedule
     node upload-youtube.js --full          also upload all.mp4 as one long video
     node upload-youtube.js --no-thumb      skip thumbnails
     node upload-youtube.js --dry           print what it would do, change nothing
     node upload-youtube.js --status        print the ledger and stop
     node upload-youtube.js --auth          (re)authorise, or switch channel

   First time: put client_secret.json in the repo root, then run with --auth.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { google } = require('googleapis');
const ffmpeg = require('ffmpeg-static');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const HELP = path.join(ROOT, 'public', 'help');

const CRED_PATH = path.join(ROOT, 'client_secret.json');
const TOKEN_PATH = path.join(ROOT, 'youtube_token.json');
const YT_OUT = path.join(HERE, 'out', 'youtube');
const THUMB_DIR = path.join(YT_OUT, 'thumbs');
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'youtube.json'), 'utf8'));

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

/* ------------------------------------------------------------------- args */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const MOBILE = has('--mobile');
const SET = MOBILE ? 'mobile' : 'laptop';
const DIR = MOBILE ? path.join(HELP, 'mobile') : HELP;
const LIMIT = parseInt(val('--limit', '5'), 10);
const DRY = has('--dry');
const THUMBS = !has('--no-thumb');
const FULL = has('--full');

const MODE = has('--schedule') ? 'scheduled'
  : has('--unlisted') ? 'unlisted'
  : has('--private') ? 'private'
  : 'public';

const LEDGER = path.join(YT_OUT, `${SET}.json`);
const SLOT_MS = 2 * 60 * 1000;

/* ------------------------------------------------------------------ utils */
function ask(q) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a); });
  });
}
function mmss(s) {
  s = Math.round(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function readJson(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } }

/* ------------------------------------------------------------- London time
   Every slot is a UK wall-clock time, so the only correct way to place one is
   to ask what Europe/London actually reads at that instant. Hand-rolling the
   BST rule gets the two changeover Sundays wrong; Intl never does. */
function londonParts(ms) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const o = {}; for (const x of p) o[x.type] = x.value;
  return o;
}
const dayKey = (ms) => { const p = londonParts(ms); return `${p.year}-${p.month}-${p.day}`; };
const nextDay = (k) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/* The UTC instant whose London wall clock is `hour:00` on London date `key`. */
function slotInstant(key, hour) {
  const base = Date.parse(key + 'T00:00:00Z');
  for (let ms = base - 2 * 3600e3; ms <= base + 26 * 3600e3; ms += 60e3) {
    const p = londonParts(ms);
    if (`${p.year}-${p.month}-${p.day}` === key && +p.hour === hour) return new Date(ms);
  }
  return null;
}
function ukString(d) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d) + ' UK';
}

/* ----------------------------------------------------------------- ledger */
function loadLedger() {
  const l = readJson(LEDGER, null);
  if (l && l.items) return l;
  return { set: SET, playlistId: null, slots: [], items: {} };
}
function saveLedger(l) {
  fs.mkdirSync(YT_OUT, { recursive: true });
  l.updatedAt = new Date().toISOString();
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}
const sameSlot = (a, b) => Math.abs(a.getTime() - b.getTime()) < SLOT_MS;

/* The next free 8AM/3PM UK slot, respecting both YouTube's own schedule and
   our ledger (which covers anything in flight that YouTube cannot see yet). */
function claimSlot(ledger, after, occupiedFromYT) {
  const occupied = [];
  const add = (d) => { if (!occupied.some((o) => sameSlot(o, d))) occupied.push(d); };
  for (const s of ledger.slots) add(new Date(s));
  for (const d of occupiedFromYT) add(new Date(d));

  const { ukHours, minLeadMinutes, maxPerDay } = CFG.schedule;
  const floor = after.getTime() + minLeadMinutes * 60e3;

  for (let i = 0; i < 120; i++) {
    const key = dayKey(after.getTime() + i * 864e5);
    // how many slots that day are already spoken for
    const perDay = {};
    for (const d of occupied) { const k = dayKey(d.getTime()); perDay[k] = (perDay[k] || 0) + 1; }

    for (const h of ukHours) {
      const inst = slotInstant(key, h);
      if (!inst) continue;
      if (inst.getTime() <= floor) continue;
      if (occupied.some((o) => sameSlot(o, inst))) continue;
      if ((perDay[key] || 0) >= maxPerDay) continue;
      occupied.push(inst);
      ledger.slots = occupied.map((d) => d.toISOString()).filter((s) => Date.parse(s) > Date.now() - 864e5);
      return inst;
    }
  }
  return null;
}

/* --------------------------------------------------------------- metadata */
function chapterList(all) {
  return all.map((c) => `${String(c.n).padStart(2, '0')}. ${c.title} - ${mmss(c.len)}`);
}

function buildMetadata(ch, all, setLabel) {
  const tail = ` | ${CFG.channel} teacher tutorial ${ch.n}/${all.length}${setLabel}`;
  let title = ch.title + tail;
  if (title.length > 100) title = ch.title.slice(0, 100 - tail.length - 1).trim() + tail;

  const hook = CFG.hooks[ch.id] || ch.sub;
  /* The link goes FIRST. YouTube only shows the opening line or two of a
     description in search and under the player, so a link three paragraphs down
     is a link nobody clicks. */
  const body = [
    `Try it free: ${CFG.links.app}`,
    ch.sub,
    hook,
    CFG.blurb,
    CFG.free,
    `What it is: ${CFG.links.site}`,
    `All ${all.length} chapters: ${CFG.links.help}`,
    'Every chapter:\n' + chapterList(all).join('\n'),
    CFG.hashtags + (MOBILE && CFG.shorts ? ' ' + CFG.shorts : ''),
  ].filter(Boolean);
  const description = body.join('\n\n').trim().slice(0, 4900);

  // tags: the channel, whatever the chapter title is actually about, then the
  // standing list. No filler words - a tag nobody would ever type is a tag that
  // costs quota and returns nothing.
  const STOP = new Set(['what', 'that', 'this', 'with', 'from', 'your', 'theirs', 'there', 'then', 'them']);
  const words = ch.title.toLowerCase().replace(/\?/g, '').split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w));
  const tags = [];
  let used = 0;
  for (const t of [...new Set([CFG.channel.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), ...words, ...CFG.tags])]) {
    const cost = t.length + 1;
    if (used + cost > 480) break;
    tags.push(t); used += cost;
  }

  return { title, description, tags };
}

/* -------------------------------------------------------------- thumbnail
   The title card at the top of each chapter is already the brand: navy field,
   big white type. Grab that frame, fit it into 1280x720 and pad with the same
   navy, so the pad is invisible and no type is ever cropped. */
function makeThumb(ch, videoPath, cardAt) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const out = path.join(THUMB_DIR, `${SET}-${ch.id}.jpg`);
  const at = Math.max(0.5, (cardAt || 2.5) + 1.0);
  const r = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoPath, '-ss', at.toFixed(2), '-frames:v', '1',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,' +
           'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x070b16',
    '-q:v', '3', out,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) {
    console.log(`  thumbnail failed (${(r.stderr || '').trim().split('\n')[0] || 'ffmpeg'}) - keeping the auto frame`);
    return null;
  }
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`  thumbnail ${path.relative(ROOT, out)} (${kb} KB)`);
  return out;
}

/* ------------------------------------------------------------------- auth */
function makeOAuth() {
  if (!fs.existsSync(CRED_PATH)) {
    console.error(`\n  No client_secret.json at ${CRED_PATH}`);
    console.error('  Copy it from apps/briefs, or make a Desktop OAuth client in Google Cloud.\n');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const c = raw.installed || raw.web;
  const redirect = (c.redirect_uris && c.redirect_uris[0]) || 'http://localhost';
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirect);
}

async function authorize() {
  const o = makeOAuth();
  const fresh = has('--auth');

  if (!fresh && fs.existsSync(TOKEN_PATH)) {
    const t = readJson(TOKEN_PATH, null);
    if (t && t.refresh_token) { o.setCredentials(t); return o; }
  }

  console.log('\n' + '='.repeat(72));
  console.log('  Sign in with the Google account that owns the YouTube page.');
  console.log('  If that account has more than one channel, pick the right one');
  console.log('  on the consent screen - the API will then only ever touch that one.');
  console.log('='.repeat(72) + '\n');
  console.log(o.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES }));
  console.log('\n' + '='.repeat(72) + '\n');

  const code = (await ask('Paste the code from that page here: ')).trim();
  const { tokens } = await o.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`  token saved to ${TOKEN_PATH}`);
  if (tokens.refresh_token_expires_in) {
    const days = Math.round(tokens.refresh_token_expires_in / 86400);
    console.log(`\n  NOTE: this refresh token expires in ~${days} day(s). That is what Google does`);
    console.log('  to an OAuth app still in "Testing". Publish the consent screen in Google Cloud');
    console.log('  to get one that lasts, otherwise re-run with --auth when it lapses.\n');
  }
  o.setCredentials(tokens);
  return o;
}

/* ------------------------------------------------------------ API helpers */
const yt = (auth) => google.youtube({ version: 'v3', auth });

function insertVideo(youtube, params) {
  return new Promise((resolve, reject) => {
    youtube.videos.insert(params, {
      onUploadProgress: (e) => {
        const pct = Math.round((e.bytesRead / e.contentLength) * 100);
        process.stdout.write(`\r  uploading... ${pct}%   `);
      },
    }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
const isQuota = (e) => {
  const reasons = (e.errors || []).map((x) => x.reason).join(',');
  return /quotaExceeded|dailyLimitExceeded|uploadLimitExceeded|rateLimitExceeded/.test(reasons + ' ' + (e.message || ''));
};

async function channelInfo(youtube) {
  const r = await youtube.channels.list({ part: 'snippet,contentDetails', mine: true });
  const c = r.data.items && r.data.items[0];
  if (!c) throw new Error('this account has no YouTube channel');
  return {
    id: c.id,
    title: c.snippet.title,
    uploads: c.contentDetails.relatedPlaylists.uploads,
  };
}

/* Has this chapter already gone up? Cheap: 2 units, and it is the only thing
   that protects us if the ledger is lost or the process dies mid-upload. */
async function recentTitles(youtube, uploads) {
  const r = await youtube.playlistItems.list({ part: 'snippet', playlistId: uploads, maxResults: 50 });
  return (r.data.items || []).map((i) => ({ id: i.snippet.resourceId.videoId, title: i.snippet.title }));
}
async function takenSlots(youtube, uploads) {
  const r = await youtube.playlistItems.list({ part: 'contentDetails', playlistId: uploads, maxResults: 50 });
  const ids = (r.data.items || []).map((i) => i.contentDetails.videoId);
  if (!ids.length) return [];
  const v = await youtube.videos.list({ part: 'status', id: ids.join(',') });
  return (v.data.items || [])
    .filter((x) => x.status.privacyStatus === 'private' && x.status.publishAt)
    .map((x) => x.status.publishAt);
}

async function ensurePlaylist(youtube, ledger) {
  const name = CFG.playlist[SET];
  if (ledger.playlistId) return ledger.playlistId;
  const r = await youtube.playlists.insert({
    part: 'snippet,status',
    requestBody: { snippet: { title: name, description: `${CFG.blurb}\n\n${CFG.links.help}` }, status: { privacyStatus: 'public' } },
  });
  ledger.playlistId = r.data.id;
  saveLedger(ledger);
  console.log(`  playlist created: ${name}`);
  return ledger.playlistId;
}

/* ------------------------------------------------------------------- main */
async function main() {
  const index = readJson(path.join(DIR, 'index.json'), null);
  if (!index || !index.chapters) { console.error(`No index.json in ${DIR} - run build.js first.`); process.exit(1); }
  const all = index.chapters;

  const ledger = loadLedger();

  if (has('--status')) {
    console.log(`\n  ${SET} set - ${Object.keys(ledger.items).length}/${all.length} uploaded\n`);
    for (const c of all) {
      const it = ledger.items[c.id];
      console.log(it
        ? `  done    ${c.id.padEnd(28)} ${it.publishAt ? ukString(new Date(it.publishAt)) : 'no schedule'}  https://youtu.be/${it.videoId}`
        : `  pending ${c.id}`);
    }
    console.log('');
    return;
  }

  // chapter card times, so the thumbnail is the title card and not a random frame
  const cards = readJson(path.join(HERE, MOBILE ? 'chapters-mobile.json' : 'chapters.json'), null);
  const cardAt = {};
  if (cards && cards.chapters) for (const c of cards.chapters) cardAt[c.n] = c.cardStart;

  const queue = all.filter((c) => !ledger.items[c.id]);
  const extra = FULL && !MOBILE ? [{ id: 'all', n: all.length + 1, title: 'The whole thing, start to finish',
    sub: `All ${all.length} chapters back to back`, len: index.total, file: 'all.mp4' }] : [];
  const pending = [...queue, ...extra.filter((e) => !ledger.items[e.id])];

  console.log(`\n  ${CFG.channel} - ${SET} set`);
  console.log(`  ${all.length} chapters, ${Object.keys(ledger.items).length} already up, ${pending.length} to go`);
  console.log(`  mode: ${MODE}${MODE === 'scheduled' ? ` (${CFG.schedule.ukHours.join(':00, ')}:00 UK)` : ''}`);
  console.log(`  this run: up to ${LIMIT}\n`);

  if (!pending.length && !has('--fix-desc')) { console.log('  Nothing left to upload.\n'); return; }

  if (DRY) {
    let slot = new Date();
    for (const c of pending.slice(0, LIMIT)) {
      const meta = buildMetadata(c, all, MOBILE ? ' (on a phone)' : '');
      slot = claimSlot({ slots: [], items: {} }, slot, []) || slot;   // a throwaway: --dry must not touch the ledger
      console.log(`  --- ${c.id} ---`);
      console.log(`  title: ${meta.title}`);
      console.log(`  when : ${MODE === 'scheduled' ? ukString(slot) : MODE}`);
      console.log(`  tags : ${meta.tags.join(', ')}`);
      console.log(`  desc :\n${meta.description.split('\n').map((l) => '        ' + l).join('\n')}`);
      console.log('');
    }
    return;
  }

  const auth = await authorize();
  const youtube = yt(auth);

  let chan;
  try {
    chan = await channelInfo(youtube);
  } catch (e) {
    if (/invalid_grant|invalid_request|unauthorized/i.test(e.message || '')) {
      console.error('\n  The saved token is no longer valid. Run:  node upload-youtube.js --auth\n');
    } else {
      console.error('\n  Could not read the channel:', e.message, '\n');
    }
    process.exit(1);
  }
  console.log(`  channel: ${chan.title} (${chan.id})\n`);

  /* Rewrite the description on videos already up - for when the copy in
     youtube.json changes and you do not want to re-upload. 50 quota units each. */
  if (has('--fix-desc')) {
    let n = 0;
    for (const c of all) {
      const it = ledger.items[c.id];
      if (!it) continue;
      const meta = buildMetadata(c, all, MOBILE ? ' (on a phone)' : '');
      const cur = await youtube.videos.list({ part: 'snippet', id: it.videoId });
      const sn = cur.data.items && cur.data.items[0] && cur.data.items[0].snippet;
      if (!sn) { console.log(`  ${c.id}: not found on YouTube`); continue; }
      if (sn.description === meta.description) { console.log(`  ${c.id}: already right`); continue; }
      await youtube.videos.update({
        part: 'snippet',
        requestBody: {
          id: it.videoId,
          snippet: {
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            categoryId: sn.categoryId || CFG.categoryId,
            defaultLanguage: sn.defaultLanguage,
            defaultAudioLanguage: sn.defaultAudioLanguage,
          },
        },
      });
      console.log(`  ${c.id}: description updated  https://youtu.be/${it.videoId}`);
      n++;
    }
    console.log(`\n  ${n} description(s) updated.\n`);
    return;
  }

  const existing = await recentTitles(youtube, chan.uploads);
  const ytSlots = await takenSlots(youtube, chan.uploads);
  const playlistId = MODE === 'scheduled' || MODE === 'public' ? await ensurePlaylist(youtube, ledger) : null;

  let done = 0;
  let stoppedForQuota = false;

  for (const ch of pending) {
    if (done >= LIMIT) break;

    const file = path.join(DIR, ch.file || `${ch.id}.mp4`);
    if (!fs.existsSync(file)) { console.log(`  MISSING ${file} - skipped`); continue; }

    const meta = buildMetadata(ch, all, MOBILE ? ' (on a phone)' : '');

    // duplicate shield
    const dupe = existing.find((x) => x.title.trim().toLowerCase() === meta.title.trim().toLowerCase());
    if (dupe) {
      ledger.items[ch.id] = { videoId: dupe.id, title: meta.title, publishAt: null, at: new Date().toISOString(), note: 'already on the channel' };
      saveLedger(ledger);
      console.log(`  ${ch.id}: already on the channel - https://youtu.be/${dupe.id}`);
      continue;
    }

    let when = null;
    if (MODE === 'scheduled') {
      when = claimSlot(ledger, new Date(), ytSlots);
      if (!when) { console.log('  could not find a free slot in the next 120 days - stopping'); break; }
      ytSlots.push(when.toISOString());
      saveLedger(ledger);   // reserve before the upload, so a crash cannot double-book
    }

    const status = { selfDeclaredMadeForKids: false, privacyStatus: MODE === 'scheduled' ? 'private' : MODE };
    if (when) status.publishAt = when.toISOString();

    console.log(`  ${ch.id}`);
    console.log(`    ${meta.title}`);
    console.log(`    ${when ? ukString(when) : MODE}   ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);

    let res;
    try {
      res = await insertVideo(youtube, {
        part: 'snippet,status',
        notifySubscribers: false,
        requestBody: {
          snippet: {
            title: meta.title, description: meta.description, tags: meta.tags,
            categoryId: CFG.categoryId, defaultLanguage: 'en', defaultAudioLanguage: 'en',
          },
          status,
        },
        media: { body: fs.createReadStream(file) },
      });
    } catch (e) {
      process.stdout.write('\n');
      if (isQuota(e)) {
        console.log('    YouTube quota for today is spent. Stopping here.');
        console.log('    Everything uploaded so far is recorded - just run this again after midnight Pacific.\n');
        stoppedForQuota = true;
        if (when) { ledger.slots = ledger.slots.filter((s) => !sameSlot(new Date(s), when)); saveLedger(ledger); }
        break;
      }
      console.log(`    FAILED: ${e.message} - continuing with the next one`);
      if (when) { ledger.slots = ledger.slots.filter((s) => !sameSlot(new Date(s), when)); saveLedger(ledger); }
      continue;
    }
    process.stdout.write('\n');

    const id = res.data.id;
    ledger.items[ch.id] = { videoId: id, title: meta.title, publishAt: when ? when.toISOString() : null, at: new Date().toISOString() };
    saveLedger(ledger);
    console.log(`    uploaded  https://youtu.be/${id}`);

    if (THUMBS) {
      const thumb = makeThumb(ch, file, cardAt[ch.n]);
      if (thumb) {
        try {
          await youtube.thumbnails.set({ videoId: id, media: { body: fs.createReadStream(thumb) } });
          console.log('    thumbnail set');
        } catch (e) {
          console.log(`    thumbnail not set (${e.message}) - the auto frame stays`);
        }
      }
    }

    if (playlistId) {
      try {
        await youtube.playlistItems.insert({
          part: 'snippet',
          requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: id } } },
        });
        console.log('    added to the playlist');
      } catch (e) {
        console.log(`    not added to the playlist (${e.message})`);
      }
    }

    existing.push({ id, title: meta.title });
    done++;
    console.log('');
  }

  const left = all.length - Object.keys(ledger.items).length;
  console.log(`  ${done} uploaded this run. ${left} chapter(s) still to go.`);
  if (left > 0) console.log(`  Run it again${stoppedForQuota ? ' tomorrow' : ''} to continue.\n`);
  else console.log('  The whole set is up.\n');
}

main().catch((e) => {
  if (/invalid_grant/i.test(e.message || '')) {
    console.error('\n  The saved token expired. Run:  node upload-youtube.js --auth\n');
  } else {
    console.error('\n  ' + (e.message || e) + '\n');
  }
  process.exit(1);
});
