const { spawn } = require('child_process');
const P = 4699, CODE = 'test-code-123';
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(P), SIGNUP_CODE: CODE }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(2500);
  const t = async (label, body) => {
    const r = await fetch(`http://localhost:${P}/api/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    console.log(label.padEnd(28) + r.status + '  ' + (j.error || (j.teacher ? 'created ' + j.teacher.email : JSON.stringify(j).slice(0, 60))));
  };
  const g = await (await fetch(`http://localhost:${P}/api/gate`)).json();
  console.log('gate says'.padEnd(28) + JSON.stringify(g));
  await t('no code', { email: 'gate1@example.com', password: 'secret123' });
  await t('wrong code', { email: 'gate2@example.com', password: 'secret123', invite: 'nope' });
  await t('right code', { email: 'gate3@example.com', password: 'secret123', invite: CODE });
  await t('right code (again)', { email: 'gate3@example.com', password: 'secret123', invite: CODE });
  srv.kill();
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message); srv.kill(); process.exit(1); });
