// When the examiner digs, there are more answers than questions and counting cannot pair
// them - so a pupil who answered everything was marked 0 of 10. The questions are known:
// find each one in the transcript and take the answer after it.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(f, 'utf8');
const anchor = '  const paired = answers.length === marks.length;';
if (!s.includes(anchor)) { console.error('MISS'); process.exit(1); }
const block = `  /* The examiner digs on a weak answer, so a transcript can hold MORE answers than the
     check has questions - and then counting cannot pair them, the nets switch off, and a
     pupil who answered every question came back 0 of 10 with "nothing" against each one.
     The questions are known, so find each one in the transcript and take the answer that
     follows it. A follow-up is not on the list, so it is passed over. */
  if (answers.length !== marks.length && Array.isArray(questions) && questions.length === marks.length) {
    const found = [];
    let at = 0;
    for (const q of questions) {
      const want = String(q || '').trim();
      const idx = turns.findIndex((t, i) => i >= at && t.role === 'examiner' && t.text === want);
      if (idx < 0) { found.length = 0; break; }
      const a = turns[idx + 1];
      found.push(a && a.role === 'student' ? a.text : '');
      at = idx + 2;
    }
    if (found.length === questions.length) {
      answers.length = 0;
      found.forEach(x => answers.push(x));
    }
  }
` + anchor;
s = s.replace(anchor, block);
fs.writeFileSync(f, s);
console.log('paired by question text');
