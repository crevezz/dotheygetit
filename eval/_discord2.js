// Permanent invite + the how-to post, so there is something useful in the server
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
  const guilds = await j('GET', '/users/@me/guilds');
  const g = guilds[0];
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  const get = n => chans.find(c => c.name === n);

  const inv = await j('POST', '/channels/' + get('general').id + '/invites', { max_age: 0, max_uses: 0, unique: true });
  console.log('INVITE: https://discord.gg/' + inv.code);

  const how = get('how-to');
  const msgs = await j('GET', '/channels/' + how.id + '/messages?limit=5');
  if (!Array.isArray(msgs) || !msgs.length) {
    const m = await j('POST', '/channels/' + how.id + '/messages', { content: [
      '**How to run a check**',
      '',
      '**1. Say what you taught**',
      'Type it as you would say it out loud: "adding fractions with the same bottom number", "level 1 spelling". The questions are written from that.',
      '',
      '**2. Read the questions before you use them**',
      'You can edit any of them, delete one, or add your own. The questions are the check — get them right first.',
      '',
      '**3. Give the class the code**',
      'Pupils go to the site, type the code, and pick their name. No accounts. Show the QR code if they are on tablets.',
      '',
      '**4. Watch the board**',
      'Cards come in green, amber or red with the evidence under each one — the mark point, and the pupil\'s own words next to it. Click a name to fold a card down.',
      '',
      '**5. Change anything you disagree with**',
      'Click green, amber or red under a pupil to override the AI. It remembers your choice and shows your colour, with the AI\'s beside it.',
      '',
      '**Reading the colours**',
      '• **Green** — showed something on every question, and one of them in full.',
      '• **Amber** — answered some of it, gaps are clear.',
      '• **Red** — barely anything to go on.',
      '',
      'Export the whole class as CSV from the results view when you want it in your records.'
    ].join('\n') });
    try { await j('PUT', '/channels/' + how.id + '/pins/' + m.id); } catch (e) { console.log('pin skipped:', e.message); }
    console.log('HOW-TO: posted and pinned');
  } else {
    console.log('HOW-TO: already has messages');
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
