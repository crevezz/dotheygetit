/* Boots the REAL server and proves every icon and social image it links to is
   actually served - right status, right content-type, real bytes, and a
   manifest whose icon files exist. A broken favicon is invisible until a
   teacher's browser tab shows a blank page, so it gets a test like anything
   else. */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4603;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (extra ? '  <- ' + extra : '')); }
};

const EXPECT = {
  '/favicon.ico': 'image/x-icon',
  '/favicon.svg': 'image/svg+xml',
  '/favicon-16.png': 'image/png',
  '/favicon-32.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
  '/android-chrome-192.png': 'image/png',
  '/android-chrome-512.png': 'image/png',
  '/android-chrome-maskable-512.png': 'image/png',
  '/mstile-150.png': 'image/png',
  '/og-image.png': 'image/png',
  '/site.webmanifest': 'application/manifest+json'
};

const pngSize = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);

  // wait for it
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(BASE + '/'); up = true; } catch {}
  }
  if (!up) { console.log('server never came up on ' + PORT); stop(); process.exit(1); }

  console.log('\nassets are served');
  const bodies = {};
  for (const [url, type] of Object.entries(EXPECT)) {
    const r = await fetch(BASE + url);
    const buf = Buffer.from(await r.arrayBuffer());
    bodies[url] = buf;
    ok(url + ' -> 200 ' + type, r.status === 200 && (r.headers.get('content-type') || '').startsWith(type),
      r.status + ' ' + r.headers.get('content-type'));
    ok(url + ' has real bytes', buf.length > 100, buf.length + ' bytes');
  }

  console.log('\nthe images are the size they claim');
  for (const [url, expect] of [['/apple-touch-icon.png', [180, 180]], ['/favicon-32.png', [32, 32]],
    ['/android-chrome-512.png', [512, 512]], ['/android-chrome-maskable-512.png', [512, 512]],
    ['/og-image.png', [1200, 630]], ['/mstile-150.png', [150, 150]]]) {
    const s = pngSize(bodies[url]);
    ok(url + ' is ' + expect.join('x'), s[0] === expect[0] && s[1] === expect[1], s.join('x'));
  }
  const ico = bodies['/favicon.ico'];
  ok('favicon.ico is a real .ico (not a renamed png)',
    ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3, 'type=' + ico.readUInt16LE(2) + ' n=' + ico.readUInt16LE(4));

  console.log('\nthe manifest points at files that exist');
  const man = JSON.parse(bodies['/site.webmanifest'].toString('utf8'));
  ok('name is Get It?', man.name === 'Get It?' && man.short_name === 'Get It?', man.name);
  ok('standalone display', man.display === 'standalone', man.display);
  ok('has a maskable icon', man.icons.some(i => i.purpose === 'maskable'));
  for (const i of man.icons) {
    const r = await fetch(BASE + i.src);
    ok('manifest icon ' + i.src + ' (' + i.sizes + ') resolves',
      r.status === 200 && pngSize(Buffer.from(await r.arrayBuffer())).join('x') === i.sizes,
      r.status);
  }

  console.log('\nthe pages link them');
  for (const page of ['/', '/help.html']) {
    const html = await (await fetch(BASE + page)).text();
    ok(page + ' links a favicon', /rel="icon"/.test(html));
    ok(page + ' links the apple touch icon', /apple-touch-icon/.test(html));
    ok(page + ' sets og:image', /og:image/.test(html) && !/og:image" content="\/og-image/.test(html));
    ok(page + ' sets twitter:card', /summary_large_image/.test(html));
    ok(page + ' has a theme colour', /name="theme-color"/.test(html));
    ok(page + ' has no leftover placeholder', !/example\.com/.test(html));
    // every icon href it advertises must actually resolve
    for (const m of html.matchAll(/(?:rel="(?:icon|apple-touch-icon|manifest)"[^>]*?href|href)="(\/[a-zA-Z0-9._-]+\.(?:ico|svg|png|webmanifest))"/g)) {
      const r = await fetch(BASE + m[1]);
      ok(page + ' advertises ' + m[1] + ' which exists', r.status === 200, r.status);
    }
  }

  stop();
  console.log('\nPASS ' + pass + ', FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
