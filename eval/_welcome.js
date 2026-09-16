const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const j = async (m, p, b) => {
  const r = await fetch('https://discord.com/api/v10' + p, {
    method: m,
    headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  let o = null; try { o = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(m + ' ' + p + ' -> ' + r.status + ' ' + t.slice(0, 200));
  return o;
};
(async () => {
  const g = (await j('GET', '/users/@me/guilds')).find(x => x.name === 'Get It?') || (await j('GET', '/users/@me/guilds'))[0];
  console.log('guild: ' + g.name + '  ' + g.id);
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  const cats = {}; chans.filter(c => c.type === 4).forEach(c => cats[c.id] = c.name);
  for (const c of chans.filter(c => c.type !== 4).sort((a, b) => a.position - b.position)) {
    console.log('  [' + c.type + '] #' + c.name + '   (in ' + (cats[c.parent_id] || '-') + ')  id=' + c.id);
  }
  const w = chans.find(c => c.name === 'welcome');
  if (!w) return console.log('no #welcome');
  const msgs = await j('GET', '/channels/' + w.id + '/messages?limit=20');
  console.log('\n=== #welcome: ' + msgs.length + ' messages ===');
  msgs.reverse().forEach(m => console.log('\n--- ' + m.author.username + ' ' + m.timestamp + ' ---\n' + (m.content || '')));
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
