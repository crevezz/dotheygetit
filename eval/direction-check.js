/* Did the pupil claim the answer is bigger, or the opposite?
   This is the check that voided a whole question - and with it a correct pupil's
   score - on "1/2 because 2 is smaller". Run it whenever the direction reading
   changes:  node eval/direction-check.js

   The rule: the thing being called bigger/smaller is what comes AFTER the last
   connective (because / since / so / but / then ...). A fraction sitting in the
   clause before it belongs to something else and must not be borrowed. */
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function grab(n) {
  const i = s.indexOf('function ' + n + '(');
  let d = 0, j = s.indexOf('{', i);
  for (let k = j; k < s.length; k++) {
    if (s[k] === '{') d++;
    if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
  }
}
eval([
  s.match(/const WORD_FRAC = \{[\s\S]*?\};/)[0],
  s.match(/const CLAUSE_BREAK = .*;/)[0],
  grab('subjectOf'), grab('fracs'), grab('claim'), grab('saidAs')
].join('\n'));

const POINT = '1/2 is bigger';

/* answer -> the claims we should read out of it */
const CASES = [
  /* the bug: "2 is smaller" is about the denominators, not about 1/2 */
  ['1/2 because 2 is smaller',        [],                            'the reason, not a claim about 1/2'],
  ['1/2, because a half is bigger than a quarter',
                                      [{ f: '1/2', dir: 'more' }, { f: '1/4', dir: 'less' }], 'a real claim, kept'],
  ['a half is bigger because 2 is smaller',
                                      [{ f: '1/2', dir: 'more' }],   'connective mid-phrase, claim survives'],
  ['1/2 is bigger than 1/4',          [{ f: '1/2', dir: 'more' }, { f: '1/4', dir: 'less' }], 'plain comparison'],
  /* the opposite must STILL be caught - this is what voids the question */
  ['1/2 is smaller',                  [{ f: '1/2', dir: 'less' }],  'says the opposite'],
  ['1/2 but 2 is smaller',            [],                            'connective, nothing claimed about 1/2'],
  ['one tenth is bigger than one fifth',
                                      [{ f: '1/10', dir: 'more' }, { f: '1/5', dir: 'less' }], 'worded fractions'],
  ['4/5, over 20 they are 15/20 and 16/20', [],                     'no comparison at all']
];

let bad = 0;
console.log('point under test: "' + POINT + '"  ->  ' + JSON.stringify(claim(POINT)));
console.log('');
for (const [answer, want, why] of CASES) {
  const got = saidAs(answer);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(answer));
  console.log('       read as : ' + JSON.stringify(got));
  if (!ok) console.log('       wanted  : ' + JSON.stringify(want));
  console.log('       ' + why);
}
console.log('');
console.log(bad ? bad + ' FAILED' : 'all ' + CASES.length + ' ok');

/* and the consequence: does the contradiction still void the question? */
const c = claim(POINT), inPoint = fracs(POINT);
const voids = a => {
  for (const x of saidAs(a)) {
    if (!inPoint.includes(x.f)) continue;
    if ((x.f === c.win) !== (x.dir === c.dir)) return true;
  }
  return false;
};
console.log('');
console.log('voids the question (should be false, true, true):');
['1/2 because 2 is smaller', '1/2 is smaller', '1/2 is bigger than 1/4'].forEach(a =>
  console.log('  ' + voids(a) + '  ' + JSON.stringify(a)));
