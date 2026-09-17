const { spawn } = require('child_process');
const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const CHAN = '1550051810599764018';
const P = 4701;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(P), DISCORD_TOKEN: TOKEN, FEEDBACK_CHANNEL: CHAN }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(2500);
  const r = await fetch(`http://localhost:${P}/api/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Test from the build: does this land in Discord with the page and browser attached?', page: '/test-run', ua: 'test-harness/1.0' }),
  });
  console.log('endpoint said: ' + r.status + ' ' + (await r.text()));
  await wait(2500);
  const msgs = await (await fetch(`https://discord.com/api/v10/channels/${CHAN}/messages?limit=3`, { headers: { Authorization: 'Bot ' + TOKEN } })).json();
  const m = msgs.find(x => x.embeds && x.embeds.length);
  console.log(m ? 'landed in #feedback:\n  ' + m.embeds[0].title + '\n  ' + m.embeds[0].description.slice(0, 80) + '\n  ' + m.embeds[0].fields.map(f => f.name + '=' + f.value).join(' | ') : 'NOTHING ARRIVED');
  srv.kill();
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message); srv.kill(); process.exit(1); });
