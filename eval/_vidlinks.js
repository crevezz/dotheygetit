const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const SITE = 'https://app.dotheygetit.app';
const j = async (m, p, b, tries = 4) => {
  const r = await fetch('https://discord.com/api/v10' + p, {
    method: m, headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch {}
  if (r.status === 429 && tries > 0) { await new Promise(r => setTimeout(r, ((o && o.retry_after) || 1) * 1000 + 300)); return j(m, p, b, tries - 1); }
  if (!r.ok) throw new Error(m + ' ' + p + ' -> ' + r.status + ' ' + t.slice(0, 150));
  return o;
};
(async () => {
  const g = (await j('GET', '/users/@me/guilds')).find(x => x.name === 'Get It?');
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  const howto = chans.find(c => c.name === 'how-to');
  const msgs = await j('GET', '/channels/' + howto.id + '/messages?limit=20');
  /* the real chapter ids, taken from the site itself */
  const page = await (await fetch(SITE + '/help')).text();
  const ids = [...new Set((page.match(/0\d-[a-z-]+/g) || []))];
  console.log('chapter ids on the site: ' + ids.join(', '));
  const fixed = {};
  for (const m of msgs) {
    const num = (m.content.match(/^\*\*(\d) · /) || [])[1];
    if (!num) continue;
    const url = (m.content.match(/https:\/\/\S+/) || [])[0] || '';
    const slug = url.split('#')[1] || '';
    if (slug && !ids.includes(slug)) {
      const right = ids.find(x => x.startsWith('0' + num + '-'));
      if (right) { console.log('  post ' + num + ': ' + slug + ' -> ' + right); fixed[num] = right; }
    }
  }
  for (const m of msgs) {
    const num = (m.content.match(/^\*\*(\d) · /) || [])[1];
    if (!num || !fixed[num]) continue;
    const body = m.content.replace(/#0\d-[a-z-]+/, '#' + fixed[num]);
    await j('PATCH', '/channels/' + howto.id + '/messages/' + m.id, { content: body });
    console.log('  post ' + num + ' updated');
  }
  /* verify every link in the channel now resolves to a real chapter */
  const after = await j('GET', '/channels/' + howto.id + '/messages?limit=20');
  let badLinks = 0;
  after.forEach(m => {
    const u = (m.content.match(/https:\/\/\S+/g) || []);
    u.forEach(x => { const s = x.split('#')[1]; if (s && !ids.includes(s)) { console.log('  STILL DEAD: ' + x); badLinks++; } });
  });
  console.log(badLinks ? badLinks + ' dead links remain' : 'all video links resolve to a real chapter');
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
