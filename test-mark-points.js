/* The WW2 card teachers were looking at.
   A simple question had been given an extra fact, "WW2" was marked wrong
   against "the Second World War", and one sentence about towns was also
   counted as "industrial areas". NEXT then repeated the summary.

   Saved replies, no network. The marker is deliberately too generous, which
   is what the live model did, and the rules have to undo that.
     node test-mark-points.js
   The colour check still has to pass:
     node test-mark-colours.js
*/
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.REDIS_URL;
delete process.env.MOCK_AI;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-points-'));

const {
  gradeCheck, setMarker, questionWriterSystem, criticSystem, takeCriticMarks, asksOneFact
} = require('./server');

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (info ? '   <- ' + info : '')); }
}

const TOPIC = 'World War Two';
const QUESTIONS = [
  'Who was the leader of Germany during World War Two?',
  'What was the name of the big war fought between countries in Europe and beyond?',
  'Why did Britain join World War Two?',
  'What was the Blitz, a time when German planes bombed cities?',
  'How did the end of World War Two change the world?'
];
const MARKS = [
  ['Adolf Hitler was the leader of Germany', 'He was the dictator of Nazi Germany'],
  ['The big war fought between countries in Europe and beyond was called World War Two', 'It was also known as the Second World War'],
  ['Britain joined World War Two after Germany invaded Poland', 'Germany invaded Poland in September 1939'],
  ['The Blitz was a sustained bombing campaign by Germany against Britain', 'It primarily targeted cities and industrial areas'],
  ['The end of World War Two led to the formation of the United Nations', 'It also resulted in the division of Germany and the beginning of the Cold War', 'The war led to a significant shift in global power dynamics']
];
const ANSWERS = [
  'adolf hitler',
  'WW2',
  'idk',
  'the blitz was a sustained attack town/cities in the uk by the german air force',
  'not sure'
];

function transcript(questions, answers) {
  return questions.map((q, i) => 'Examiner: ' + q + '\nStudent: ' + answers[i]).join('\n');
}

/* The live model ticked every point it was shown whenever the answer was in
   the right area, including facts the sentence does not contain. */
let graderPrompt = '';
setMarker((messages) => {
  const sys = (messages || []).map(m => (m && m.role === 'system' ? String(m.content || '') : '')).join('\n');
  const user = (messages || []).filter(m => m.role === 'user').map(m => String(m.content || '')).join('\n');
  if (/Which of these points/.test(sys)) graderPrompt = sys;
  if (user.startsWith('Transcript:')) {
    if (/becomes 3\/8/.test(user)) {
      return JSON.stringify({
        level: 'amber', gotRight: ['changed 4 to 8'], gets: 'some of the steps', shaky: 'the method',
        faked: false, notes: 'They changed a number.',
        nextStep: 'The pupil has a basic understanding of fractions.'
      });
    }
    if (/3 becomes 6 and 4 becomes 8/.test(user)) {
      return JSON.stringify({
        level: 'green', gotRight: ['the method'], gets: 'the method', shaky: '',
        faked: false, notes: 'Right method.', nextStep: 'Move on.'
      });
    }
    return JSON.stringify({
      level: 'amber', gotRight: ['some names'], gets: 'some of the names', shaky: 'the causes',
      faked: false,
      notes: 'The student has some knowledge of WW2 but needs to develop a more complete understanding of the causes and consequences of the war.',
      nextStep: 'The pupil has a basic understanding of some key figures and events of WW2.'
    });
  }
  const saidRaw = user.replace(/^The pupil answered:\s*/, '');
  const said = saidRaw.toLowerCase();
  if (/leave the 3 the same/.test(said)) return JSON.stringify({ shown: [2], reason: false });
  if (/leave the 2 alone/.test(said)) return JSON.stringify({ shown: [6], reason: false });
  if (/^because 4 is bigger than 3/.test(said)) return JSON.stringify({ shown: [], reason: false });
  if (/3 becomes 6 and 4 becomes 8/.test(said)) return JSON.stringify({ shown: [1, 2], reason: true });
  if (/quarter is bigger than a third/.test(said)) return JSON.stringify({ shown: [3, 4], reason: true });
  if (/2 becomes 4 and 3 becomes 6/.test(said)) return JSON.stringify({ shown: [5, 6], reason: true });
  const nums = [...sys.matchAll(/^(\d+)\.\s/gm)].map(m => Number(m[1]));
  let shown = [];
  if (said.includes('hitler') || said.includes('blitz') || said.includes('cities')) shown = nums;
  return JSON.stringify({ shown, reason: false });
});

