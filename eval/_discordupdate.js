/* Bring Discord up to date with the fourteen-chapter set.

   #how-to still had the old nine: wrong order, wrong copy ("paste your class
   list" - there is no class list), and three chapters missing entirely.
   This wipes the bot's own messages there and reposts the real fourteen in
   watch order, straight out of public/help/index.json so it cannot drift.

   Also prints #START HERE so we can see whether that is stale too. It is NOT
   touched - the invite code may live there. */
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };
const BASE = 'https://app.dotheygetit.app/help';
const INDEX = path.join(__dirname, '..', 'public', 'help', 'index.json');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function j(method, p, body) {
  const r = await fetch('https://discord.com/api/v10' + p, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 429) {
    const w = (await r.json()).retry_after || 1;
    await sleep(w * 1000 + 250);
    return j(method, p, body);
  }
  const t = await r.text();
  if (!r.ok) throw new Error(method + ' ' + p + ' -> ' + r.status + ' ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

const WELCOME = `**Welcome to Get It?**

Get It? finds out who actually understood your lesson - while you can still do something about it.

**How it works**
1. The teacher types what they taught; the app writes the questions.
2. The class gets a code, or a QR code. Pupils need no account and no login.
3. Each pupil answers in their own words.
4. You see green, amber or red per pupil, with the evidence behind each one - and you can change any colour by hand.

**Watch it first**
Fourteen short videos live in <#1549874949731131423> - about seven minutes all in. If you are handing it out tomorrow, start with **How pupils join**.

**Where to go**
• Stuck, or something broken? Open a thread in <#1549893807187959919> - one request per thread, tag it bug or question
• Ideas, and lessons that worked: <#1549894862424375336>
• Chat with other teachers: <#1549875227499036742>
• Every new version is posted in <#1549874957247582338>`;

(async () => {
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const chapters = index.chapters;                       // already in watch order
  const me = await j('GET', '/users/@me');
  const guilds = await j('GET', '/users/@me/guilds');
  const g = guilds.find(x => x.name === 'Get It?') || guilds[0];
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  const how = chans.find(c => c.name === 'how-to');
  const wel = chans.find(c => c.name === 'welcome');
  const start = chans.find(c => c.name.toUpperCase() === 'START HERE');

  console.log('guild: ' + g.name + '   chapters: ' + chapters.length + '\n');

  // ---- 1. clear out the old how-to -----------------------------------------
  const old = await j('GET', '/channels/' + how.id + '/messages?limit=100');
  const mine = old.filter(m => m.author.id === me.id);
  console.log('clearing ' + mine.length + ' old message(s) in #how-to');
  for (const m of mine) { await j('DELETE', '/channels/' + how.id + '/messages/' + m.id); await sleep(200); }

  // ---- 2. post the fourteen -----------------------------------------------
  const total = chapters.reduce((n, c) => n + c.len, 0);
  const head = await j('POST', '/channels/' + how.id + '/messages', {
    content: [
      '**The fourteen chapters**',
      'Short, in order, and none of them waffle. ' + mmss(total) + ' for the lot.',
      BASE,
      '',
      'Rather watch on your phone? Every chapter has a phone version on the same page.',
    ].join('\n'),
  });
  await j('PUT', '/channels/' + how.id + '/pins/' + head.id).catch(e => console.log('pin skipped: ' + e.message));
  await sleep(400);

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    await j('POST', '/channels/' + how.id + '/messages', {
      content: '**' + (i + 1) + ' · ' + c.title + '**\n' + c.sub + '  ·  ' + mmss(c.len) + '\n' + BASE + '#' + c.id,
    });
    await sleep(450);
  }

  await j('POST', '/channels/' + how.id + '/messages', {
    content: '**All fourteen, in order**\n' + mmss(total) + ', title cards included. Put it on at a staff meeting.\n' + BASE,
  });
  console.log('posted 1 header + ' + chapters.length + ' chapters + 1 summary, header pinned\n');

  // ---- 3. welcome: nine -> fourteen ---------------------------------------
  const wmsgs = await j('GET', '/channels/' + wel.id + '/messages?limit=50');
  const wmine = wmsgs.filter(m => m.author.id === me.id);
  if (!wmine.length) console.log('#welcome: no bot message to update');
  else {
    await j('PATCH', '/channels/' + wel.id + '/messages/' + wmine[0].id, { content: WELCOME });
    console.log('#welcome rewritten');
  }

  // ---- 4. what does START HERE say? (read only) ---------------------------
  if (!start) console.log('\n#START HERE: not found');
  else {
    const smsgs = await j('GET', '/channels/' + start.id + '/messages?limit=10');
    console.log('\n' + '='.repeat(70) + '\n#START HERE (' + smsgs.length + ' message(s)) - NOT touched\n' + '='.repeat(70));
    for (const m of smsgs.reverse()) console.log('\n[' + m.author.username + ']\n' + (m.content || '(no text)'));
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
