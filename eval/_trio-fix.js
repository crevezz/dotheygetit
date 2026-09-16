// (a) a wrong fraction can no longer be ticked as the right answer
// (b) a point the pupil said almost word for word is credited
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(f, 'utf8');
const before = s;

/* helper */
const a1 = '/* Every fraction the pupil calls bigger or s';
if (!s.includes(a1)) { console.error('MISS claim anchor'); process.exit(1); }
s = s.replace(a1, `/* 3/4 as a number, so 2/4 and 1/2 count as the same answer. */
function fracValue(fr) {
  const m = String(fr || '').match(/^(\\d+)\\s*\\/\\s*(\\d+)$/);
  if (!m) return null;
  const v = Number(m[1]) / Number(m[2]);
  return isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}

` + a1);

/* (a) the veto, right before the band is worked out */
const a2 = '  /* The BAND comes from the QUESTIONS the pupil showed something on';
if (!s.includes(a2)) { console.error('MISS band anchor'); process.exit(1); }
const veto = `  /* A pupil who gives the WRONG fraction has not shown the point that names the right
     one. "3/8" for "1/4 + 2/4" is not "says 3/4" - but the marker reads both as "a
     fraction", ticks it, and a child who added the bottoms comes back green. Compare the
     VALUES in code. Equal fractions written differently (2/4 and 1/2) still count. */
  if (paired) {
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      if (!ps.length) continue;
      const mine = fracs(answers[qi] || '').map(fracValue).filter(v => v != null);
      if (mine.length !== 1) continue;
      for (let k = 0; k < ps.length; k++) {
        const at = offset[qi] + k;
        if (!hit.has(at)) continue;
        const theirs = fracs(ps[k]).map(fracValue).filter(v => v != null);
        if (theirs.length !== 1) continue;
        if (mine[0] !== theirs[0]) hit.delete(at);
      }
    }
  }
  /* Wording net. The marker reads meaning, and now and then misses a point the pupil has
     said almost word for word - "the order does not matter in timesing" against "explains
     the order does not matter" came back as a miss, so a pupil who had said it came back
     amber. If every real word of the point is in the answer, they have said it. Two
     content words at least, so a one-word point cannot be matched by accident. */
  {
    const LEAD = /^(explains?|says?|states?|shows?|knows?|uses?|gives?|writes?|names?|mentions?|recognises?|recognizes?|tells?)\\s+/i;
    const stem = w => w.replace(/s$/, '');
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      if (!ps.length) continue;
      const lo = offset[qi];
      const q = (questions && questions[qi]) || '';
      for (let k = 0; k < ps.length; k++) {
        if (hit.has(lo + k)) continue;
        const need = echoWords(ps[k].replace(LEAD, '')).filter(w => !STOP_WORDS.has(w)).map(stem);
        if (need.length < 2) continue;
        for (const a of answers) {
          if (isEcho(a, paired ? q : questions.join(' '))) continue;
          const mine = new Set(echoWords(a).map(stem));
          if (need.every(w => mine.has(w))) { hit.set(lo + k, a); break; }
        }
      }
    }
  }
`;
s = s.replace(a2, veto + a2);

if (s === before) { console.error('NOTHING CHANGED'); process.exit(1); }
fs.writeFileSync(f, s);
console.log('patched');
