/* Quick check that the mark points come back as clean stand-alone lines - they are
   printed on the teacher's card, so "pupil explains that..." and a comma-joined bundle
   both show up as sloppy text on a teacher's screen. */
const path = require('path');
const { spawn } = require('child_process');
const PORT = 4613, BASE = 'http://localhost:' + PORT, ROOT = path.join(__dirname, '..');
async function post(p, body, cookie) {
  const r = await fetch(BASE + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}), body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { body: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  process.on('exit', () => srv.kill());
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 250)); try { await fetch(BASE + '/api/health'); break; } catch {} }
  const t = (await post('/api/signup', { email: 'mk' + Date.now() + '@test.com', password: 'hunter22' })).cookie;
  let bad = 0, n = 0;
  for (const topic of ['Comparing fractions', 'Photosynthesis: how a plant makes its food', 'The water cycle', 'Macbeth: Lady Macbeth persuading her husband']) {
    const j = (await post('/api/generate', { topic, count: 3 }, t)).body;
    (j.marks || []).forEach(list => list.forEach(m => {
      n++;
      const flags = [];
      if (/^(the\s+)?pupil\b/i.test(m)) flags.push('starts with "pupil"');
      if (/,/.test(m)) flags.push('comma inside a point');
      if (m.length < 12) flags.push('too short');
      if (m.length > 110) flags.push('too long');
      if (flags.length) { bad++; console.log('  look  : ' + JSON.stringify(m) + '  <- ' + flags.join(', ')); }
      else console.log('  ok      ' + m);
    }));
  }
  console.log('\n' + (n - bad) + ' of ' + n + ' mark points are single clean lines. The ones above flagged' +
    ' "comma inside a point" are worth an eye: a comma in prose is fine, a list inside one point is not -' +
    ' a point with a list in it cannot be half-hit, so it stops telling a teacher anything.');
  srv.kill();
})();

