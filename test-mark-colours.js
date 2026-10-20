/* Offline marking check.
   Default: no API key and no calls out. The model replies are the ones that
   explain the live 15-pupil run (a wrong sum still ticked "adds the tops",
   "two quarters" was not read as a half, a fair explanation in the pupil's
   own words was not given the teacher's phrase, and the overall read said
   amber). The rules have to land the right colour from those replies.

   With a real key, the same pupils are marked by the real model:
     node test-mark-colours.js --live
   The key is the one the app already uses: key.txt in this folder, or
   GEMINI_API_KEY, or OPENROUTER_API_KEY. Do not commit the key.
   Temperature stays 0, same as the live site. */
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.REDIS_URL;
delete process.env.MOCK_AI;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-mark-'));

const { gradeCheck, setMarker } = require('./server');

const LIVE = process.argv.includes('--live');
const TOPIC = 'Adding fractions with the same bottom';
const QUESTIONS = [
  'What is 1/4 + 1/4?',
  'What is 1/2 + 1/4?',
  'Why do you only add the top numbers when the bottoms match?'
];
const MARKS = [
  ['says one half', 'adds the top numbers'],
  ['says three quarters', 'adds the top numbers'],
  ['the bottoms already match', 'the bottom is the size of each piece']
];

function read(level, gets) {
  return { level, gotRight: [gets], gets, shaky: '', faked: false, notes: '', nextStep: '' };
}
function ans(shown, reason) { return { shown, reason: !!reason }; }

/* Point numbers are the ones the marker is shown: 1 and 2 on the first sum,
   3 and 4 on the second, 5 and 6 on the why. */
const FRACTION = [
  { name: 'Amira K', expect: ['green'], noReason: false,
    answers: ['1/2', '3/4', 'Because the bottoms are the same, so you just add the tops.'],
    byAnswer: {
      '1/2': ans([1, 2], false),
      '3/4': ans([3, 4], false),
      'Because the bottoms are the same, so you just add the tops.': ans([5], true)
    },
    read: read('green', 'Both sums, and the bottoms stay the same.') },
  { name: 'Jack T', expect: ['green'], noReason: false,
    answers: ['one half', 'three quarters', 'The bottom number stays because the pieces are the same size.'],
    byAnswer: {
      'one half': ans([1, 2], false),
      'three quarters': ans([3, 4], false),
      'The bottom number stays because the pieces are the same size.': ans([6], true)
    },
    read: read('green', 'Right amounts, and the pieces are the same size.') },
  { name: 'Callum B', expect: ['green'], noReason: false,
    answers: ['2/4', '3/4', 'You add the numerators.'],
    byAnswer: {
      '2/4': ans([1, 2], false),
      '3/4': ans([4], false),
      'You add the numerators.': ans([], true)
    },
    read: read('amber', 'The sums are right. The why is only the method.') },
  { name: 'Sofia R', expect: ['amber'],
    answers: ['a half', 'I think 3/4', 'Not sure, maybe because the bottom is already matching.'],
    byAnswer: {
      'a half': ans([1], false),
      'I think 3/4': ans([3], false),
      'Not sure, maybe because the bottom is already matching.': ans([], true)
    },
    read: read('amber', 'Right direction, but she is not sure.') },
  { name: 'Noah P', expect: ['red'],
    answers: ['1/4', '1/2', 'I added the bottoms too and got 2/8.'],
    byAnswer: {
      '1/4': ans([2], false),
      '1/2': ans([4], false),
      'I added the bottoms too and got 2/8.': ans([5], true)
    },
    read: read('amber', 'He had a go at the sums.') },
  { name: 'Layla H', expect: ['amber'],
    answers: ['2/4 which is 1/2', '2/6', 'I always add both numbers.'],
    byAnswer: {
      '2/4 which is 1/2': ans([1, 2], false),
      '2/6': ans([4], false),
      'I always add both numbers.': ans([], true)
    },
    read: read('amber', 'One sum is right and one is not.') },
  { name: 'Rhys D', expect: ['green'], noReason: false,
    answers: [
      'one half because 1+1 is 2 and the bottom stays 4',
      'three quarters, 1+2 is 3 and the bottom stays 4',
      'You only add the top when the bottoms match. The bottom tells you the size of the piece.'
    ],
    byAnswer: {
      'one half because 1+1 is 2 and the bottom stays 4': ans([1, 2], true),
      'three quarters, 1+2 is 3 and the bottom stays 4': ans([3, 4], true),
      'You only add the top when the bottoms match. The bottom tells you the size of the piece.': ans([5, 6], true)
    },
    read: read('green', 'Sums and the reason.') },
  { name: 'Isla M', expect: ['green'], noReason: false,
    answers: ['1/2', '3/4', 'Same bottom.'],
    byAnswer: {
      '1/2': ans([1, 2], false),
      '3/4': ans([4], false),
      'Same bottom.': ans([5], true)
    },
    read: read('amber', 'Short, but the sums are right.') },
  { name: 'Omar S', expect: ['green'], noReason: false,
    answers: ['half', 'three quarters', 'The pieces are the same size so you add how many you have.'],
    byAnswer: {
      'half': ans([1], false),
      'three quarters': ans([3, 4], false),
      'The pieces are the same size so you add how many you have.': ans([6], true)
    },
    read: read('green', 'Right amounts and the size of the pieces.') },
  { name: 'Grace L', expect: ['green'], noReason: false,
    answers: ['2/4', '3/4', 'The denominator stays the same.'],
    byAnswer: {
      '2/4': ans([1, 2], false),
      '3/4': ans([4], false),
      'The denominator stays the same.': ans([], true)
    },
    read: read('amber', 'The sums are right.') },
  { name: 'Tyler W', expect: ['green'], noReason: false,
    answers: ['1/2', '1/4 + 1/2 = 3/4', 'You cannot add the bottoms. They are the name of the fraction.'],
    byAnswer: {
      '1/2': ans([1, 2], false),
      '1/4 + 1/2 = 3/4': ans([], false),
      'You cannot add the bottoms. They are the name of the fraction.': ans([], true)
    },
    read: read('amber', 'He explained it in his own words.') },
  { name: 'Freya C', expect: ['red', 'amber'],
    answers: ['a half I think', 'bigger than a half', 'dunno miss'],
    byAnswer: {
      'a half I think': ans([1], false),
      'bigger than a half': ans([], false),
      'dunno miss': ans([], false)
    },
    read: read('amber', 'One hesitant half, then nothing solid.') },
  { name: 'Kai N', expect: ['green'], noReason: false,
    answers: ['two quarters', 'three quarters', 'The bottom is how many pieces the whole was cut into.'],
    byAnswer: {
      'two quarters': ans([], false),
      'three quarters': ans([3], false),
      'The bottom is how many pieces the whole was cut into.': ans([], true)
    },
    read: read('amber', 'Two quarters did not look like a half.') },
  { name: 'Megan F', expect: ['green'], noReason: false,
    answers: ['1/2', '3/4', 'If the bottoms match you add the tops and keep the bottom.'],
    byAnswer: {
      '1/2': ans([1, 2], false),
      '3/4': ans([4], false),
      'If the bottoms match you add the tops and keep the bottom.': ans([5], true)
    },
    read: read('green', 'Sums and the bottoms match.') },
  { name: 'Idris O', expect: ['green'], noReason: false,
    answers: ['one over two', 'three over four', 'Adding the bottoms would change the size of the piece, which is wrong.'],
    byAnswer: {
      'one over two': ans([], false),
      'three over four': ans([], false),
      'Adding the bottoms would change the size of the piece, which is wrong.': ans([6], true)
    },
    read: read('green', 'Both amounts, and the size of the piece.') }
];

