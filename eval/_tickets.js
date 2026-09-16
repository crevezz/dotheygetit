/* #support as a ticket desk.
 *
 * Discord cannot convert a text channel into a forum (type is immutable), so: create the forum,
 * seed a "how to ask" post, point people at it, and retire the old text channel - but only if
 * it is empty apart from the bot's own post. Nothing else is touched.
 *
 * A forum needs NO bot running: every new request is automatically its own thread, so tickets
 * never mix. A hosted ticket bot would need to be online 24/7 for the same result.
 */
const fs = require('fs');
const TOKEN = (process.env.DISCORD_TOKEN || fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8')).trim();
const GUILD = '1549873926132211752';
const API = 'https://discord.com/api/v10';
const H = { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' };
const FORUM = 15, TEXT = 0;

async function j(m, u, b) {
  const r = await fetch(API + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) { const e = new Error(m + ' ' + u + ' -> ' + r.status + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 160)); e.status = r.status; throw e; }
  return d;
}

const HOWTO = [
  '**One request, one thread.** Post a new one for each thing and they will not get muddled up.',
  '',
  'Include, if you can:',
  '- the **class code** or check name',
  '- what you expected, and what you got',
  '- a screenshot (drag it straight in)',
  '',
  'Tag it and I will pick them up one at a time. Mark it answered when it is sorted.'
].join('\n');

(async () => {
  const chans = await j('GET', '/guilds/' + GUILD + '/channels');
  const cats = chans.filter(c => c.type === 4).map(c => c.name);
  const old = chans.find(c => c.type === TEXT && c.name === 'support');
  const help = chans.find(c => c.type === 4 && /help/i.test(c.name));
  console.log('categories:', cats.join(' | '));
  console.log('old #support:', old ? old.id : 'none', '| HELP category:', help ? help.id : 'NOT FOUND');

  let forum = chans.find(c => c.type === FORUM && /^support/.test(c.name));
  if (forum) console.log('forum already exists:', forum.id);
  else {
    const body = {
      name: 'support',
      type: FORUM,
      parent_id: help ? help.id : undefined,
      topic: 'Support desk - one request per post, so nothing gets muddled up. Open a post for a bug, a question, or an idea.',
      available_tags: [
        { name: 'bug', emoji_name: '\uD83D\uDC1B' },
        { name: 'question', emoji_name: '\u2753' },
        { name: 'idea', emoji_name: '\uD83D\uDCA1' },
        { name: 'answered', emoji_name: '\u2705' }
      ]
    };
    try { forum = await j('POST', '/guilds/' + GUILD + '/channels', body); }
    catch (e) {
      console.log('  tags rejected (' + e.status + '), retrying without them');
      delete body.available_tags;
      forum = await j('POST', '/guilds/' + GUILD + '/channels', body);
    }
    console.log('  ok   created forum #' + forum.name + '  ' + forum.id + '  tags: ' + (forum.available_tags || []).map(t => t.name).join(', '));
  }

  /* the pinned-ish starter post, itself a thread */
  const threads = await j('GET', '/channels/' + forum.id + '/threads?limit=50').catch(() => ({ threads: [] }));
  if (!(threads.threads || []).some(t => /how to ask/i.test(t.name))) {
    const th = await j('POST', '/channels/' + forum.id + '/threads', { name: 'How to ask for help', message: { content: HOWTO } });
    console.log('  ok   seeded thread "How to ask for help"  ' + (th.id || ''));
  } else console.log('  ·    how-to thread already there');

  /* retire the old text channel - only if it is effectively empty */
  if (old) {
    const msgs = await j('GET', '/channels/' + old.id + '/messages?limit=50').catch(() => []);
    const human = msgs.filter(m => !m.author.bot).length;
    console.log('old #support holds ' + msgs.length + ' message(s), ' + human + ' from people');
    if (msgs.length <= 2 && human === 0) {
      await j('DELETE', '/channels/' + old.id);
      console.log('  ok   deleted the empty old #support (nothing was lost)');
    } else {
      await j('PATCH', '/channels/' + old.id, { name: 'support-archive' });
      console.log('  ok   kept the history, renamed it #support-archive (safe to delete yourself once read)');
    }
  }

  const final = await j('GET', '/guilds/' + GUILD + '/channels');
  const READONLY = new Set(['welcome', 'how-to', 'updates']);
  console.log('\nchannels now:');
  for (const c of final.filter(c => c.type !== 4).sort((a, b) => (a.parent_id || '').localeCompare(b.parent_id || ''))) {
    const t = c.type === FORUM ? 'forum ' : c.type === TEXT ? 'text  ' : 'other ';
    console.log('  ' + t + '#' + c.name + (READONLY.has(c.name) ? '   (read-only for members)' : ''));
  }
})();
