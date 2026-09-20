/* Deploys landing-site/ to Netlify as a zip, then polls until it is live and
   checks the icons are actually being served. Uses the token the Netlify CLI
   already stored on this machine - nothing secret lives in this repo. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SITE_ID = process.env.NETLIFY_SITE_ID || '79b2440f-42b1-4ca8-ae0f-9257e14e132d';
const DIR = path.join(__dirname, '..', 'landing-site');

function token() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const cfg = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'netlify', 'Config', 'config.json');
  const j = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  const u = j.users[j.userId];
  if (!u || !u.auth || !u.auth.token) throw new Error('no Netlify token in the CLI config');
  return u.auth.token;
}

(async () => {
  const T = token();
  const H = { Authorization: 'Bearer ' + T };

  // Windows ships bsdtar, which can write a zip with -a. No dependency needed.
  // Names must be listed explicitly: passing "." writes "./index.html" entries,
  // which Netlify stores at the wrong path and then 404s on.
  const zip = path.join(os.tmpdir(), 'getit-landing-' + Date.now() + '.zip');
  // Every entry, directories included - tar walks them. Filtering to files here
  // is what 404'd /blog/ and /contact/ on the live site.
  const files = fs.readdirSync(DIR).filter((f) => !f.startsWith('.'));
  execFileSync('tar', ['-a', '-c', '-f', zip, '-C', DIR].concat(files), { stdio: 'inherit' });
  console.log('packing ' + files.length + ' files: ' + files.join(', '));
  console.log('zipped landing-site -> ' + (fs.statSync(zip).size / 1024).toFixed(0) + ' KB');

  const dep = await (await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/zip' }, H),
    body: fs.readFileSync(zip)
  })).json();
  if (!dep.id) { console.log('deploy rejected: ' + JSON.stringify(dep)); process.exit(1); }
  console.log('deploy ' + dep.id + '  state=' + dep.state);

  let state = dep.state;
  for (let i = 0; i < 40 && state !== 'ready' && state !== 'error'; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const d = await (await fetch(`https://api.netlify.com/api/v1/deploys/${dep.id}`, { headers: H })).json();
    if (d.state !== state) { state = d.state; console.log('  state=' + state); }
  }
  console.log('final: ' + state);
  if (state !== 'ready') process.exit(1);

  const url = dep.ssl_url || dep.url;
  console.log('\nlive check on ' + url);
  const checks = [
    // Accept the official MIME as well as the one we ask for - Netlify is
    // allowed to serve image/vnd.microsoft.icon for an .ico.
    ['/', 'text/html', 5000], ['/favicon.ico', 'image/', 1000, ['image/x-icon', 'image/vnd.microsoft.icon']],
    ['/favicon.svg', 'image/svg+xml', 100], ['/apple-touch-icon.png', 'image/png', 5000],
    ['/og-image.png', 'image/png', 100000], ['/site.webmanifest', 'application/manifest+json', 100]
  ];
  let bad = 0;
  for (const [p, type, min, alsoOk] of checks) {
    const r = await fetch(url + p);
    const b = Buffer.from(await r.arrayBuffer());
    const ct = (r.headers.get('content-type') || '');
    const good = r.status === 200 && (ct.startsWith(type) || (alsoOk || []).includes(ct)) && b.length >= min;
    if (!good) bad++;
    console.log('  ' + (good ? 'OK  ' : 'BAD ') + p.padEnd(26) + r.status + '  ' + ct.padEnd(26) + (b.length / 1024).toFixed(1) + ' KB');
  }
  fs.unlinkSync(zip);

  // The whole point of the OG image is that a link preview picks it up.
  const home = await (await fetch(url + '/')).text();
  const og = (home.match(/property="og:image" content="([^"]+)"/) || [])[1];
  console.log('\nog:image advertised as: ' + og);
  if (og && og.startsWith('http')) {
    const r = await fetch(og);
    console.log('  it resolves: ' + r.status + ' ' + r.headers.get('content-type'));
    if (r.status !== 200) bad++;
  } else { console.log('  NOT AN ABSOLUTE URL - link previews will not find it'); bad++; }

  console.log(bad ? '\n' + bad + ' problem(s)' : '\nlanding site live and correct');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
