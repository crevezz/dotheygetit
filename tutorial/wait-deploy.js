const KEY = 'rnd_LAFeh3B5v5mPne6gpXAvPOi2Q0dG';
const SVC = 'srv-dak0p7142hec73971ls0';
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* smoke-test whatever is actually published, read from the manifests, so this
   cannot end up asking the live site for a chapter that was renamed. */
const pub = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'help', p), 'utf8'));
const idx = pub('index.json'), mob = pub(path.join('mobile', 'index.json'));

(async () => {
  let status = '';
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`https://api.render.com/v1/services/${SVC}/deploys?limit=1`, { headers: { Authorization: 'Bearer ' + KEY } });
    const j = await r.json();
    const d = (j[0] && (j[0].deploy || j[0])) || {};
    if (d.status !== status) { console.log('  deploy ' + d.status + (d.commit ? '  ' + String(d.commit.id).slice(0, 7) : '')); status = d.status; }
    if (status === 'live' || status === 'build_failed' || status === 'update_failed' || status === 'canceled') break;
    await sleep(6000);
  }
  console.log('  final: ' + status);
  if (status !== 'live') process.exit(1);

  /* ---- live smoke test of /help */
  const base = 'https://dotheygetit.onrender.com';
  const hits = [
    ['/', {}],
    ['/help', {}],
    ['/api/health', {}],
    ['/help/' + idx.chapters[0].file, { Range: 'bytes=0-999' }],
    ['/help/' + idx.chapters[idx.chapters.length - 1].file, { Range: 'bytes=0-999' }],
    ['/help/all.mp4', { Range: 'bytes=0-999' }],
    ['/help/mobile/' + mob.chapters[0].file, { Range: 'bytes=0-999' }],
    ['/help/mobile/all.mp4', { Range: 'bytes=0-999' }]
  ];
  console.log('\n  live check on ' + base);
  for (const [p, h] of hits) {
    try {
      const r = await fetch(base + p, { headers: h });
      const buf = await r.arrayBuffer();
      console.log('  ' + p.padEnd(32) + r.status + '  ' + String(r.headers.get('content-type')).padEnd(20) +
        (buf.byteLength + 'b').padEnd(8) + (r.headers.get('content-range') || ''));
    } catch (e) { console.log('  ' + p.padEnd(32) + 'ERR ' + e.message); }
  }
})();
