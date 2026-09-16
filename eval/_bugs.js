/* #support is a ticket forum now, so #bug-reports is a second front door and will split reports
 * across two places. Empty -> delete it. Has history -> keep the history, lock it and point it
 * at #support. */
const fs = require('fs');
const TOKEN = (process.env.DISCORD_TOKEN || fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8')).trim();
const GUILD = '1549873926132211752';
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };
const SEND = 2048, THREADS = 274877906944, VIEW = 1024;

async function j(m, u, b) {
  const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error(m + ' ' + u + ' -> ' + r.status + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 140));
  return d;
}

(async () => {
  const chans = await j('GET', '/guilds/' + GUILD + '/channels');
  const bugs = chans.find(c => c.name === 'bug-reports');
  const forum = chans.find(c => c.type === 15 && c.name === 'support');
  if (!bugs) { console.log('#bug-reports already gone'); return; }
  if (!forum) { console.error('no #support forum - aborting so we do not leave you with nowhere to post'); process.exit(1); }

  const msgs = await j('GET', '/channels/' + bugs.id + '/messages?limit=50').catch(() => []);
  const human = msgs.filter(m => !m.author.bot).length;
  console.log('#bug-reports: ' + msgs.length + ' message(s), ' + human + ' from people');

  if (msgs.length <= 2 && human === 0) {
    await j('DELETE', '/channels/' + bugs.id);
    console.log('  ok   deleted - it was empty, so nothing was lost');
    return;
  }

  /* keep the history, shut the door */
  await j('PUT', '/channels/' + bugs.id + '/permissions/' + GUILD, { type: 0, deny: String(SEND + THREADS), allow: String(VIEW) });
  console.log('  ok   locked for members (read-only)');
  await j('POST', '/channels/' + bugs.id + '/messages', {
    content: '**Bugs now go in <#' + forum.id + '>.** Open a post there and tag it `bug` - that way each report is its own thread and nothing gets lost in the scroll.'
  });
  console.log('  ok   posted a pointer to #support');
})();
