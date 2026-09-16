/* help.html still indexed the old seven videos (ids that no longer exist), and defaulted the
 * player to 1.5x - which only made sense when the takes were slow and padded. New index, nine
 * chapters, real durations, 1x default. */
const fs = require('fs');
const P = __dirname + '/../public/help.html';
let h = fs.readFileSync(P, 'utf8');

const ARR = `const CHAPTERS = [
  { n:1, id:'01-what-get-it-is',       title:'What Get It? is',         sub:'Start here - 30 seconds',        d:'The drive home. Why this exists at all.', len:'0:27' },
  { n:2, id:'02-create-your-account',  title:'Create your account',     sub:'Takes about a minute',           d:'Email, password, done. Your classes follow you to any computer.', len:'0:27' },
  { n:3, id:'03-set-up-your-class',    title:'Set up your class',       sub:'One code, lasts all year',       d:'Name the class, then paste your list straight from SIMS or Arbor.', len:'0:35' },
  { n:4, id:'04-write-the-questions',  title:'Write the questions',     sub:'You type the topic. That is it.',d:'Generate, rewrite, add, delete. No Sunday evening.', len:'0:40' },
  { n:5, id:'05-how-pupils-join',      title:'How pupils join',         sub:'Play this one on the whiteboard',d:'The whole pupil journey: code, name, explain it in their own words, send.', len:'0:52' },
  { n:6, id:'06-read-your-results',    title:'Read your results',       sub:'Who got it, who did not',        d:'Green, amber, red - and what each pupil actually said.', len:'0:38' },
  { n:7, id:'07-change-a-colour',      title:'Change a colour yourself', sub:'You know the child',            d:'The AI can be wrong. Click the colour you would give, and it sticks.', len:'0:26' },
  { n:8, id:'08-spot-the-pattern',     title:'Spot the pattern',        sub:'The record builds itself',       d:'A dot per pupil per check. Two in a row is a pattern.', len:'0:30' },
  { n:9, id:'09-your-data',            title:'Your data, and theirs',   sub:'In plain English',               d:'What is kept, who sees it, what is exported, what is deleted.', len:'0:43' }
];`;

const a = h.indexOf('const CHAPTERS = [');
const b = h.indexOf('];', a);
if (a < 0 || b < 0) { console.error('CHAPTERS NOT FOUND'); process.exit(1); }
h = h.slice(0, a) + ARR + h.slice(b + 2);

const swaps = [
  ['in seven short videos', 'in nine short videos'],
  ['Watch the lot (4 min)', 'Watch the lot (5 min)'],
  ["'Get It? \u2014 all seven, in order'", "'Get It? \u2014 all nine, in order'"],
  ['4 minutes 20 seconds.', '5 minutes 17 seconds.'],
  ['video 4,', 'video 5,'],
  ["localStorage.getItem('getit.speed') || '1.5'", "localStorage.getItem('getit.speed') || '1'"],
  ["speed.value = localStorage.getItem('getit.speed') || '1.5'", "speed.value = localStorage.getItem('getit.speed') || '1'"],
  ['<option value="1.5" selected>', '<option value="1" selected>']
];
const done = [];
for (const [from, to] of swaps) {
  if (h.includes(from)) { h = h.split(from).join(to); done.push(from.slice(0, 34)); }
}

fs.writeFileSync(P, h);
console.log('chapters -> 9');
console.log('swapped  :', done.join(' | ') || 'none');
console.log('speed    :', /getit\.speed'\) \|\| '(\d)'/.exec(h) ? 'default ' + /getit\.speed'\) \|\| '(\d)'/.exec(h)[1] + 'x' : '?');
