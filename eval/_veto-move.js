// The wrong-fraction veto has to run BEFORE the nets, or the nets credit the working point
// off the back of an answer that is about to be thrown out ("3/8" -> "adds the top numbers").
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(f, 'utf8');

const start = s.indexOf('  /* A pupil who gives the WRONG fraction has not shown the point');
const endMark = '  /* Wording net. The marker reads meaning';
const end = s.indexOf(endMark);
if (start < 0 || end < 0 || end < start) { console.error('MISS veto block'); process.exit(1); }
const veto = s.slice(start, end);
s = s.slice(0, start) + s.slice(end);

const target = '  const bare = answers.filter(a => /^[\\s\\d\\/.,+-]+$/.test(a));';
if (!s.includes(target)) { console.error('MISS bare anchor'); process.exit(1); }
s = s.replace(target, veto + target);

/* a pupil whose whole answer is one fraction in words ("three quarters") has given the
   answer, so the working point beside it is shown too */
const q1 = "      if (h != null && /^[\\s\\d\\/.,+-]+$/.test(h)) { quote = h; break; }";
if (!s.includes(q1)) { console.error('MISS quote line'); process.exit(1); }
s = s.replace(q1, `      if (h == null) continue;
      const wholeFraction = echoWords(h).length <= 3 && fracs(h).length === 1;
      if (/^[\\s\\d\\/.,+-]+$/.test(h) || wholeFraction) { quote = h; break; }`);

fs.writeFileSync(f, s);
console.log('moved + widened');
