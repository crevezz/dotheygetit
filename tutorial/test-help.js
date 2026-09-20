const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 4599;
const APP = path.resolve(__dirname, '..');
const HELP = path.join(APP, 'public', 'help');

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

  /* both published sets, read from their own manifests */
  const sets = [
    { name: 'laptop', base: '/help/', dir: HELP, index: path.join(HELP, 'index.json') },
    { name: 'phone', base: '/help/mobile/', dir: path.join(HELP, 'mobile'), index: path.join(HELP, 'mobile', 'index.json') }
  ].map(s => {
    let man = null;
    try { man = JSON.parse(fs.readFileSync(s.index, 'utf8')); } catch {}
    return Object.assign(s, { man });
  });

  const checks = [
    ['GET', '/help', null],
    ['GET', '/help/', null],
    ['GET', '/', null],
    ['GET', '/help/01-what-get-it-is.mp4', { Range: 'bytes=0-1023' }],
    ['GET', '/help/all.mp4', { Range: 'bytes=1000-1999' }],
    ['GET', '/help/05-how-pupils-join.mp4', null],
    ['GET', '/help/mobile/01-what-get-it-is.mp4', { Range: 'bytes=0-1023' }],
    ['GET', '/help/mobile/all.mp4', { Range: 'bytes=0-1023' }],
    ['HEAD', '/help/all.mp4', null],
    ['GET', '/nope.mp4', null],
    ['GET', '/api/health', null]
  ];
  console.log('\n  method path                                     status  type                 len      range');
  for (const [m, p, h] of checks) {
    const r = await get(p, { method: m, headers: h || {} });
    console.log('  ' + m.padEnd(7) + p.padEnd(44) + String(r.status).padEnd(8) +
      String(r.headers['content-type'] || '-').padEnd(21) +
      String(r.headers['content-length'] || '-').padEnd(9) + String(r.headers['content-range'] || '-'));
  }

  const help = await get('/help');
  const body = help.body.toString();
  console.log('\n  /help is ' + body.length + ' bytes, ' + (body.length > 3000 ? 'full page' : 'SUSPICIOUSLY SHORT'));

  /* the page must list every chapter of both sets, and offer the phone toggle */
  for (const s of sets) {
    const ids = s.man ? s.man.chapters.map(c => c.id) : [];
    const missing = ids.filter(id => !body.includes("'" + id + "'"));
    console.log('  /help lists all ' + ids.length + ' ' + s.name + ' chapters: ' +
      (ids.length && !missing.length ? 'yes' : 'NO -> missing ' + JSON.stringify(missing)));
  }
  console.log('  phone toggle present: ' + (/data-dev="phone"/.test(body) ? 'yes' : 'NO'));
  console.log('  copy says fourteen: ' + (/fourteen/i.test(body) ? 'yes' : 'NO'));

  /* every chapter file both pages can ask for must serve a correct partial read */
  let n = 0;
  const bad = [];
  for (const s of sets) {
    const files = ['all.mp4'].concat(s.man ? s.man.chapters.map(c => c.file) : []);
    for (const f of files) {
      n++;
      const r = await get(s.base + f, { headers: { Range: 'bytes=0-99' } });
      if (r.status !== 206 || r.body.length !== 100) bad.push(s.base + f + ' -> ' + r.status + '/' + r.body.length);
    }
  }
  console.log('  range test on all ' + n + ' files: ' + (bad.length ? 'FAIL ' + bad.join(', ') : 'all 206 + correct byte counts'));
  console.log('  header link: ' + (/href="\/help"/.test((await get('/')).body.toString()) ? 'present on the app' : 'MISSING'));

  srv.kill();
  spawn('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})();
