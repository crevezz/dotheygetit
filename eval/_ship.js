/* Pre-ship check against the LIVE site. Follows the exact call sequence public/app.js uses,
 * teacher side then pupil side, then checks the teacher can see the result and change it.
 * Cleans up after itself (deletes the test class).
 *
 *   node eval/_ship.js
 */
const BASE = process.env.BASE || 'https://app.dotheygetit.app';

let cookie = '';
const out = [];
const ok = (n, d) => { out.push(['PASS', n, d || '']); console.log('  PASS  ' + n + (d ? '  ' + d : '')); };
const bad = (n, d) => { out.push(['FAIL', n, d || '']); console.log('  FAIL  ' + n + (d ? '  ' + d : '')); };

async function call(method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  if (cookie) h.Cookie = cookie;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, j, txt, ct: r.headers.get('content-type') || '' };
}
const get = p => call('GET', p);
const post = (p, b) => call('POST', p, b);

(async () => {
  const t0 = Date.now();
  const stamp = Date.now().toString(36).slice(-5);
  const email = 'shipcheck+' + stamp + '@example.com';
  let classId = null;

  console.log('\n== pages ==');
  for (const p of ['/', '/privacy', '/help']) {
    const r = await get(p);
    const need = p === '/' ? 'Join' : p === '/privacy' ? 'privacy' : 'how-pupils-join';
    r.status === 200 && r.txt.toLowerCase().includes(need.toLowerCase()) ? ok(p, '200') : bad(p, r.status + ' missing:' + need);
  }
  const vid = await get('/help/05-how-pupils-join.mp4');
  vid.ct.includes('video/mp4') ? ok('video serves', vid.ct) : bad('video serves', vid.status + ' ' + vid.ct);
  const home = await get('/');
  home.txt.includes('discord.gg/Vs9Dect2VK') ? ok('discord link in teachers tab') : bad('discord link missing');
  /Student|student/.test(home.txt) ? ok('pupil tab present') : bad('pupil tab missing');

  console.log('\n== health ==');
  const h = await get('/api/health');
  h.j && h.j.hasKey ? ok('/api/health', 'key set, model ' + h.j.model) : bad('/api/health', JSON.stringify(h.j));

  console.log('\n== teacher ==');
  const su = await post('/api/signup', { email, password: 'SmokeTest123!' });
  su.j && su.j.ok !== false && !su.j.error ? ok('signup') : (su.j && su.j.error ? bad('signup', su.j.error) : ok('signup', su.status));
  const me = await get('/api/me');
  me.j && me.j.teacher ? ok('session persists (/api/me)', me.j.teacher.email) : bad('/api/me', JSON.stringify(me.j));

  const cl = await post('/api/class', { name: 'ZZ SHIP CHECK ' + stamp });
  classId = cl.j && cl.j.class && cl.j.class.id;
  cl.j && cl.j.class && cl.j.class.code ? ok('create class', 'code ' + cl.j.class.code) : bad('create class', JSON.stringify(cl.j));
  const code = cl.j && cl.j.class && cl.j.class.code;

  const ro = await post('/api/roster', { classId, names: 'Ada\nBen\nCara' });
  ro.j && ro.j.roster && ro.j.roster.length === 3 ? ok('roster', ro.j.roster.join(',')) : bad('roster', JSON.stringify(ro.j).slice(0, 120));

  const qr = await get('/api/qr?code=' + code + '&size=320');
  qr.status === 200 && qr.ct.includes('image') ? ok('QR code', qr.ct) : bad('QR code', qr.status + ' ' + qr.ct);

  console.log('\n== questions (live AI) ==');
  const gen = await post('/api/generate', { topic: 'adding fractions with the same bottom number' });
  const questions = (gen.j && gen.j.questions) || [];
  const marks = (gen.j && gen.j.marks) || [];
  questions.length ? ok('generate', questions.length + ' questions, ' + marks.length + ' mark points') : bad('generate', JSON.stringify(gen.j).slice(0, 120));
  if (!questions.length) { console.log('cannot continue without questions'); return finish(t0, classId); }

  const ses = await post('/api/session', { classId, topic: 'adding fractions with the same bottom number', questions, marks });
  const sessionId = ses.j && ses.j.check && ses.j.check.id;
  sessionId ? ok('create check', sessionId) : bad('create check', JSON.stringify(ses.j).slice(0, 120));

  console.log('\n== pupil (as a real pupil would) ==');
  const j1 = await get('/api/join?code=' + code);
  j1.j && j1.j.names && j1.j.names.length === 3 ? ok('join: name list shows', j1.j.names.join(',')) : bad('join: name list', JSON.stringify(j1.j).slice(0, 120));
  const j2 = await get('/api/join?code=' + code + '&name=Ada');
  j2.j && j2.j.done === false ? ok('join: not already done', 'class ' + j2.j.className) : bad('join: done flag', JSON.stringify(j2.j).slice(0, 120));

  /* walk the chat exactly as app.js does */
  const history = [];
  let covered = 0, digs = 0, turns = 0, done = false;
  const ANSWERS = [
    'you keep the bottom the same and just add the tops',
    'like 2/5 plus 1/5 is 3/5 because the fifths stay fifths',
    'because the bottom is how big the pieces are, and they are the same size',
    'i would say yes you only add the top numbers',
    'if the bottoms were different you would have to make them the same first'
  ];
  while (!done && turns < 12) {
    const r = await post('/api/chat', { code, topic: 'adding fractions with the same bottom number', questions, history, covered, digs });
    if (!r.j || !r.j.reply) { bad('chat turn ' + (turns + 1), JSON.stringify(r.j).slice(0, 120)); break; }
    if (turns === 0) r.j.reply.includes('1/') || r.j.reply.length > 10 ? ok('chat: opening question asked') : bad('chat: opening');
    history.push({ role: 'assistant', content: r.j.reply });
    if (r.j.done) { done = true; break; }
    const a = ANSWERS[Math.min(turns, ANSWERS.length - 1)];
    history.push({ role: 'user', content: a });
    covered = r.j.covered; digs = r.j.digs;
    turns++;
  }
  done ? ok('chat: reached the end', turns + ' answers') : bad('chat: never finished', turns + ' turns');

  const transcript = history.map(x => (x.role === 'user' ? 'PUPIL: ' : 'EXAMINER: ') + x.content).join('\n');
  const ver = await post('/api/verdict', { topic: 'adding fractions with the same bottom number', transcript, code, questions, marks });
  const v = ver.j && ver.j.verdict;
  console.log('       verdict keys: ' + Object.keys(v || {}).join(', '));
  v && ['green', 'amber', 'red'].includes(v.level) ? ok('verdict', v.level + '  points=' + JSON.stringify(v.points) + '  evidence=' + JSON.stringify((v.evidence || []).length)) : bad('verdict', JSON.stringify(ver.j).slice(0, 200));

  const rr = await post('/api/result', { code, name: 'Ada', transcript, verdict: v });
  rr.j && rr.j.ok !== false ? ok('result saved') : bad('result saved', JSON.stringify(rr.j).slice(0, 120));

  console.log('\n== teacher sees it ==');
  const res = await get('/api/results?code=' + code);
  const lvOf = s => !s ? 'none' : (s.level || (s.verdict && s.verdict.level) || (s.results && s.results[0] && (s.results[0].level || (s.results[0].verdict && s.results[0].verdict.level))) || 'none');
  const ovOf = s => s && (s.override || (s.results && s.results[0] && s.results[0].override));
  const studs = (res.j && (res.j.students || res.j.results)) || [];
  console.log('       student keys: ' + Object.keys(studs[0] || {}).join(', '));
  studs.length ? ok('results list shows the pupil', studs.map(s => s.name + '=' + lvOf(s)).join(' ')) : bad('results list', JSON.stringify(res.j).slice(0, 200));

  const sview = await get('/api/session?id=' + sessionId);
  const sv = (sview.j && (sview.j.check || sview.j.session)) || sview.j;
  console.log('       check keys: ' + Object.keys(sv || {}).join(', '));
  sv && sv.students && sv.students.length ? ok('check view shows the pupil', sv.students.map(s => s.name).join(',')) : bad('check view', ('students: ' + JSON.stringify(sv && sv.students || null).slice(0, 200)));

  const ov = await post('/api/override', { sessionId, name: 'Ada', level: 'amber' });
  ov.j && ov.j.ok !== false ? ok('teacher can change a colour') : bad('override', JSON.stringify(ov.j).slice(0, 120));
  const sview2 = await get('/api/session?id=' + sessionId);
  const sv2 = (sview2.j && (sview2.j.check || sview2.j.session)) || sview2.j;
  const s2 = sv2 && sv2.students && sv2.students.find(s => s.name === 'Ada');
  ovOf(s2) ? ok('override persisted', String(ovOf(s2))) : bad('override persisted', String(JSON.stringify(s2)).slice(0, 200));

  const ex = await get('/api/export?classId=' + classId);
  ex.txt && ex.txt.includes('Ada') ? ok('CSV export has the pupil') : bad('CSV export', ex.status);
  ex.txt && /not a formal assessment|teaching aid|AI guidance/i.test(ex.txt) ? ok('CSV carries the disclaimer') : bad('CSV disclaimer missing');

  console.log('\n== pupil already finished ==');
  const j3 = await get('/api/join?code=' + code + '&name=Ada');
  j3.j && j3.j.done === true ? ok('finished pupil is told, cannot re-answer', JSON.stringify(j3.j).slice(0, 80)) : bad('finished-pupil gate', JSON.stringify(j3.j).slice(0, 120));

  console.log('\n== privacy / data ==');
  const del = await post('/api/session/delete', { id: sessionId });
  del.j && del.j.ok !== false ? ok('delete a check') : bad('delete check', JSON.stringify(del.j).slice(0, 120));

  await finish(t0, classId);
})();

async function finish(t0, classId) {
  /* clean up this run and any run that crashed before its cleanup */
  try {
    const cls = await get('/api/classes');
    for (const c of ((cls.j && cls.j.classes) || [])) {
      if (/^ZZ SHIP CHECK/.test(c.name || '')) {
        const r = await post('/api/class/delete', { classId: c.id });
        console.log('  cleanup: deleted ' + c.name + ' -> ' + (r.j && r.j.ok !== false ? 'ok' : 'failed'));
      }
    }
  } catch (e) { console.log('  cleanup failed: ' + e.message); }
  const fails = out.filter(x => x[0] === 'FAIL');
  console.log('\n----------------------------------------');
  console.log('  ' + (out.length - fails.length) + '/' + out.length + ' checks passed in ' + Math.round((Date.now() - t0) / 1000) + 's');
  if (fails.length) { console.log('  PROBLEMS:'); fails.forEach(f => console.log('   - ' + f[1] + '  ' + f[2])); }
  else console.log('  no problems found');
  console.log('----------------------------------------\n');
  process.exit(fails.length ? 1 : 0);
}
