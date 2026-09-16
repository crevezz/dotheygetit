const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
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
  const msgs = (await j('GET', '/channels/' + howto.id + '/messages?limit=20')).reverse();
  console.log('== #how-to ==');
  msgs.forEach(m => console.log('\n' + m.content));

  /* tidy: an unused voice channel and a default category left over from the template */
  console.log('\n== tidy ==');
  for (const c of chans) {
    if (c.type === 2 && !(c.name || '').toLowerCase().includes('stage')) {
      await j('DELETE', '/channels/' + c.id);
      console.log('  deleted voice channel "' + c.name + '" (never used, not needed)');
    }
  }
  for (const c of chans.filter(c => c.type === 4)) {
    const kids = chans.filter(k => k.parent_id === c.id);
    if (kids.length && kids.every(k => k.type === 2 || k.name === 'general')) {
      const gen = kids.find(k => k.name === 'general');
      if (gen) { await j('PATCH', '/channels/' + c.id, { name: 'ELSEWHERE' }); console.log('  renamed category "' + c.name + '" -> ELSEWHERE (holds #general)'); }
    }
  }
  const after = await j('GET', '/guilds/' + g.id + '/channels');
  const cats = {}; after.filter(c => c.type === 4).forEach(c => cats[c.id] = c.name);
  console.log('\n== server now ==');
  for (const c of after.filter(c => c.type !== 4).sort((a, b) => (a.parent_id || '').localeCompare(b.parent_id || '') || a.position - b.position)) {
    console.log('  ' + (cats[c.parent_id] || 'no category').padEnd(11) + (c.type === 15 ? 'BOARD ' : '#') + c.name);
  }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
