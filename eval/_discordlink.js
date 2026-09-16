/* Discord support link, teachers tab only: inserted inside #view-teacher so it is never
 * rendered on the pupil tab. */
const fs = require('fs');
const P = __dirname + '/../public/index.html';
let h = fs.readFileSync(P, 'utf8');
if (h.includes('discord.gg/Vs9Dect2VK')) { console.log('already there'); process.exit(0); }

const a = h.indexOf('<section id="view-teacher">');
const b = h.indexOf('</section>', a);
if (a < 0 || b < 0) { console.error('TEACHER VIEW NOT FOUND'); process.exit(1); }

const link =
  '\n    <!-- teachers only: sits inside #view-teacher, so it never shows on the pupil tab -->\n' +
  '    <p class="sitenote" style="text-align:center;margin-top:20px">\n' +
  '      Stuck, or got an idea? <a href="https://discord.gg/Vs9Dect2VK" target="_blank" rel="noopener">Join the support server</a>\n' +
  '      &mdash; ask a question, report a bug, or share a lesson that worked.\n' +
  '    </p>\n  ';

h = h.slice(0, b) + link + h.slice(b);
fs.writeFileSync(P, h);

/* prove it landed in the right section */
const t = h.indexOf('<section id="view-teacher">');
const s = h.indexOf('<section id="view-student"');
const at = h.indexOf('discord.gg/Vs9Dect2VK');
console.log('inserted at char', at, '- teacher section', t + '..' + b, '- student starts', s);
console.log(at > t && at < s ? 'INSIDE the teachers tab' : 'WRONG PLACE');
