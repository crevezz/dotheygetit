const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 4599;
const APP = path.resolve(__dirname, '..');

const srv = spawn(process.execPath, ['server.js'], {
  cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', d => process.stdout.write('  [srv] ' + d));
srv.stderr.on('data', d => process.stderr.write('  [err] ' + d));

const get = (p, o) => new Promise((res, rej) => {
  const r = http.request({ host: 'localhost', port: PORT, path: p, method: (o && o.method) || 'GET', headers: (o && o.headers) || {} },
    x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: Buffer.concat(c) })); });
  r.on('error', rej); r.end();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 60; i++) { try { const h = await get('/api/health'); if (h.status === 200) break; } catch {} await sleep(250); }

  const checks = [
    ['GET', '/help', null],
    ['GET', '/help/', null],
    ['GET', '/', null],
    ['GET', '/help/01-create-account.mp4', { Range: 'bytes=0-1023' }],
    ['GET', '/help/all.mp4', { Range: 'bytes=1000-1999' }],
    ['GET', '/help/04-how-pupils-join.mp4', null],
    ['HEAD', '/help/all.mp4', null],
    ['GET', '/nope.mp4', null],
    ['GET', '/api/health', null]
  ];
  console.log('\n  method path                            status  type                 len      range');
  for (const [m, p, h] of checks) {
    const r = await get(p, { method: m, headers: h || {} });
    console.log('  ' + m.padEnd(7) + p.padEnd(34) + String(r.status).padEnd(8) +
      String(r.headers['content-type'] || '-').padEnd(21) +
      String(r.headers['content-length'] || '-').padEnd(9) + String(r.headers['content-range'] || '-'));
  }

  const help = await get('/help');
  const body = help.body.toString();
  console.log('\n  /help is ' + body.length + ' bytes, ' + (body.length > 3000 ? 'full page' : 'SUSPICIOUSLY SHORT') +
              ', videos referenced: ' + (body.match(/help\/[a-z0-9-]+\.mp4/g) || []).slice(0, 3).join(', '));

  /* every chapter file the page can ask for must exist */
  const fs = require('fs');
  const bad = [];
  for (const f of ['all.mp4'].concat(fs.readdirSync(path.join(APP, 'public', 'help')).filter(f => f !== 'all.mp4'))) {
    const r = await get('/help/' + f, { headers: { Range: 'bytes=0-99' } });
    if (r.status !== 206 || r.body.length !== 100) bad.push(f + ' -> ' + r.status + '/' + r.body.length);
  }
  console.log('  range test on all 8 files: ' + (bad.length ? 'FAIL ' + bad.join(', ') : 'all 206 + correct byte counts'));
  console.log('  header link: ' + (/href="\/help"/.test((await get('/')).body.toString()) ? 'present on the app' : 'MISSING'));

  srv.kill();
  spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})();
