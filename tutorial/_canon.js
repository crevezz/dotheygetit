/* One-off: put a <link rel="canonical"> after </title> on every public page.
   The two hosts (dotheygetit.app and app.dotheygetit.app) carry near-identical
   titles and descriptions, so without this Google has to guess which is which. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  ['public/index.html',        'https://app.dotheygetit.app/'],
  ['public/help.html',         'https://app.dotheygetit.app/help'],
  ['public/privacy.html',      'https://app.dotheygetit.app/privacy'],
  ['landing-site/index.html',  'https://dotheygetit.app/']
];

for (const [rel, url] of PAGES) {
  const p = path.join(ROOT, rel);
  let s = fs.readFileSync(p, 'utf8');

  if (/rel="canonical"/.test(s)) { console.log('already has canonical  ' + rel); continue; }

  const tag = '\n<link rel="canonical" href="' + url + '"/>';
  const m = /<\/title>/.exec(s);
  if (!m) { console.log('NO </title>            ' + rel); continue; }

  s = s.slice(0, m.index + m[0].length) + tag + s.slice(m.index + m[0].length);
  fs.writeFileSync(p, s);
  console.log('canonical -> ' + url + '  (' + rel + ')');
}
