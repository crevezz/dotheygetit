// The spelling check that came back 0 of 10, with the follow-up question in the middle.
const { spawn } = require('child_process');
const path = require('path');
const PORT = 4681;
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
  'Student: ok',
  'Examiner: What is the hardest spelling rule you know?',
  'Student: i before e exepct after c',
  'Examiner: What does the silent letter in \'knight\' do?',
  'Student: silences the K',
  'Examiner: Tell me a word that has a silent letter in it.',
  'Student: phone',
  'Examiner: How do you check if you have spelled a word correctly?',
  'Student: dictionary',
  'Examiner: What is a homophone, and can you give an example?',
  'Student: i dont know',
  'Examiner: Why is it important to spell words the same way every time?',
  'Student: so people understand them',
  'Examiner: Great - that is everything I needed. Thank you for thinking it through!'
].join('\n');

const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/verdict`); break; } catch { await wait(300); } }
  const r = await fetch(`http://127.0.0.1:${PORT}/api/verdict`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'spelling', marks: MARKS, questions: QUESTIONS, transcript: TRANSCRIPT })
  });
  const j = JSON.parse(await r.text());
  const v = j.verdict || j;
  console.log('LEVEL:', v.level, '| points', v.pointsHit + '/' + v.pointsTotal, '| shown', v.shown);
  (v.evidence || []).forEach(e => console.log(` ${e.got}/${e.total} ${e.q}`));
  srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
