/* Boot the real server and re-grade real transcripts from the last run, in isolation.
   This is the decisive test: does the running code apply the echo guard and the
   contradiction pass to the same answers that got through last time? */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PORT = 4655;
const BASE = 'http://localhost:' + PORT;

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const cls = db.classes.find(c => c.code === process.argv[2]);
const ses = db.sessions.filter(s => s.classId === cls.id).pop();

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  const names = process.argv.slice(3);
  for (const name of names) {
    const rec = ses.students.filter(s => s.name === name).pop();
    const was = rec.verdict || {};
    const r = await fetch(BASE + '/api/verdict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: ses.topic, marks: ses.marks, questions: ses.questions, transcript: rec.transcript })
    });
    const v = (await r.json()).verdict || {};
    console.log('== ' + name + '  was: ' + was.level + ' ' + was.pointsHit + '/' + was.pointsTotal +
      '   now: ' + v.level + ' ' + v.pointsHit + '/' + v.pointsTotal + (v.cappedBy ? '  [capped: ' + v.cappedBy + ']' : ''));
    (v.evidence || []).forEach((e, i) => {
      console.log('   Q' + (i + 1) + ' ' + e.got + '/' + e.total + '   ' + e.points.map(p => (p.hit ? 'YES ' : 'no  ') + p.t.slice(0, 40)).join(' | '));
    });
  }
  srv.kill();
})();
