// Single-fact questions (first letter / spell the word / last letter) have ONE point, and
// a correct answer always credits it. Worked out in code, so it cannot be missed.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(f, 'utf8');
const before = s;

/* 1. the helpers, right after plainSum */
const anchor = '/* The number a simple question works out to, computed in code.';
if (!s.includes(anchor)) { console.error('MISS plainSum anchor'); process.exit(1); }
const helpers = `/* A question whose answer is one letter, one word or one spelling. There is no working
   to show on these, so they have ONE point - the answer - and a pupil who is right can
   always reach it. Without this the writer adds a second point ("knows the word 'apple'"
   beside "knows the first letter") and a child who answers every question correctly comes
   back on 5 of 10. */
function shortFact(q) {
  const t = String(q || '').toLowerCase();
  if (/why|explain|how do you know|how can you tell|because|reason/.test(t)) return false;
  return /first letter|last letter|what letter|spell the word|how do you spell|starts with|ends with/.test(t);
}
/* The right answer to a short-fact question, worked out from the question itself so a
   correct answer is never left uncredited. */
function shortAnswer(q) {
  const t = String(q || '');
  const m = t.match(/['"\\u2018\\u2019\\u201c\\u201d]([A-Za-z]+)['"\\u2018\\u2019\\u201c\\u201d]/);
  const w = m ? m[1].toLowerCase() : null;
  const lt = t.toLowerCase();
  if (w && /first letter/.test(lt)) return [w[0]];
  if (w && /last letter/.test(lt)) return [w[w.length - 1]];
  if (w && /spell the word/.test(lt)) return [w, w.split('').join('-')];
  return null;
}
const normAns = a => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '');

`;
s = s.replace(anchor, helpers + anchor);

/* 2. a short-fact question needs only ONE point, and is never topped up */
const need = s.indexOf('marks.filter((m, i) => m.length < (qs[i] && plainSum(qs[i]) ? 1 : 2))');
if (need < 0) { console.error('MISS two-point check'); process.exit(1); }
s = s.replace(/marks\.filter\(\(m, i\) => m\.length < \(qs\[i\] && plainSum\(qs\[i\]\) \? 1 : 2\)\)/,
  'marks.filter((m, i) => m.length < (qs[i] && (plainSum(qs[i]) || shortFact(qs[i])) ? 1 : 2))');

const thinOld = "const thin = qs.map((q, i) => ({ q, i, have: marks[i] || [] })).filter(x => x.have.length < 2);";
if (!s.includes(thinOld)) { console.error('MISS thin'); process.exit(1); }
s = s.replace(thinOld, "const thin = qs.map((q, i) => ({ q, i, have: marks[i] || [] })).filter(x => x.have.length < 2 && !shortFact(x.q));");

/* 3. the net, after the bare-answer net inside marksFromAnswers */
const netAnchor = "  /* Result net: work the answer out in code.";
if (!s.includes(netAnchor)) { console.error('MISS net anchor'); process.exit(1); }
const net = `  /* Short-fact net. "What is the first letter in 'apple'?" and "Spell the word 'cat'."
     The right answer is worked out from the question itself, so a pupil who gives it is
     credited on every point that question has - they answered what was asked, in the
     shortest way it can be answered, and that is not a reason to mark them down. */
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    const want = shortAnswer((questions && questions[qi]) || '');
    if (!want) continue;
    const wantN = want.map(normAns).filter(Boolean);
    const mine = answers.find(a => wantN.includes(normAns(a)));
    if (!mine) continue;
    for (let k = 0; k < ps.length; k++) if (!hit.has(lo + k)) hit.set(lo + k, mine);
  }
`;
s = s.replace(netAnchor, net + netAnchor);

/* 4. tell the writer: a single-fact question has ONE point */
const twoPt = /A short answer question\nstill gets TWO points - the answer itself, and the working or the reason\./;
if (!twoPt.test(s)) { console.error('MISS prompt line'); process.exit(1); }
s = s.replace(twoPt, `A short answer question
still gets TWO points - the answer itself, and the working or the reason. BUT a question
that asks for a single letter, a single word, a spelling, a name or a date has NO working
to give: it has ONE point, and that point is the answer. Write just the one. "Knows the
word 'apple'" beside "knows the first letter" is not a second point - it is a way of
marking a child down for answering a one-word question in one word.`);

if (s === before) { console.error('NOTHING CHANGED'); process.exit(1); }
fs.writeFileSync(f, s);
console.log('patched');