const ADD_Q = ['What is 7 + 8?', 'What is 20 - 6?', 'Why can you add numbers in any order?'];
const ADD_M = [
  ['says 15', 'adds 7 and 8'],
  ['says 14', 'subtracts 6 from 20'],
  ['the order does not change the answer', 'you are combining the same amounts']
];
const EXTRA = [
  { name: 'Wrong sums', topic: 'Adding and subtracting', questions: ADD_Q, marks: ADD_M, expect: ['red'],
    answers: ['12', '10', 'no idea'],
    byAnswer: { '12': ans([2], false), '10': ans([4], false), 'no idea': ans([], false) },
    read: read('amber', 'Close, but the answers are wrong.'),
    sumsClear: true },
  { name: 'Right sums, no reason', topic: 'Adding and subtracting', questions: ADD_Q, marks: ADD_M,
    expect: ['green'], noReason: true,
    answers: ['15', '14', 'dunno'],
    byAnswer: { '15': ans([], false), '14': ans([], false), 'dunno': ans([], false) },
    read: read('amber', 'The numbers are right and that is all.') },
  { name: 'Right sums, own words', topic: 'Adding and subtracting', questions: ADD_Q, marks: ADD_M,
    expect: ['green'], noReason: false,
    answers: ['15', '14', 'You can swap them and you still have the same amounts.'],
    byAnswer: {
      '15': ans([], false), '14': ans([], false),
      'You can swap them and you still have the same amounts.': ans([], true)
    },
    read: read('amber', 'Right, explained another way.') },
  { name: 'Right sums, wrong idea', topic: TOPIC, questions: QUESTIONS, marks: MARKS, expect: ['red'],
    answers: ['1/2', '3/4', 'You add the bottoms together. That is the way.'],
    byAnswer: {
      '1/2': ans([1, 2], false),
      '3/4': ans([3, 4], false),
      'You add the bottoms together. That is the way.': ans([], true)
    },
    read: read('red', 'The sums happened to be right. The idea is the wrong one.') },
  { name: 'Every point, harsh read', topic: TOPIC, questions: QUESTIONS, marks: MARKS, expect: ['green'], noReason: false,
    answers: ['1/2', '3/4', 'The bottoms already match. The bottom is the size of each piece.'],
    byAnswer: {
      '1/2': ans([1, 2], false),
      '3/4': ans([3, 4], false),
      'The bottoms already match. The bottom is the size of each piece.': ans([5, 6], true)
    },
    read: read('red', 'A harsh read of a full answer.') },
  { name: 'Blank read', topic: TOPIC, questions: QUESTIONS, marks: MARKS, expect: ['red'],
    answers: ['1/4', '1/2', 'I added the bottoms too and got 2/8.'],
    byAnswer: {
      '1/4': ans([2], false),
      '1/2': ans([4], false),
      'I added the bottoms too and got 2/8.': ans([5], true)
    },
    read: null },
  { name: 'Romans, own words', topic: 'Why the Romans left Britain',
    questions: ['Why did the Romans leave Britain?'],
    marks: [['the army was needed back home', 'Britain was costing more than it was worth']],
    expect: ['green'], noReason: false,
    answers: ['They had to take the soldiers back because of trouble at home, and it was expensive to stay.'],
    byAnswer: {
      'They had to take the soldiers back because of trouble at home, and it was expensive to stay.': ans([], true)
    },
    read: read('green', 'The army went home and Britain cost too much.') },
  { name: 'Romans, no idea', topic: 'Why the Romans left Britain',
    questions: ['Why did the Romans leave Britain?'],
    marks: [['the army was needed back home', 'Britain was costing more than it was worth']],
    expect: ['red'],
    answers: ['I do not know. Maybe the weather.'],
    byAnswer: { 'I do not know. Maybe the weather.': ans([], false) },
    read: read('red', 'No answer.') }
];

