/* Same card, but against the LIVE app - the one the teacher will actually use. */
const BASE = 'https://app.dotheygetit.app';

const QUESTIONS = [
  'What is 3 + 9?',
  'What is 15 + 23?',
  'What is 105 + 7?',
  'You have 12 sweets. You get 5 more. How many do you have now?',
  'Explain why adding 10 and 20 is the same as adding 20 and 10.'
];
const MARKS = [
  ['The sum of 3 and 9 is 12', 'Correctly adds 3 and 9'],
  ['The sum of 15 and 23 is 38', 'Correctly adds 15 and 23'],
  ['The sum of 105 and 7 is 112', 'Correctly adds 105 and 7'],
  ['The total number of sweets is 17', 'Correctly adds 12 and 5'],
  ['Adding numbers can be done in any order', 'The order of adding numbers does not change the answer']
];
const ANSWERS = ['12', '38', '112', '17', 'it come to the same number 30, bboth ways.'];

(async () => {
  const r = await fetch(BASE + '/api/verdict', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'Simple addition', marks: MARKS, questions: QUESTIONS,
      transcript: ANSWERS.map(a => 'Student: ' + a).join('\n')
    })
  });
  const j = (await r.json()).verdict || {};
  console.log('LIVE: level=' + j.level + '  points ' + j.pointsHit + '/' + j.pointsTotal +
    '  questions ' + j.shown + '/' + j.qs);
  (j.evidence || []).forEach((e, i) => {
    console.log('  Q' + (i + 1) + ' ' + e.got + '/' + e.total);
    e.points.forEach(p => console.log('     ' + (p.hit ? 'YES' : 'no ') + '  ' + p.t +
      (p.said ? '   <- "' + p.said + '"' : '')));
  });
  const css = await (await fetch(BASE + '/styles.css?cb=' + Date.now())).text();
  console.log('card styling live (tlog): ' + css.includes('.tlog'));
})();
