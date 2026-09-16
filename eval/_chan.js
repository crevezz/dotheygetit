// Add a channel by name, in a category, with a topic and an opening post.
// usage: node eval/_chan.js <name> <category> "topic" "opening post"
const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };
const j = async (m, u, b) => {
  const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let o = null; try { o = JSON.parse(t); } catch { o = { raw: t }; }
  if (!r.ok) throw new Error(m + ' ' + u + ' -> ' + r.status + ' ' + (o.message || t).slice(0, 200));
  return o;
};
(async () => {
  const [name, cat, topic, post] = process.argv.slice(2);
  if (!name) { console.error('need a channel name'); process.exit(1); }
  const g = (await j('GET', '/users/@me/guilds'))[0];
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  let ch = chans.find(c => c.name === name);
  if (ch) { console.log('#' + name, 'already there'); }
  else {
    const parent = cat ? chans.find(c => c.type === 4 && c.name.toLowerCase() === cat.toLowerCase()) : null;
    ch = await j('POST', '/guilds/' + g.id + '/channels', { name, type: 0, topic: topic || '', parent_id: parent ? parent.id : undefined });
    console.log('#' + name, 'created', parent ? 'in ' + parent.name : '');
  }
  if (post) {
    const msgs = await j('GET', '/channels/' + ch.id + '/messages?limit=3');
    if (!Array.isArray(msgs) || !msgs.length) { await j('POST', '/channels/' + ch.id + '/messages', { content: post }); console.log('opening post added'); }
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
