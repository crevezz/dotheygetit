/* #lessons-and-ideas -> a forum, so ideas and "this worked" posts become searchable threads
 * instead of a scroll. Same constraint as #support: channel type is immutable, so create the
 * forum, seed it, then either delete the old channel (if effectively empty) or archive+lock it. */
const fs = require('fs');
const TOKEN = (process.env.DISCORD_TOKEN || fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8')).trim();
const GUILD = '1549873926132211752';
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };
const FORUM = 15, SEND = 2048, THREADS = 274877906944, VIEW = 1024;
const NAME = 'lessons-and-ideas';

async function j(m, u, b) {
  const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error(m + ' ' + u + ' -> ' + r.status + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 150));
  return d;
}

const SEED = [
  '**One idea per post.** A lesson that worked, a twist on how you use Get It, or something you tried that did not.',
  '',
  'Tag it so people can find it later. No such thing as too small - "I used it as a plenary and it took four minutes" is exactly the kind of thing that helps someone.',
  '',
  'This is not the place for bugs - those go in <#' + 'forum-placeholder' + '>.'
].join('\n');

(async () => {
  const chans = await j('GET', '/guilds/' + GUILD + '/channels');
  const old = chans.find(c => c.name === NAME && c.type === 0);
  const existing = chans.find(c => c.name === NAME && c.type === FORUM);
  const teachers = chans.find(c => c.type === 4 && /teacher/i.test(c.name));
  const support = chans.find(c => c.type === FORUM && c.name === 'support');
  const text = SEED.replace('forum-placeholder', support ? support.id : '');
  if (existing) { console.log('forum #' + NAME + ' already exists: ' + existing.id); return; }

  const body = {
    name: NAME,
    type: FORUM,
    parent_id: teachers ? teachers.id : (old && old.parent_id) || undefined,
    topic: 'Lessons that worked, ideas for using Get It, and things worth trying. One idea per post.',
    available_tags: [
      { name: 'lesson idea', emoji_name: '\uD83D\uDCA1' },
      { name: 'what worked', emoji_name: '\u2705' },
      { name: 'resource', emoji_name: '\uD83D\uDCCE' },
      { name: 'did not work', emoji_name: '\uD83D\uDE05' }
    ]
  };
  let forum;
  try { forum = await j('POST', '/guilds/' + GUILD + '/channels', body); }
  catch (e) { console.log('  tags rejected (' + e.status + '), retrying plain'); delete body.available_tags; forum = await j('POST', '/guilds/' + GUILD + '/channels', body); }
  console.log('  ok   created forum #' + forum.name + '  ' + forum.id + '  tags: ' + (forum.available_tags || []).map(t => t.name).join(', '));

  await j('POST', '/channels/' + forum.id + '/threads', { name: 'How this board works', message: { content: text } });
  console.log('  ok   seeded "How this board works"');

  if (!old) { console.log('(no old text channel to retire)'); return; }
  const msgs = await j('GET', '/channels/' + old.id + '/messages?limit=50').catch(() => []);
  const human = msgs.filter(m => !m.author.bot).length;
  console.log('old #' + NAME + ': ' + msgs.length + ' message(s), ' + human + ' from people');

  if (msgs.length <= 2 && human === 0) {
    await j('DELETE', '/channels/' + old.id);
    console.log('  ok   deleted the empty old channel');
  } else {
    /* carry the posts over so nothing is lost, then shut the old one */
    for (const m of msgs.slice().reverse()) {
      const who = m.author.global_name || m.author.username;
      const head = '**' + who + '** (from the old channel, ' + (m.timestamp || '').slice(0, 10) + '):\n';
      await j('POST', '/channels/' + forum.id + '/threads', { name: (m.content || 'post').replace(/\s+/g, ' ').slice(0, 90) || 'post', message: { content: head + (m.content || '(no text)') } });
    }
    console.log('  ok   carried ' + msgs.length + ' post(s) into the forum as threads');
    await j('PUT', '/channels/' + old.id + '/permissions/' + GUILD, { type: 0, deny: String(SEND + THREADS), allow: String(VIEW) });
    await j('PATCH', '/channels/' + old.id, { name: NAME + '-archive' });
    console.log('  ok   old channel locked + renamed #' + NAME + '-archive');
  }
})();
