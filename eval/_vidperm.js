/* #how-to is read-only for members, which also blocks the bot. Give the BOT its own overwrite
 * (send + files + embeds), so the channel stays locked for everyone else. */
const fs = require('fs');
const TOKEN = (process.env.DISCORD_TOKEN || fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8')).trim();
const GUILD = '1549873926132211752';
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };

const VIEW = 1024, SEND = 2048, EMBED = 16384, ATTACH = 32768, MANAGE_MSGS = 8192, ADD_REACTIONS = 64;

(async () => {
  const j = async (m, u, b) => {
    const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
    const t = await r.text();
    if (!r.ok) throw new Error(m + ' ' + u + ' -> ' + r.status + ' ' + t.slice(0, 160));
    return t ? JSON.parse(t) : null;
  };
  const me = await j('GET', '/users/@me');
  const chans = await j('GET', '/guilds/' + GUILD + '/channels');
  const allow = VIEW | SEND | EMBED | ATTACH | MANAGE_MSGS | ADD_REACTIONS;
  for (const name of ['how-to', 'welcome', 'updates']) {
    const c = chans.find(x => x.name === name);
    if (!c) { console.log(name + ': not found'); continue; }
    try {
      await j('PUT', '/channels/' + c.id + '/permissions/' + me.id, { type: 1, allow: String(allow), deny: '0' });
      const perms = await j('GET', '/channels/' + c.id + '/permissions/' + me.id);
      console.log('  ok   #' + name + ' -> bot allow ' + perms.allow + ' (send ' + (BigInt(perms.allow) & 2048n ? 'yes' : 'NO') + ', attach ' + (BigInt(perms.allow) & 32768n ? 'yes' : 'NO') + ')');
    } catch (e) { console.log('  FAIL #' + name + ' -> ' + e.message); }
  }
})();
