// Build the Get It? Discord server. Bots cannot create a guild, so:
//   - if the bot is in no server yet, it prints the invite link to click
//   - if it is in exactly one, that is the server: create the channels, the welcome post
//     and a permanent invite link.
// Token is read from outside the repo and never printed.
const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };
const CLIENT_ID = '1549874049709113428';
const PERMS = 16 + 1024 + 2048 + 8192 + 16384 + 32768; // manage channels, view, send, manage msgs, embeds, files
const j = async (m, u, b) => {
  const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let o = null; try { o = JSON.parse(t); } catch { o = { raw: t }; }
  if (!r.ok) throw new Error(m + ' ' + u + ' -> ' + r.status + ' ' + (o.message || t).slice(0, 160));
  return o;
};

const PLAN = [
  { cat: 'START HERE', topic: 'Read this first.', chans: [
    ['welcome', 'What Get It? is, and how to get started.'],
    ['how-to', 'Making a check, sharing the code, reading the results.']
  ] },
  { cat: 'HELP', topic: 'Ask here when something is not working.', chans: [
    ['support', 'Stuck? Say what you typed and what happened.'],
    ['bug-reports', 'Class code, what you expected, what you got instead.']
  ] },
  { cat: 'TEACHERS', topic: 'For the people using it in a classroom.', chans: [
    ['lessons-and-ideas', 'What you taught, how the check went, what you would change.'],
    ['updates', 'What changed, and when.']
  ] }
];
const LOOSE = ['general'];

(async () => {
  const guilds = await j('GET', '/users/@me/guilds');
  if (!Array.isArray(guilds) || !guilds.length) {
    console.log('NOT IN A SERVER YET');
    console.log('1. In Discord: + -> Create My Own -> For me and my friends -> name it "Get It?"');
    console.log('2. Then open this link and pick that server:');
    console.log('   https://discord.com/oauth2/authorize?client_id=' + CLIENT_ID + '&scope=bot&permissions=' + PERMS);
    process.exit(0);
  }
  const g = guilds[0];
  console.log('SERVER:', g.name, '(' + g.id + ')');
  const existing = await j('GET', '/guilds/' + g.id + '/channels');
  const have = new Set(existing.map(c => c.name));
  const made = {};

  for (const block of PLAN) {
    let cat = existing.find(c => c.name.toLowerCase() === block.cat.toLowerCase() && c.type === 4);
    /* a category takes no topic - sending one is a 400 Invalid Form Body */ 
    if (!cat) cat = await j('POST', '/guilds/' + g.id + '/channels', { name: block.cat, type: 4 });
    made[block.cat] = cat;
    for (const [nm, tp] of block.chans) {
      if (have.has(nm)) { made[nm] = existing.find(c => c.name === nm); continue; }
      made[nm] = await j('POST', '/guilds/' + g.id + '/channels', { name: nm, type: 0, parent_id: cat.id, topic: tp });
    }
  }
  for (const nm of LOOSE) {
    if (have.has(nm)) { made[nm] = existing.find(c => c.name === nm); continue; }
    made[nm] = await j('POST', '/guilds/' + g.id + '/channels', { name: nm, type: 0 });
  }
  console.log('CHANNELS:', Object.keys(made).filter(k => k === k.toLowerCase()).map(k => '#' + k).join(' '));

  const wc = made['welcome'];
  if (wc) {
    const msgs = await j('GET', '/channels/' + wc.id + '/messages?limit=5');
    const already = Array.isArray(msgs) && msgs.some(m => m.author && m.author.id === CLIENT_ID);
    if (!already) {
      await j('POST', '/channels/' + wc.id + '/messages', { content: [
        '**Welcome to Get It?**',
        '',
        'Get It? finds out who actually understood your lesson — while you can still do something about it.',
        '',
        '**How it works**',
        '1. The teacher types what they taught; the app writes the questions.',
        '2. The class gets a code, or a QR code. Pupils need no account and no login.',
        '3. Each pupil answers in their own words.',
        '4. You see green, amber or red per pupil, with the evidence behind each one — and you can change any colour by hand.',
        '',
        '**Where to go**',
        '• Ask anything in <#' + (made['support'] || {}).id + '>',
        '• Something broken? <#' + (made['bug-reports'] || {}).id + '>',
        '• Lesson ideas in <#' + (made['lessons-and-ideas'] || {}).id + '>',
        '',
        'It is a teaching aid, not an assessment. The AI can be wrong, and your professional judgement is the one that counts.'
      ].join('\n') });
      console.log('WELCOME: posted');
    } else {
      console.log('WELCOME: already there');
    }
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
