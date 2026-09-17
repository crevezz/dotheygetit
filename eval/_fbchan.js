const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const BOT = '1549874049709113428';
const GUILD = '1549873926132211752';
const VIEW = 1024, SEND = 2048, EMBED = 16384, ATTACH = 32768;
const j = async (m, p, b) => {
  const r = await fetch('https://discord.com/api/v10' + p, {
    method: m, headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(m + ' ' + p + ' -> ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
};
(async () => {
  const chans = await j('GET', `/guilds/${GUILD}/channels`);
  const cat = chans.find(c => c.type === 4 && /ELSEWHERE/i.test(c.name));
  let ch = chans.find(c => c.name === 'feedback');
  if (!ch) {
    ch = await j('POST', `/guilds/${GUILD}/channels`, {
      name: 'feedback',
      type: 0,
      parent_id: cat ? cat.id : undefined,
      topic: 'In-app feedback lands here. Private - only the owner can see it.',
      permission_overwrites: [
        { id: GUILD, type: 0, deny: String(VIEW), allow: '0' },
        { id: BOT, type: 1, allow: String(VIEW + SEND + EMBED + ATTACH), deny: '0' },
      ],
    });
    console.log('created #feedback ' + ch.id);
  } else console.log('#feedback already there ' + ch.id);
  await j('POST', `/channels/${ch.id}/messages`, {
    content: '**Feedback channel** — private. Anything sent from the "Something broken?" box in the app lands here, with the page and browser already attached.\nNothing else gets posted here.',
  });
  console.log('FEEDBACK_CHANNEL=' + ch.id);
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
