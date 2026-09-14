/* Drops the generated icon/social block into every page that faces the public.
   Idempotent: re-running replaces the block between the markers instead of
   stacking a second copy. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const snippet = fs.readFileSync(path.join(__dirname, 'out', 'head-snippet.html'), 'utf8');

const PAGES = [
  { file: 'public/index.html', base: 'https://app.dotheygetit.app' },
  { file: 'public/help.html', base: 'https://app.dotheygetit.app' },
  { file: 'landing-site/index.html', base: 'https://dotheygetit.app' }
];

const START = '<!-- icons:start';
const END = '<!-- icons:end -->';

let changed = 0;
for (const p of PAGES) {
  const full = path.join(ROOT, p.file);
  if (!fs.existsSync(full)) { console.log('skip   ' + p.file + ' (missing)'); continue; }
  let html = fs.readFileSync(full, 'utf8');
  const block = snippet.replace(/__BASE__/g, p.base).trim();
  const had = html.includes(START);

  if (had) {
    const a = html.indexOf(START);
    const b = html.indexOf(END, a);
    if (b === -1) { console.log('FAIL   ' + p.file + ' (start marker with no end)'); continue; }
    html = html.slice(0, a) + block + html.slice(b + END.length);
  } else {
    if (!html.includes('</head>')) { console.log('FAIL   ' + p.file + ' (no </head>)'); continue; }
    html = html.replace('</head>', block + '\n</head>');
  }

  fs.writeFileSync(full, html);
  changed++;
  console.log((had ? 'updated' : 'added  ') + ' ' + p.file.padEnd(24) + p.base);
}
console.log('\n' + changed + ' page(s) touched.');
