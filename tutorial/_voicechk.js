/* throwaway: are the 9 existing voice clips still valid, or is any text stale?
   compares narration.json against the pre-migration .bak, and lists which ids
   have no clip on disk yet. */
const fs = require('fs');
const path = require('path');
const here = __dirname;
const cur = JSON.parse(fs.readFileSync(path.join(here, 'narration.json'), 'utf8'));
const bakPath = path.join(here, 'narration.json.bak');
const C = Array.isArray(cur) ? cur : (cur.chapters || []);
const B = fs.existsSync(bakPath)
  ? (() => { const b = JSON.parse(fs.readFileSync(bakPath, 'utf8')); return Array.isArray(b) ? b : (b.chapters || []); })()
  : [];

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const clip = id => fs.existsSync(path.join(here, 'voice', id + '.mp3'));

console.log('  current chapters: ' + C.length + '   pre-migration: ' + (B.length || 'none'));
if (!B.length) { console.log('  (no .bak to compare - cannot tell if the 9 are stale)'); }

let changed = 0;
for (const b of B) {
  const c = C.find(x => x.id === b.id);
  if (!c) { console.log('  GONE     ' + b.id); changed++; continue; }
  const same = norm(b.text) === norm(c.text);
  if (!same) { changed++; console.log('  CHANGED  ' + b.id); }
}
console.log('  -> ' + changed + ' of the ' + B.length + ' old chapters changed their words\n');

console.log('  clips on disk vs needed:');
let missing = 0;
for (const c of C) {
  const has = clip(c.id);
  if (!has) missing++;
  console.log('    ' + (has ? 'have' : 'MISSING') + '  ' + c.id + (has ? '' : '   <- ' + String(c.text || '').split(/\s+/).filter(Boolean).length + ' words'));
}
console.log('\n  ' + missing + ' clip(s) to generate; ' + (C.length - missing) + ' would be KEPT as-is');
