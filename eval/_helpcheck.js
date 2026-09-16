/* Boot the real server on a spare port and prove /help and every video actually serve. */
const { spawn } = require('child_process');
const path = require('path');
const PORT = 4697;
const HERE = path.join(__dirname, '..');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: HERE, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  srv.stdout.on('data', d => log += d);
  srv.stderr.on('data', d => log += d);
  const base = 'http://localhost:' + PORT;
  const kill = () => { try { spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { try { const r = await fetch(base + '/'); up = r.ok; } catch { await sleep(250); } }
    if (!up) { console.error('server did not come up\n' + log.slice(-500)); process.exit(1); }

    const help = await fetch(base + '/help');
    const html = await help.text();
    console.log('/help          ', help.status, html.length + ' bytes');
    const ids = ['01-what-get-it-is','02-create-your-account','03-set-up-your-class','04-write-the-questions',
                 '05-how-pupils-join','06-read-your-results','07-change-a-colour','08-spot-the-pattern','09-your-data'];
    console.log('  index lists    ', ids.filter(i => html.includes(i)).length + '/9 chapters');
    console.log('  old ids gone   ', ids.some(i => html.includes('07-why-i-built-this')) ? 'NO - stale id still there' : 'yes');

    let bad = 0;
    for (const id of ids.concat(['all'])) {
      const r = await fetch(base + '/help/' + id + '.mp4', { headers: { Range: 'bytes=0-1023' } });
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      const ok = (r.status === 200 || r.status === 206) && buf.length > 500 && /video\/mp4/.test(ct);
      if (!ok) bad++;
      console.log('  ' + id.padEnd(24), r.status, ct, buf.length + 'b', ok ? 'ok' : 'BAD');
    }
    const priv = await fetch(base + '/privacy');
    console.log('/privacy       ', priv.status, (await priv.text()).length + ' bytes');
    console.log(bad ? '\n' + bad + ' VIDEO(S) FAILED' : '\nAll 10 videos serve.');
  } finally { kill(); }
})();
