const { spawn } = require('child_process');
const path = require('path');
const PORT = 4679;
const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/verdict`); break; } catch { await wait(300); } }
  const post = async (topic, marks, questions, transcript) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/verdict`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic, marks, questions, transcript }) });
    return JSON.parse(await r.text());
  };
  const a = await post('the 2 times table', [['explains the order does not matter', 'says 2 groups of 5 is the same as 5 groups of 2']], ['Explain why 2 x 5 is the same as 5 x 2.'],
    'Examiner: Explain why 2 x 5 is the same as 5 x 2.\nStudent: the order does not matter in timesing');
  console.log('HARD:', JSON.stringify(a).slice(0, 900));
  const c = await post('adding fractions with the same bottom number', [['says 3/4', 'adds the top numbers']], ['What is 1/4 + 2/4?'], 'Examiner: What is 1/4 + 2/4?\nStudent: 3/8');console.log('WRONGFRAC:', JSON.stringify(c.verdict.evidence));const b = await post('adding fractions with the same bottom number', [['says 3/4', 'adds the top numbers']], ['What is 1/4 + 2/4?'],
    'Examiner: What is 1/4 + 2/4?\nStudent: three quarters');
  console.log('WORDFRAC:', JSON.stringify(b).slice(0, 900));
  srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
