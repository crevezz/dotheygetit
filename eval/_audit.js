const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const j = async (m, p, b) => {
  const r = await fetch('https://discord.com/api/v10' + p, {
    method: m, headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(m + ' ' + p + ' -> ' + r.status + ' ' + t.slice(0, 150));
  return o;
};
const cut = (s, n) => { s = String(s || '').replace(/\n/g, ' / '); return s.length > n ? s.slice(0, n) + '…' : s; };
(async () => {
  const g = (await j('GET', '/users/@me/guilds')).find(x => x.name === 'Get It?');
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  for (const c of chans.filter(c => c.type === 0 || c.type === 15).sort((a, b) => a.position - b.position)) {
    console.log('\n################ #' + c.name + '  (type ' + c.type + (c.type === 15 ? ', forum' : '') + ', topic: ' + (c.topic || '-') + ')');
    console.log('  perms: ' + JSON.stringify(c.permission_overwrites || []).slice(0, 200));
    if (c.type === 15) {
      const th = await j('GET', '/guilds/' + g.id + '/threads/active').catch(() => ({ threads: [] }));
      const mine = (th.threads || []).filter(t => t.parent_id === c.id);
      for (const t of mine) {
        const msgs = await j('GET', '/channels/' + t.id + '/messages?limit=5').catch(() => []);
        console.log('  -- thread "' + t.name + '"  tags=' + JSON.stringify(t.applied_tags || []) + '  msgs=' + msgs.length);
        msgs.forEach(m => console.log('       ' + (m.author.bot ? 'BOT ' : 'USER') + ': ' + cut(m.content, 400)));
      }
      const ap = await j('GET', '/channels/' + c.id + '/messages?limit=20').catch(() => []);
      console.log('  forum starter/other messages: ' + ap.length);
      ap.forEach(m => console.log('       ' + (m.author.bot ? 'BOT ' : 'USER') + ': ' + cut(m.content, 300)));
    } else {
      const msgs = await j('GET', '/channels/' + c.id + '/messages?limit=50').catch(() => []);
      console.log('  ' + msgs.length + ' messages');
      msgs.reverse().forEach(m => console.log('   [' + new Date(m.timestamp).toISOString().slice(0, 16) + '] ' + (m.author.bot ? 'BOT ' : 'USER') + ': ' + cut(m.content, 700)));
    }
    const tags = (c.available_tags || []).map(t => t.name);
    if (tags.length) console.log('  TAGS: ' + tags.join(' | '));
  }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
