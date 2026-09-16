/* Re-apply the three grading fixes to server.js, inserting the helpers from a plain file
   so no regex has to survive a template literal. Checks every anchor first. */
const fs = require('fs');
const p = 'server.js';
let s = fs.readFileSync(p, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
s = s.split('\r\n').join('\n');
const helpers = fs.readFileSync('eval/_helpers.txt', 'utf8').split('\r\n').join('\n');
const done = [];
function swap(name, before, after) {
  if (!s.includes(before)) { console.error('ANCHOR MISSING: ' + name); process.exit(1); }
  if (s.split(before).length > 2) { console.error('ANCHOR NOT UNIQUE: ' + name); process.exit(1); }
  s = s.replace(before, after);
  done.push(name);
}

/* ---- 1. the deterministic helpers ---- */
swap('helpers',
`  (t.match(/[a-z]+/g) || []).forEach(w => { if (WORD_NUM[w] !== undefined) out.push(String(WORD_NUM[w])); });
  return out;
}
`,
`  (t.match(/[a-z]+/g) || []).forEach(w => { if (WORD_NUM[w] !== undefined) out.push(String(WORD_NUM[w])); });
  return out;
}
` + helpers);

/* ---- 2. echo guard in the per-answer marking loop ---- */
swap('echo in mark loop',
`    if (paired && !(hi > lo)) continue;
    try {`,
`    if (paired && !(hi > lo)) continue;
    /* nothing of their own to mark */
    if (isEcho(a, paired ? questions[k] : questions.join(' '))) continue;
    try {`);

/* ---- 3. echo guard in the number safety net ---- */
swap('echo in number net',
`    const hi = paired ? offset[k] + (marks[k] || []).filter(Boolean).length : points.length;
    const asked = nums(paired ? questions[k] : questions.join(' '));`,
`    const hi = paired ? offset[k] + (marks[k] || []).filter(Boolean).length : points.length;
    if (isEcho(a, paired ? questions[k] : questions.join(' '))) continue;
    const asked = nums(paired ? questions[k] : questions.join(' '));`);

/* ---- 4. contradiction pass: said the opposite -> the question scores nothing ---- */
swap('contradiction pass',
`  /* The BAND comes from the QUESTIONS the pupil showed something on, not from the pooled`,
`  /* A pupil who names the WRONG fraction has not shown the point that names the right
     one, and the marker does not read direction: it ticks "4/5 is bigger than 3/4" for a
     child who wrote "3/4 is bigger", and ticks "a fifth is bigger than a tenth" for a
     child who wrote that a tenth is. So read the direction in code. Only fractions that
     appear in the point count, so a pupil working with sub-parts ("a quarter is bigger
     than a fifth") is left alone - and a contradiction voids the whole question, because
     the pupil answered the opposite of what was asked. */
  if (paired) {
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      if (!ps.length) continue;
      const said = saidAs(answers[qi] || '');
      if (!said.length) continue;
      let wrong = false;
      for (const point of ps) {
        const c = claim(point);
        if (!c) continue;
        const inPoint = fracs(point);
        for (const s of said) {
          if (!inPoint.includes(s.f)) continue;
          if ((s.f === c.win) !== (s.dir === c.dir)) { wrong = true; break; }
        }
        if (wrong) break;
      }
      if (wrong) for (let k = offset[qi]; k < offset[qi] + ps.length; k++) hit.delete(k);
    }
  }
  /* The BAND comes from the QUESTIONS the pupil showed something on, not from the pooled`);

/* ---- 5. the read is a ceiling: a green may never sit beside "nothing" ---- */
swap('note cap',
`          v.shown = graded.shown;
        } else if (!marks.length) {`,
`          v.shown = graded.shown;
          /* Two graders write this one card: the count decides the colour, the read
             writes the sentence above it. When they disagree the teacher gets a green
             badge over the words "Nothing about comparing fractions", which is the one
             thing that makes the whole page untrustworthy. The read may only ever hold a
             pupil back, never lift one up, so it cannot pass a child who showed nothing. */
          if (/^\s*nothing\b/i.test(String(v.gets || '').trim()) && v.level !== 'red') {
            v.level = 'red';
            v.cappedBy = String(v.gets || '').trim().slice(0, 80);
          }
        } else if (!marks.length) {`);

fs.writeFileSync(p, eol === '\n' ? s : s.split('\n').join(eol));
console.log('applied: ' + done.join(', '));
