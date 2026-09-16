/* Put the nine chapter videos into #how-to, one message each.
 * Discord plays .mp4 inline, so this doubles as a browsable copy of the tutorials.
 * Free-server upload cap is 10 MB - all.mp4 is bigger than that, so it is tried last and its
 * failure is not fatal. */
const fs = require('fs');
const path = require('path');

const TOKEN = (process.env.DISCORD_TOKEN || fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8')).trim();
const GUILD = '1549873926132211752';
const HELP = path.join(__dirname, '..', 'tutorial', 'out', 'tutorials');
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN };

const TITLES = {
  '01-what-get-it-is': '1. What Get It? is',
  '02-create-your-account': '2. Create your account',
  '03-set-up-your-class': '3. Set up your class',
  '04-write-the-questions': '4. Write the questions',
  '05-how-pupils-join': '5. How pupils join - play this one on the whiteboard',
  '06-read-your-results': '6. Read your results',
  '07-change-a-colour': '7. Change a colour yourself',
  '08-spot-the-pattern': '8. Spot the pattern',
  '09-your-data': '9. Your data, and theirs'
};

async function j(method, url, body) {
  const r = await fetch(API + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error(method + ' ' + url + ' -> ' + r.status + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 180));
  return d;
}

(async () => {
  const me = await j('GET', '/users/@me');
  console.log('bot:', me.username + '#' + me.discriminator);
  const chans = await j('GET', '/guilds/' + GUILD + '/channels');
  const howto = chans.find(c => c.name === 'how-to');
  if (!howto) { console.error('#how-to not found. channels: ' + chans.map(c => c.name).join(', ')); process.exit(1); }
  console.log('#how-to id:', howto.id);

  /* what is already in there, so a re-run does not post everything twice */
  const existing = await j('GET', '/channels/' + howto.id + '/messages?limit=50');
  const already = new Set(existing.map(m => (m.attachments[0] || {}).filename).filter(Boolean));
  console.log('already posted:', already.size);

  const ids = Object.keys(TITLES);
  const files = ids.map(i => i + '.mp4').concat(['all.mp4']);
  let first = null, ok = 0;

  for (const f of files) {
    if (already.has(f)) { console.log('  · ' + f + ' (already there)'); continue; }
    const p = path.join(HELP, f);
    if (!fs.existsSync(p)) { console.log('  ! ' + f + ' missing on disk'); continue; }
    const id = f.replace('.mp4', '');
    const kb = Math.round(fs.statSync(p).size / 1024);
    const content = TITLES[id]
      ? '**' + TITLES[id] + '**\n' + 'https://app.dotheygetit.app/help#' + id
      : '**All nine, in order** (5 min 17 s, includes the title cards)\nhttps://app.dotheygetit.app/help';
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify({ content }));
    fd.append('files[0]', new Blob([fs.readFileSync(p)], { type: 'video/mp4' }), f);
    const r = await fetch(API + '/channels/' + howto.id + '/messages', { method: 'POST', headers: H, body: fd });
    const t = await r.text();
    if (!r.ok) { console.log('  FAIL ' + f + ' (' + kb + ' KB) -> ' + r.status + ' ' + t.slice(0, 120)); continue; }
    const msg = JSON.parse(t);
    if (!first) first = msg.id;
    ok++;
    console.log('  ok   ' + f + ' (' + kb + ' KB)');
  }

  if (first) {
    try { await j('PUT', '/channels/' + howto.id + '/pins/' + first); console.log('pinned the first message'); }
    catch (e) { console.log('pin skipped:', String(e.message).slice(0, 90) + ' (right-click -> Pin, or ignore)'); }
  }
  console.log('\nposted ' + ok + ' video(s) to #how-to');
})();
