/* Discord branding from the ONE logo we already have: brand/out/android-chrome-512.png
 * (the gradient squircle + white tick produced by brand/make.js).
 *
 *   server icon  -> PATCH /guilds/{id}   needs MANAGE GUILD
 *   bot avatar   -> PATCH /users/@me     always allowed
 */
const fs = require('fs');
const path = require('path');
const TOKEN = (process.env.DISCORD_TOKEN || fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8')).trim();
const GUILD = '1549873926132211752';
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };

const img = path.join(__dirname, '..', 'brand', 'out', 'android-chrome-512.png');
if (!fs.existsSync(img)) { console.error('no logo png - run: node brand/make.js'); process.exit(1); }
const data = 'data:image/png;base64,' + fs.readFileSync(img).toString('base64');
console.log('logo: android-chrome-512.png  ' + Math.round(fs.statSync(img).size / 1024) + ' KB');

async function j(m, u, b) {
  const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error(m + ' ' + u + ' -> ' + r.status + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 150));
  return d;
}

(async () => {
  const me = await j('GET', '/users/@me');
  const guild = await j('GET', '/guilds/' + GUILD);

  const perms = BigInt(guild.permissions || 0);            // the bot's own guild permissions
  const MANAGEGUILD = 32n;
  console.log('bot ' + me.username + ' | guild "' + guild.name + '" | Manage Server: ' + ((perms & MANAGEGUILD) ? 'yes' : 'no'));

  try {
    await j('PATCH', '/guilds/' + GUILD, { icon: data });
    console.log('  ok   SERVER ICON updated');
  } catch (e) {
    console.log('  FAIL server icon -> ' + e.message);
    console.log('       fix: re-authorise the bot with Manage Server, or set it by hand');
    console.log('       (Server Settings -> Overview -> icon).');
  }

  try {
    await j('PATCH', '/users/@me', { avatar: data });
    console.log('  ok   BOT AVATAR updated (shows next to every message it posts)');
  } catch (e) {
    console.log('  FAIL bot avatar -> ' + e.message);
  }
})();
