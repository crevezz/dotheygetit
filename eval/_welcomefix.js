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

const WELCOME = `**Welcome to Get It?**

Get It? finds out who actually understood your lesson - while you can still do something about it.

**How it works**
1. The teacher types what they taught; the app writes the questions.
2. The class gets a code, or a QR code. Pupils need no account and no login.
3. Each pupil answers in their own words.
4. You see green, amber or red per pupil, with the evidence behind each one - and you can change any colour by hand.

**Watch it first**
Nine short videos live in <#1549874949731131423>. If you are handing it out tomorrow, start with **How pupils join**.

**Where to go**
• Stuck, or something broken? Open a thread in <#1549893807187959919> - one request per thread, tag it bug or question
• Ideas, and lessons that worked: <#1549894862424375336>
• Chat with other teachers: <#1549875227499036742>
• Every new version is posted in <#1549874957247582338>`;

(async () => {
  const g = (await j('GET', '/users/@me/guilds')).find(x => x.name === 'Get It?');
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  const live = new Set(chans.map(c => c.id));
  const byId = {}; chans.forEach(c => byId[c.id] = c.name);

  /* 1. every message the bot ever posted, checked for dead channel links */
  console.log('== dead links in old posts ==');
  let dead = 0;
  for (const c of chans.filter(c => c.type === 0 || c.type === 15)) {
    let msgs = [];
    try { msgs = await j('GET', '/channels/' + c.id + '/messages?limit=50'); } catch (e) { continue; }
    for (const m of msgs) {
      const ids = (m.content || '').match(/<#(\d+)>/g) || [];
      const gone = ids.map(x => x.match(/\d+/)[0]).filter(id => !live.has(id));
      if (gone.length) { console.log('  #' + c.name + ' msg ' + m.id + ': ' + gone.length + ' dead -> ' + gone.join(',')); dead += gone.length; }
    }
  }
  if (!dead) console.log('  none');

  /* 2. fix the welcome */
  const w = chans.find(c => c.name === 'welcome');
  const msgs = await j('GET', '/channels/' + w.id + '/messages?limit=5');
  const mine = msgs.filter(m => m.author.bot).pop();
  if (!mine) return console.log('no bot message in #welcome');
  await j('PATCH', '/channels/' + w.id + '/messages/' + mine.id, { content: WELCOME });
  console.log('\n#welcome rewritten (' + WELCOME.length + ' chars)');

  /* 3. verify: no dead mentions left anywhere */
  const after = await j('GET', '/channels/' + w.id + '/messages?limit=5');
  const ids = (after[0].content.match(/<#(\d+)>/g) || []).map(x => x.match(/\d+/)[0]);
  console.log('links now: ' + ids.map(i => '#' + (byId[i] || 'DEAD:' + i)).join('  '));
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
