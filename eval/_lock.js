// Lock the read-only channels: everyone can read, only you (and the bot) can post.
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
const VIEW = 1024, SEND = 2048, THREADS = 274877906944, MANAGE_MSGS = 8192, ADD_REACTIONS = 64;

const READ_ONLY = ['welcome', 'how-to', 'updates'];
const OPEN = ['support', 'bug-reports', 'teacher-chat', 'lessons-and-ideas', 'general'];

(async () => {
  const g = (await j('GET', '/users/@me/guilds'))[0];
  const full = await j('GET', '/guilds/' + g.id + '?with_counts=true');
  const everyone = full.roles.find(r => r.name === '@everyone');
  const ownerId = full.owner_id;
  const chans = await j('GET', '/guilds/' + g.id + '/channels');

  for (const c of chans.filter(c => c.type === 0)) {
    if (READ_ONLY.includes(c.name)) {
      await j('PUT', '/channels/' + c.id + '/permissions/' + everyone.id, {
        type: 0, allow: String(VIEW), deny: String(SEND + THREADS)
      });
      await j('PUT', '/channels/' + c.id + '/permissions/' + ownerId, {
        type: 1, allow: String(VIEW + SEND + MANAGE_MSGS + ADD_REACTIONS)
      });
      console.log('#' + c.name, '-> read only');
    } else if (OPEN.includes(c.name)) {
      // clear anything left over from an earlier pass
      try { await j('DELETE', '/channels/' + c.id + '/permissions/' + everyone.id); } catch {}
      console.log('#' + c.name, '-> open for everyone');
    }
  }

  const readOnly = chans.filter(c => READ_ONLY.includes(c.name)).map(c => '#' + c.name).join(' ');
  const rest = chans.filter(c => OPEN.includes(c.name)).map(c => '#' + c.name).join(' ');
  console.log('\nread only (you post):', readOnly);
  console.log('open (anyone posts):', rest);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
