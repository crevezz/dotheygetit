/* ============================================================================
   Test the class QR code.
   Boots the real server, asks for a QR, then DECODES it and checks it points at
   the right join link. "Looks like a QR" is not good enough - a teacher will
   print this and stick it on a wall.
       node test-qr.js
   ========================================================================== */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const PORT = 4601;
const BASE = 'http://127.0.0.1:' + PORT;
const CODE = 'k7pm2q';
const EXPECT = 'https://app.dotheygetit.app/?join=' + CODE;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const r = await fetch(BASE + '/api/health'); up = r.ok; } catch { await sleep(250); }
  }
  if (!up) { console.log('  server did not start'); srv.kill(); process.exit(1); }

  /* ---- 1. the QR itself ---- */
  const r = await fetch(BASE + '/api/qr?code=' + CODE + '&size=640');
  ok('GET /api/qr -> 200', r.status === 200, 'got ' + r.status);
  ok('content-type is image/png', r.headers.get('content-type') === 'image/png', r.headers.get('content-type'));

  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(path.join(__dirname, 'out', 'qr-test.png'), buf);
  const png = PNG.sync.read(buf);
  ok('image is 640px wide', png.width === 640, 'got ' + png.width);

  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  ok('QR decodes', !!found, 'no QR found in the image');
  if (found) {
    console.log('        decodes to: ' + found.data);
    ok('decodes to the join link', found.data === EXPECT, 'got ' + found.data);
  }

  /* ---- 2. it must also work small (the on-screen one) ---- */
  const small = await fetch(BASE + '/api/qr?code=' + CODE);
  const sp = PNG.sync.read(Buffer.from(await small.arrayBuffer()));
  const sf = jsQR(new Uint8ClampedArray(sp.data), sp.width, sp.height);
  ok('default size still decodes', !!sf && sf.data === EXPECT, sf ? sf.data : 'no QR');

  /* ---- 3. rubbish in, rubbish rejected ---- */
  const bad = await fetch(BASE + '/api/qr?code=NOT%20A%20CODE');
  ok('bad code -> 400', bad.status === 400, 'got ' + bad.status);
  const none = await fetch(BASE + '/api/qr');
  ok('missing code -> 400', none.status === 400, 'got ' + none.status);

  /* ---- 4. the button and the panel are wired into the page ---- */
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  ok('QR button on the class panel', /id="btnQr"/.test(html));
  ok('QR panel markup present', /id="qrWrap"/.test(html) && /id="qrImg"/.test(html));
  ok('print stylesheet present', /@media print/.test(css));
  ok('app.js opens the panel', /function showQr\(/.test(js) && /\/api\/qr\?code=/.test(js));
  ok('escape closes the panel', /Escape/.test(js));

  srv.kill();
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
