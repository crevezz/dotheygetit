/* Delete the quiet advert and re-time the rest to one a day.
   Usage: node reschedule-ads.js [--dry] [--hour=18] [--start=YYYY-MM-DD] */
'use strict';
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const a = argv.find((x) => x.startsWith(f + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const DRY = has('--dry');
const HOUR = +val('--hour', '18');

const DELETE = 'quiet';
const KEEP = [
  ['nod', 'REuBL62MEq0'],
  ['ninepm', 'i0qYA9QJqgE'],
  ['twominutes', 'ro7MboG0P8w'],
  ['middle', 'VnO09EyU1vM'],
  ['cover', 'LV5zaV1xmP8'],
  ['proof', 't-XZ9OveojQ'],
  ['before', 'pmM09KoIv4I'],
  ['speak', 'by7kRlLmNxQ'],
  ['plainly', 'WZ1-xK1H03s'],
];
const QUIET_ID = '-BU7rPNNBcM';

function authorize() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'client_secret.json'), 'utf8'));
  const c = raw.installed || raw.web;
  const o = new google.auth.OAuth2(c.client_id, c.client_secret, (c.redirect_uris && c.redirect_uris[0]) || 'http://localhost');
  o.setCredentials(JSON.parse(fs.readFileSync(path.join(ROOT, 'youtube_token.json'), 'utf8')));
  return o;
}
async function main() {
  const yt = google.youtube({ version: 'v3', auth: authorize() });

  // 18:00 London, one per day from tomorrow
  const startStr = val('--start', '');
  const base = startStr ? new Date(startStr + 'T12:00:00Z') : new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rfc = (dt) => {
    const g = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), HOUR, 0);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date(g)).map((x) => [x.type, x.value]));
    const off = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24) - g) / 60000);
    return `${p.year}-${p.month}-${p.day}T${pad(HOUR)}:00:00${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  };

  console.log('\n  Deleting quiet (' + QUIET_ID + ')');
  if (!DRY) await yt.videos.delete({ id: QUIET_ID });

  let day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  for (const [name, id] of KEEP) {
    const publishAt = rfc(day);
    console.log(`  ${name.padEnd(10)} ${id}  ->  ${publishAt}`);
    if (!DRY) await yt.videos.update({ part: 'status', requestBody: { id, status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false } } });
    day = new Date(day.getTime() + 24 * 3600 * 1000);
  }
  console.log(DRY ? '\n  dry run.\n' : '\n  done: quiet deleted, 9 re-scheduled one per day.\n');
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
