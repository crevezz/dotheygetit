const fs = require('fs');
const p = 'public/index.html';
let s = fs.readFileSync(p, 'utf8');
const log = [];
const has = (n, ok) => log.push((ok ? 'ok   ' : 'FAIL ') + n);

/* 1. take the Help tab out of the header - pupils do not need it */
const tab = /\s*<a class="tab" href="\/help"[^>]*>Help<\/a>/s;
const tabMatch = s.match(tab);
if (tabMatch) { s = s.replace(tabMatch[0], ''); has('header Help tab removed', true); }
else has('header Help tab removed', false);

/* 2. give the teachers a proper pointer to the videos, where the support link already is */
const anchor = '    <!-- teachers only: sits inside #view-teacher, so it never shows on the pupil tab -->';
const helpBlock = `    <!-- teachers only: sits inside #view-teacher, so it never shows on the pupil tab -->
    <p class="sitenote" style="text-align:center;margin-top:20px">
      New to it? <a href="/help">Nine short videos</a> &mdash; five and a half minutes for the lot.
      If you are handing it out tomorrow, start with <em>How pupils join</em>.
    </p>
`;
if (s.includes(anchor)) { s = s.replace(anchor, helpBlock.trimStart().replace(/^\s*/, '')); has('help pointer added to the teacher tab', true); }
else has('help pointer added to the teacher tab', false);

/* 3. and leave a route in for anyone who is not on that tab */
const foot = s.match(/<footer class="sitenote">[\s\S]*?<\/footer>/);
if (foot && !/href="\/help"/.test(foot[0])) {
  const withLinks = foot[0].replace(/(<a href="\/privacy")/, '<a href="/help">Help</a> &middot; $1');
  s = s.replace(foot[0], withLinks);
  has('footer keeps a Help link', withLinks !== foot[0]);
} else has('footer keeps a Help link', !!(foot && /href="\/help"/.test(foot[0])));

/* 4. the old tooltip was stale and it has moved anyway */
s = s.replace(/Nine short videos/g, 'Nine short videos').replace(/Seven short videos/g, 'Nine short videos');

fs.writeFileSync(p, s);
console.log(log.join('\n'));
console.log('\nHelp links now: ' + (s.match(/href="\/help"/g) || []).length);
const header = s.slice(0, s.indexOf('<section'));
console.log('Help in the header: ' + /href="\/help"/.test(header));
const teacherStart = s.indexOf('id="view-teacher"'), pupilStart = s.indexOf('id="view-student"');
const teacherSec = s.slice(teacherStart, pupilStart);
console.log('Help in the teacher section: ' + /href="\/help"/.test(teacherSec));
const pupilSec = s.slice(pupilStart, s.indexOf('<footer'));
console.log('Help in the pupil section: ' + /href="\/help"/.test(pupilSec));