function transcript(questions, answers) {
  return questions.map((q, i) => 'Examiner: ' + q + '\nStudent: ' + answers[i]).join('\n');
}

function hasKey() {
  if (String(process.env.GEMINI_API_KEY || '').trim()) return true;
  if (String(process.env.OPENROUTER_API_KEY || '').trim()) return true;
  return fs.existsSync(path.join(__dirname, 'key.txt'));
}

(async () => {
  const cases = FRACTION.map(c => Object.assign({ topic: TOPIC, questions: QUESTIONS, marks: MARKS }, c)).concat(EXTRA);
  const temps = [];
  let current = null;
  if (!LIVE) {
    setMarker((messages, opts) => {
      temps.push(opts && opts.temperature);
      const user = (messages || []).filter(m => m.role === 'user').map(m => String(m.content || '')).join('\n');
      if (user.startsWith('Transcript:')) return current.read ? JSON.stringify(current.read) : '{}';
      const said = user.replace(/^The pupil answered:\s*/, '');
      const row = current.byAnswer[said];
      if (!row) throw new Error('No saved reply for ' + current.name + ': ' + JSON.stringify(said));
      return JSON.stringify(row);
    });
  } else if (!hasKey()) {
    console.log('No marking key on this machine.');
    console.log('The check with saved replies needs no key:');
    console.log('  node test-mark-colours.js');
    console.log('To mark these same pupils with the real model, put the key in key.txt');
    console.log('(the file the app already reads) or set GEMINI_API_KEY, then run:');
    console.log('  node test-mark-colours.js --live');
    process.exit(2);
  } else {
    console.log('Live model. Same pupils, real marking, temperature 0.');
  }

  console.log(LIVE ? 'Marking check: real model' : 'Marking check: saved replies, no model call');
  let pass = 0, fail = 0;
  for (const c of cases) {
    current = c;
    const v = await gradeCheck(c.topic, transcript(c.questions, c.answers), c.questions, c.marks, 'Year 7');
    const okLevel = c.expect.includes(v.level);
    let okReason = true;
    if (c.noReason != null) okReason = !!v.noReason === c.noReason;
    let okSums = true;
    if (c.name === 'Noah P' || c.sumsClear) {
      const sums = (v.evidence || []).slice(0, 2);
      okSums = sums.every(e => (e.points || []).every(p => !p.hit));
    }
    let okKai = true;
    if (c.name === 'Kai N') {
      const q1 = (v.evidence || [])[0];
      okKai = !!(q1 && q1.points && q1.points[0] && q1.points[0].hit);
    }
    let okThree = true;
    if (c.name === 'Amira K') {
      const q2 = (v.evidence || [])[1];
      okThree = !!(q2 && q2.points && q2.points[0] && q2.points[0].hit);
    }
    const ok = okLevel && okReason && okSums && okKai && okThree;
    if (ok) pass++; else fail++;
    const bits = [v.level];
    if (v.noReason) bits.push('no reason');
    if (!okLevel) bits.push('wanted ' + c.expect.join(' or '));
    if (!okReason) bits.push(c.noReason ? 'missing no-reason flag' : 'flagged no reason');
    if (!okSums) bits.push('a wrong sum still has a tick');
    if (!okKai) bits.push('two quarters was not read as a half');
    if (!okThree) bits.push('3/4 was not kept as three quarters');
    console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  ' + c.name.padEnd(22) + ' ' + bits.join(', '));
  }
  if (!LIVE && temps.some(t => t !== 0)) {
    fail++;
    console.log('  FAIL  temperature was not 0 on every mark');
  } else if (!LIVE) {
    pass++;
    console.log('  OK    temperature 0 on every saved mark (' + temps.length + ' calls)');
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
