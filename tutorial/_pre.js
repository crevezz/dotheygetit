/* throwaway pre-flight: record.js cards vs narration.json, before spending a take */
const fs = require('fs');
const path = require('path');
const R = fs.readFileSync(path.join(__dirname, 'record.js'), 'utf8');
const N = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
const chapters = Array.isArray(N) ? N : (N.chapters || []);
const cards = [...R.matchAll(/chapter\(\s*page\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g)]
  .map(m => ({ n: +m[1], title: m[2], sub: m[3] }));
let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + msg); };
say(cards.length === chapters.length, 'card count ' + cards.length + ' === narration count ' + chapters.length);
say(cards.every((c, i) => c.n === i + 1), 'cards numbered 1..' + cards.length + ' in order');
const mm = chapters.filter((ch, i) => !cards[i] || cards[i].title !== ch.title || cards[i].sub !== ch.sub);
say(mm.length === 0, 'titles+subs match narration exactly' + (mm.length ? ' -> ' + JSON.stringify(mm) : ''));
say(new Set(chapters.map(c => c.id)).size === chapters.length, 'narration ids unique');
/* the new ids (03b/03c/05b/06b/09b) sit out of alphabetical order on purpose, so the
   9 already-published filenames keep working. Informational only - titles are what is filmed. */
const ids = chapters.map(c => c.id);
const outOfOrder = ids.filter((id, i) => i > 0 && id < ids[i - 1]);
console.log('     note: ids out of alphabetical order at watch positions ' + JSON.stringify(outOfOrder));
/* VO budget at the measured rate */
const WPS = 2.957;
let words = 0;
chapters.forEach((c, i) => {
  const w = String(c.text || '').split(/\s+/).filter(Boolean).length;
  words += w;
  const need = w / WPS;
  console.log('     ch' + String(i + 1).padStart(2) + ' ' + String(c.id).padEnd(26) + String(w).padStart(4) + 'w  needs ' + need.toFixed(1) + 's');
});
console.log('     total ' + words + ' words, ~' + (words / WPS / 60).toFixed(1) + ' min of voice');
console.log(bad ? '\n  ' + bad + ' FAILED\n' : '\n  pre-flight OK\n');
process.exit(bad ? 1 : 0);
