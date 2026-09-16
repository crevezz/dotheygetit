// Put the new nine-chapter journey into record.js, replacing the old six.
const fs = require('fs');
const F = 'record.js';
let s = fs.readFileSync(F, 'utf8');
const scenes = fs.readFileSync('_scenes.txt', 'utf8');

const START = '/* =========================== CH 1 — Create your account';
const ENDMARK = "mark('end');";
const a = s.indexOf(START);
if (a < 0) { console.error('ANCHOR MISSING (start)'); process.exit(1); }
const b = s.indexOf(ENDMARK, a);
if (b < 0) { console.error('ANCHOR MISSING (end)'); process.exit(1); }
s = s.slice(0, a) + scenes.replace(/\s+$/, '\n') + s.slice(b + ENDMARK.length);

// any confirm() must be accepted, or the take stalls on the box
if (!/page\.on\('dialog'/.test(s)) {
  const anchor = "const video = page.video();";
  if (s.indexOf(anchor) < 0) { console.error('DIALOG ANCHOR MISSING'); process.exit(1); }
  s = s.replace(anchor, anchor + "\n    /* a confirm() box must be accepted, or the take stalls on it */\n    page.on('dialog', d => { try { d.accept(); } catch {} });\n    context.on('page', p => p.on('dialog', d => { try { d.accept(); } catch {} }));");
}

fs.writeFileSync(F, s);
console.log('record.js rewritten:', s.split('\n').length, 'lines');
console.log('chapters:', (s.match(/await chapter\(page, \d+/g) || []).join(', '));
