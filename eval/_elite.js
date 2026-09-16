const fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/CREVE/.config/goose/discord.token', 'utf8').trim();
const SITE = 'https://app.dotheygetit.app';
const j = async (m, p, b, tries = 4) => {
  const r = await fetch('https://discord.com/api/v10' + p, {
    method: m, headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch {}
  if (r.status === 429 && tries > 0) {
    const wait = ((o && o.retry_after) || 1) * 1000 + 250;
    await new Promise(r => setTimeout(r, wait));
    return j(m, p, b, tries - 1);
  }
  if (!r.ok) throw new Error(m + ' ' + p + ' -> ' + r.status + ' ' + t.slice(0, 150));
  return o;
};

/* one line saying what you actually get out of each video */
const VIDS = {
  1: { t: 'What Get It? is', d: 'Why a right answer on paper can hide a gap.', s: '0:27' },
  2: { t: 'Create your account', d: 'Email and a password, and you are in.', s: '0:27' },
  3: { t: 'Set up your class', d: 'Paste your class list, get a code and a QR.', s: '0:35' },
  4: { t: 'Write the questions', d: 'Generate them, then edit, delete or add your own.', s: '0:40' },
  5: { t: 'How pupils join', d: 'Play this one on the whiteboard. 52 seconds, start to answering.', s: '0:52' },
  6: { t: 'Read your results', d: 'Green, amber, red - and the evidence under each one.', s: '0:38' },
  7: { t: 'Change a colour yourself', d: 'Overrule the marking in one click. It is remembered.', s: '0:26' },
  8: { t: 'Spot the pattern', d: 'See what the whole class missed, while you can still re-teach it.', s: '0:30' },
  9: { t: 'Your data, and theirs', d: 'What is kept, who sees it, how to delete it.', s: '0:43' },
};
const vidBody = n => n === 'all'
  ? '**All nine, in order**\nFive minutes seventeen, title cards included. Put it on at a staff meeting.\n' + SITE + '/help'
  : '**' + n + ' · ' + VIDS[n].t + '**\n' + VIDS[n].d + '  ·  ' + VIDS[n].s + '\n' + SITE + '/help#0' + n + '-' + VIDS[n].t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SUPPORT_ID = '1549893807187959919', IDEAS_ID = '1549894862424375336';

(async () => {
  const g = (await j('GET', '/users/@me/guilds')).find(x => x.name === 'Get It?');
  const chans = await j('GET', '/guilds/' + g.id + '/channels');
  const get = name => chans.find(c => c.name === name);
  const msgsOf = async id => { try { return await j('GET', '/channels/' + id + '/messages?limit=50'); } catch { return []; } };

  /* ---------- #how-to: give every video post a reason to be clicked ---------- */
  const howto = get('how-to');
  const hmsgs = await msgsOf(howto.id);
  let edited = 0;
  for (const m of hmsgs.reverse()) {
    if (!m.author.bot) continue;
    const num = (m.content.match(/^\*\*(\d)\./) || [])[1];
    if (num) { await j('PATCH', '/channels/' + howto.id + '/messages/' + m.id, { content: vidBody(num) }); edited++; continue; }
    if (/^\*\*All nine, in order\*\*/.test(m.content)) { await j('PATCH', '/channels/' + howto.id + '/messages/' + m.id, { content: vidBody('all') }); edited++; }
  }
  console.log('how-to: ' + edited + ' video posts rewritten');

  /* ---------- #teacher-chat: the line breaks were mangled ---------- */
  const tc = get('teacher-chat');
  for (const m of (await msgsOf(tc.id))) {
    if (m.author.bot && /^\*\*Teacher chat\*\*/.test(m.content)) {
      await j('PATCH', '/channels/' + tc.id + '/messages/' + m.id, {
        content: '**Teacher chat**\n\nThis one is for talking to each other, not to us.\n\nSwap what worked and what did not, the checks you wrote, the questions your class asked. If you wrote a good question, post it - someone else will use it tomorrow.\n\nBroken things go in <#' + SUPPORT_ID + '> so they do not get lost in the chat.',
      });
      console.log('teacher-chat: rewritten');
    }
  }

  /* ---------- #support + #lessons-and-ideas: say how the tagging works ---------- */
  const active = await j('GET', '/guilds/' + g.id + '/threads/active');
  for (const t of active.threads) {
    const one = (await msgsOf(t.id))[0];
    if (!one || !one.author.bot) continue;
    if (/^##?\*?\*?One request, one thread/.test(one.content)) {
      await j('PATCH', '/channels/' + t.id + '/messages/' + one.id, {
        content: '**One request, one post.** Open a new one for each thing, so they do not get muddled up.\n\nInclude what you can:\n• the **class code**, or the check name\n• what you expected, and what you got\n• a screenshot - drag it straight in\n\n**Tag it** `bug`, `question` or `idea`, then mark it `answered` when it is sorted. That keeps the board readable and stops anything being missed.',
      });
      console.log('support: how-to-post rewritten');
    }
    if (/^\*\*\s?One idea per post/.test(one.content)) {
      await j('PATCH', '/channels/' + t.id + '/messages/' + one.id, {
        content: '**One idea per post.**\n\nA lesson that worked, a twist on how you use Get It, something you tried that did not, or a resource worth sharing.\n\n**Tag it** so it can be found later: `lesson idea`, `what worked`, `resource`, `did not work`.\n\nNothing is too small. "I used it as a plenary and it took four minutes" is exactly the sort of thing that helps someone decide.\n\nThis is not the place for bugs - those go in <#' + SUPPORT_ID + '>.',
      });
      console.log('lessons-and-ideas: how-this-works rewritten');
    }
  }

  /* ---------- #updates: empty is not a good look ---------- */
  const up = get('updates');
  const umsgs = await msgsOf(up.id);
  if (!umsgs.length) {
    await j('POST', '/channels/' + up.id + '/messages', {
      content: '**This is where changes land**\n\nWhenever the app changes, it gets posted here: what changed, and what it means for you. Nothing else goes in this channel, so you can scroll it and see the whole history of the thing.\n\n**Today, first proper day of it**\n• Nine tutorial videos, five and a half minutes for the lot - <#1549874949731131423>\n• A support desk, one thread per request - <#' + SUPPORT_ID + '>\n• A board for lessons and ideas - <#' + IDEAS_ID + '>\n• Pupils who have already finished are greyed out on your board, and cannot answer twice\n• You can overrule any colour by hand - click green, amber or red under a pupil\'s name\n• A privacy page in plain English, linked at the foot of the site\n\nThe app: ' + SITE,
    });
    console.log('updates: first post written');
  } else console.log('updates: already has ' + umsgs.length);

  /* ---------- #general: an empty bot message, and no topic ---------- */
  const gen = get('general');
  let killed = 0;
  for (const m of await msgsOf(gen.id)) {
    if (m.author.bot && !String(m.content || '').trim()) { await j('DELETE', '/channels/' + gen.id + '/messages/' + m.id); killed++; }
  }
  if (killed) console.log('general: removed ' + killed + ' empty message(s)');
  if (!gen.topic) { await j('PATCH', '/channels/' + gen.id, { topic: 'Anything else. Say hello, say who you are, ask who else is using it.' }); console.log('general: topic set'); }

  console.log('\n== channels now ==');
  const after = await j('GET', '/guilds/' + g.id + '/channels');
  for (const c of after.filter(c => c.type !== 4).sort((a, b) => a.position - b.position)) {
    const n = c.type === 15 ? (await j('GET', '/guilds/' + g.id + '/threads/active').catch(() => ({ threads: [] }))).threads.filter(t => t.parent_id === c.id).length + ' posts' : (await msgsOf(c.id)).length + ' msgs';
    console.log('  ' + (c.type === 15 ? 'BOARD ' : '#' ) + c.name + '  (' + n + ')  ' + (c.topic || ''));
  }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
