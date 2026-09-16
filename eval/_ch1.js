/* Chapter 1 was written in the first person ("I built this because of the drive home"), which
 * makes the viewer part of the story in a way the other eight chapters never do. Same length,
 * same point, told about the teacher rather than by them. */
const fs = require('fs');

const J = __dirname + '/../tutorial/narration.json';
const n = JSON.parse(fs.readFileSync(J, 'utf8'));
const c1 = n.chapters.find(c => c.n === 1);
if (!c1) { console.error('no chapter 1'); process.exit(1); }
const before = String(c1.text).trim().split(/\s+/).length;
c1.text = `Some lessons land. Some do not - and you often find out weeks later, from the children who never put their hand up.
Asking in front of the class does not work. They are the last to admit it.
Marking the books does not tell you either. A right answer can be copied.
Get It asks each pupil properly - one to one, in their own words.
And it shows you the gaps while you can still fix them.`;
fs.writeFileSync(J, JSON.stringify(n, null, 2) + '\n');
console.log('ch1 words: ' + before + ' -> ' + c1.text.trim().split(/\s+/).length);

/* the help-page blurb said the same thing */
const H = __dirname + '/../public/help.html';
let h = fs.readFileSync(H, 'utf8');
const from = 'The drive home. Why this exists at all.';
const to = 'Why a right answer on paper can still hide a gap.';
if (h.includes(from)) { h = h.split(from).join(to); fs.writeFileSync(H, h); console.log('help blurb updated'); }
else console.log('help blurb: NOT FOUND (check manually)');
