// Same transcript, marked by the LOCAL server and by the LIVE site, side by side.
const QUESTIONS = [
  'What is the hardest spelling rule you know?',
  'Tell me a word that has a silent letter in it.',
  'How do you check if you have spelled a word correctly?',
  'What is a homophone, and can you give an example?',
  'Why is it important to spell words the same way every time?'
];
const MARKS = [
  ['A spelling rule that is hard to remember', 'A reason why that rule is hard'],
  ['A word with a silent letter', 'The silent letter in that word'],
  ['You can look it up in a dictionary', 'You can ask someone who knows'],
  ['A word that sounds the same as another', 'An example word that sounds the same'],
  ['people understand what you mean', 'writing looks neat and tidy']
];
const TRANSCRIPT = [
  'Examiner: Hi! A few quick questions. Just say what you think - your own words are best.',
  'Examiner: What is the hardest spelling rule you know?',
  'Student: i before e ecept after c',
  "Examiner: Can you say why 'except' breaks that rule?",
  'Student: it doesnt have a I in it',
  'Examiner: Tell me a word that has a silent letter in it.',
  'Student: except',
  'Examiner: How do you check if you have spelled a word correctly?',
  'Student: dictionary',
  'Examiner: What is a homophone, and can you give an example?',
  'Student: dont know',
  'Examiner: Why is it important to spell words the same way every time?',
  'Student: so people understand them',
  'Examiner: Great - that is everything I needed. Thank you for thinking it through!'
].join('\n');

(async () => {
  for (const where of ['http://127.0.0.1:4590', 'https://app.dotheygetit.app']) {
    try {
      const r = await fetch(where + '/api/verdict', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: 'spelling', marks: MARKS, questions: QUESTIONS, transcript: TRANSCRIPT })
      });
      const j = JSON.parse(await r.text());
      const v = j.verdict || j;
      console.log(where.padEnd(28), 'LEVEL', v.level, '| points', v.pointsHit + '/' + v.pointsTotal, '| shown', v.shown);
    } catch (e) { console.log(where.padEnd(28), 'ERR', e.message); }
  }
})();
