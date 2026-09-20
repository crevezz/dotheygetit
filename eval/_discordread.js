/* Read what is actually live in the Discord server before changing anything.
   Prints the bot's own messages in #welcome and #how-to. */
const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };

async function j(method, path, body) {
  const r = await fetch('https://discord.com/api/v10' + path, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(method + ' ' + path + ' -> ' + r.status + ' ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

(async () => {
  const me = await j('GET', '/users/@me');
  const g = (await j('GET', '/users/@me/guilds')).find(x => x.name === 'Get It?') || (await j('GET', '/users/@me/guilds'))[0];
  console.log('bot: ' + me.username + '   guild: ' + g.name + ' (' + g.id + ')\n');

  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  console.log('channels: ' + chans.map(c => '#' + c.name + '(' + c.id + ')').join('  ') + '\n');

  for (const name of ['welcome', 'how-to']) {
    const c = chans.find(x => x.name === name);
    if (!c) { console.log('#' + name + ': NOT FOUND\n'); continue; }
    const msgs = await j('GET', '/channels/' + c.id + '/messages?limit=20');
    console.log('='.repeat(70));
    console.log('#' + name + ' - ' + msgs.length + ' recent message(s)');
    console.log('='.repeat(70));
    for (const m of msgs.reverse()) {
      const mine = m.author.id === me.id;
      console.log('\n--- id ' + m.id + (mine ? ' [BOT]' : ' [' + m.author.username + ']') + (m.pinned ? ' PINNED' : '') + ' ---');
      console.log(m.content || '(no text)');
      if (m.embeds && m.embeds.length) console.log('[embeds: ' + m.embeds.length + ']');
    }
    console.log('');
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
