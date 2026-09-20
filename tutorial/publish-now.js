/* ============================================================================
   Publish anything sitting in the ledger as scheduled, right now.

   upload-youtube.js can schedule a video (private + a publishAt time). This
   undoes that: every chapter in out/youtube/<set>.json that is still scheduled
   becomes public immediately.

   Usage:
     node publish-now.js --dry     show what would go public
     node publish-now.js           publish it
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const YT_OUT = path.join(HERE, 'out', 'youtube');
const CRED_PATH = path.join(ROOT, 'client_secret.json');
const TOKEN_PATH = path.join(ROOT, 'youtube_token.json');

const DRY = process.argv.includes('--dry');
const SETS = process.argv.includes('--mobile') ? ['mobile'] : ['laptop', 'mobile'];

function makeOAuth() {
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const c = raw.installed || raw.web;
  const redirect = (c.redirect_uris && c.redirect_uris[0]) || 'http://localhost';
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirect);
}

(async () => {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('\n  No youtube_token.json - run:  node upload-youtube.js --auth\n');
    process.exit(1);
  }
  const auth = makeOAuth();
  auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  const youtube = google.youtube({ version: 'v3', auth });

  const ids = [];
  for (const set of SETS) {
    const p = path.join(YT_OUT, `${set}.json`);
    if (!fs.existsSync(p)) continue;
    const led = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [id, it] of Object.entries(led.items || {})) {
      if (it.videoId) ids.push({ set, id, videoId: it.videoId, publishAt: it.publishAt });
    }
  }
  if (!ids.length) { console.log('\n  Nothing in the ledger yet.\n'); return; }

  // what is each one actually doing on YouTube right now?
  const live = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await youtube.videos.list({
      part: 'status,snippet',
      id: ids.slice(i, i + 50).map(x => x.videoId).join(',')
    });
    for (const v of r.data.items || []) live.push(v);
  }
  const byId = new Map(live.map(v => [v.id, v]));

  console.log(`\n  ${ids.length} in the ledger, ${live.length} found on YouTube\n`);
  let done = 0, skipped = 0;

  for (const x of ids) {
    const v = byId.get(x.videoId);
    if (!v) { console.log(`  ${x.id}: not found on YouTube - skipped`); skipped++; continue; }
    const st = v.status || {};
    if (st.privacyStatus === 'public' && !st.publishAt) { console.log(`  ${x.id}: already public (${st.privacyStatus}, publishAt ${st.publishAt || 'none'}, uploadStatus ${st.uploadStatus})`); skipped++; continue; }

    console.log(`  ${x.id}: ${st.privacyStatus}${st.publishAt ? ' until ' + st.publishAt : ''} -> public`);
    if (DRY) continue;

    try {
      await youtube.videos.update({
        part: 'status',
        requestBody: {
          id: x.videoId,
          status: { privacyStatus: 'public', publishAt: null, selfDeclaredMadeForKids: false }
        }
      });
      // a scheduled video keeps its private flag until publishAt is cleared; confirm
      const back = await youtube.videos.list({ part: 'status', id: x.videoId });
      const now = (back.data.items || [])[0];
      const ok = now && now.status && now.status.privacyStatus === 'public';
      console.log(`    ${ok ? 'public now' : 'STILL ' + (now && now.status && now.status.privacyStatus)}  https://youtu.be/${x.videoId}`);
      if (ok) { done++; x.publishAt = null; } else { skipped++; }
    } catch (e) {
      const why = (e.errors && e.errors.map(y => y.reason).join(',')) || e.message;
      console.log(`    failed: ${why}`);
      skipped++;
    }
  }

  if (!DRY) {
    for (const set of SETS) {
      const p = path.join(YT_OUT, `${set}.json`);
      if (!fs.existsSync(p)) continue;
      const led = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const x of ids) if (x.set === set && led.items[x.id]) delete led.items[x.id].publishAt;
      led.updatedAt = new Date().toISOString();
      fs.writeFileSync(p, JSON.stringify(led, null, 2));
    }
  }

  console.log(`\n  ${DRY ? 'would publish' : 'published'} ${done}, skipped ${skipped}.\n`);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