(async () => {
  check('who-question is one fact', asksOneFact(QUESTIONS[0]));
  check('name-question is one fact', asksOneFact(QUESTIONS[1]));
  check('why-question is not one fact', !asksOneFact(QUESTIONS[2]));
  check('blitz definition is not forced to one point', !asksOneFact(QUESTIONS[3]));
  check('a sum is not treated as a name', !asksOneFact('What is 1/4 + 1/4?'));

  const who = takeCriticMarks(QUESTIONS[0], MARKS[0]);
  check('critic keeps the name and drops the dictator point',
    who && who.length === 1 && /hitler/i.test(who[0]) && !/dictator/i.test(who[0]),
    JSON.stringify(who));
  check('critic will not thin a why question down to one point',
    takeCriticMarks(QUESTIONS[2], ['Germany invaded Poland']) === null);
  const whyKept = takeCriticMarks(QUESTIONS[2], MARKS[2]);
  check('critic keeps two real reasons', whyKept && whyKept.length === 2, JSON.stringify(whyKept));
  check('critic will not thin a fraction sum down to one point',
    takeCriticMarks('What is 1/4 + 1/4?', ['says one half']) === null);
  const frac = takeCriticMarks('What is 1/4 + 1/4?', ['says one half', 'adds the top numbers']);
  check('critic still accepts both fraction points', frac && frac.length === 2, JSON.stringify(frac));

  const y9 = questionWriterSystem('World War Two', 5, 'Year 9');
  check('Year 9 questions are pitched at Year 9', /The class is Year 9/.test(y9) && /not at a ten-year-old/.test(y9));
  check('questions must not just repeat the topic', /does not already give away/.test(y9));
  check('a one-fact question is one point in the writer rules', /ONE\s+fact has ONE point/.test(y9));
  check('the writer no longer demands two points for every short answer', !/still gets TWO points/.test(y9));
  const y5 = questionWriterSystem('World War Two', 5, 'Year 5');
  check('Year 5 is not pushed up to GCSE', !/not at a ten-year-old/.test(y5) && /does not already give away/.test(y5));
  const critic = criticSystem('Comparing fractions', '1. Question: which is bigger?');
  check('critic still checks the maths', /denominators are the same/.test(critic) && /1\/2 or 1\/4/.test(critic));
  check('critic no longer tells every question to invent a working point', !/plus the WORKING/.test(critic));
  check('new prompts do not use an em dash', !/[\u2014\u2013]/.test(y9 + critic));

  const v = await gradeCheck(TOPIC, transcript(QUESTIONS, ANSWERS), QUESTIONS, MARKS, 'Year 9');
  const ev = v.evidence || [];
  const q1 = ev[0], q2 = ev[1], q3 = ev[2], q4 = ev[3], q5 = ev[4];
  const texts = (e) => (e && e.points || []).map(p => p.t).join(' | ');

  check('leader question has one point', q1 && q1.points.length === 1, texts(q1));
  check('that point is Hitler, hit in full', q1 && q1.got === q1.total && q1.points[0].hit && /hitler/i.test(q1.points[0].t) && !/dictator/i.test(texts(q1)));
  check('the war\'s name is one point', q2 && q2.points.length === 1, texts(q2));
  check('WW2 gets full credit for World War Two', q2 && q2.got === q2.total && q2.points[0].hit, JSON.stringify(q2 && q2.points));
  check('Second World War is not a second missed point', q2 && !/also known as/i.test(texts(q2)));
  check('the why question still has both reasons', q3 && q3.points.length === 2 && q3.got === 0, texts(q3));
  check('towns and cities do not tick industrial areas',
    q4 && q4.points.length === 2 && q4.points[0].hit && !q4.points[1].hit && !q4.points[1].said,
    JSON.stringify(q4 && q4.points));
  check('the padded total is gone', v.pointsTotal < 11 && v.pointsHit === 3, v.pointsHit + '/' + v.pointsTotal);
  check('something was shown on the three answered questions', v.shown === 3 && v.qs === 5, v.shown + ' of ' + v.qs);

  const nextBlob = (v.nextStep || '') + ' ' + (v.nextTry || '');
  check('NEXT is a recap, not the summary', v.nextStep && /^Next: recap\b/i.test(v.nextStep) && !/basic understanding/i.test(v.nextStep), v.nextStep);
  check('NEXT names why Britain joined', /britain join/i.test(nextBlob) && /poland/i.test(nextBlob), nextBlob);
  check('NEXT line is under 10 words', v.nextStep && v.nextStep.split(/\s+/).filter(Boolean).length <= 10, v.nextStep);
  check('NEXT has no em dash', nextBlob && !/[\u2014\u2013]/.test(nextBlob));
  check('the end-of-war misses are still on the card', q5 && q5.got === 0 && q5.points.length === 3);

  const named = ANSWERS.slice();
  named[1] = 'the Second World War';
  const v2 = await gradeCheck(TOPIC, transcript(QUESTIONS, named), QUESTIONS, MARKS, 'Year 9');
  const namePoint = ((v2.evidence || [])[1] || {}).points || [];
  check('Second World War counts for the World War Two point', namePoint.length === 1 && namePoint[0].hit, JSON.stringify(namePoint));

  /* KS3 equivalent fractions. The marker ticks the denominator step even when
     the pupil left the numerator alone. That is a wrong method, not a point. */
  const FQ = [
    'How can you make 3/4 the same as 6/8?',
    'Why is 3/4 bigger than 2/3?',
    'What does 2/3 look like if you cut it into sixths?'
  ];
  const FM = [
    ['makes 3 into 6', 'makes 4 into 8'],
    ['3/4 is bigger than 2/3', 'a quarter is bigger than a third'],
    ['makes 2 into 4', 'makes 3 into 6']
  ];
  const wrongAns = [
    'Change the 4 into 8 and leave the 3 the same, so 3/4 becomes 3/8',
    'Because 4 is bigger than 3',
    'It becomes 2/6: I double the denominator from 3 to 6, but leave the 2 alone'
  ];
  const rightAns = [
    'Times the top and the bottom by 2. 3 becomes 6 and 4 becomes 8, so 3/4 is the same as 6/8.',
    'A quarter is bigger than a third, so 3/4 is bigger than 2/3.',
    'Split each piece into 2. 2 becomes 4 and 3 becomes 6, so 2/3 is 4/6.'
  ];
  const wrong = await gradeCheck('Equivalent fractions', transcript(FQ, wrongAns), FQ, FM, 'Year 8');
  const wrongHit = (wrong.evidence || []).flatMap(e => (e.points || []).filter(p => p.hit).map(p => p.t));
  check('denominator-only method does not tick makes 4 into 8', !wrongHit.some(t => /makes 4 into 8/i.test(t)), JSON.stringify(wrongHit));
  check('denominator-only method does not tick makes 3 into 6', !wrongHit.some(t => /makes 3 into 6/i.test(t)), JSON.stringify(wrongHit));
  check('a sheet of misconceptions is red', wrong.level === 'red', wrong.level);
  check('grader prompt refuses a denominator-only step', /denominator/i.test(graderPrompt) && /3\/8/.test(graderPrompt), graderPrompt.slice(0, 240));

  const right = await gradeCheck('Equivalent fractions', transcript(FQ, rightAns), FQ, FM, 'Year 8');
  const rightHit = (right.evidence || []).flatMap(e => (e.points || []).filter(p => p.hit).map(p => p.t));
  check('a correct equivalent stays green', right.level === 'green', right.level);
  check('a correct method still ticks makes 4 into 8', rightHit.some(t => /makes 4 into 8/i.test(t)), JSON.stringify(rightHit));
  check('a correct method still ticks makes 3 into 6', rightHit.some(t => /makes 3 into 6/i.test(t)), JSON.stringify(rightHit));
  check('green does not also ask for a recap', !right.nextStep, right.nextStep);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
