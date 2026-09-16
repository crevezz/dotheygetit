// A bare result is not a reason: on a why-question, a four-word answer with a number and
// no word of reasoning gets ONE point, not two.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(f, 'utf8');
const anchor = '  /* The BAND comes from the QUESTIONS the pupil showed something on';
if (!s.includes(anchor)) { console.error('MISS'); process.exit(1); }
const cap = `  /* A bare result is not a reason. On a WHY question, "its 10 either way" shows the pupil
     knows the fact but not why it is true, and the marker ticks the reasons anyway - so a
     pupil who explained nothing came back green. Very short, carries a number, and not one
     word of reasoning: one point, not two. Deliberately narrow, so a pupil explaining it
     their own way is never caught by it. */
  for (let qi = 0; qi < marks.length; qi++) {
    const q = (questions && questions[qi]) || '';
    if (!/why|explain/i.test(q)) continue;
    const a = paired ? (answers[qi] || '') : '';
    if (!a || a.trim().split(/\\s+/).length > 4) continue;
    if (!/\\d/.test(a)) continue;
    if (/because|since|\\bso\\b|\\bsame\\b|order|swap|group|repeat|doubl|equal|both|times|mean/i.test(a)) continue;
    const ps = (marks[qi] || []).filter(Boolean).length;
    if (ps < 2) continue;
    const hs = [];
    for (let k = 0; k < ps; k++) if (hit.has(offset[qi] + k)) hs.push(offset[qi] + k);
    if (hs.length > 1) hs.slice(1).forEach(x => hit.delete(x));
  }
`;
s = s.replace(anchor, cap + anchor);
fs.writeFileSync(f, s);
console.log('patched');
