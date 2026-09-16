// The spelling card that came back 6 of 10 amber: 5 questions, all answered, no follow-up.
const { spawn } = require('child_process');
const path = require('path');
const PORT = 4683;
const QUESTIONS = [
  'What is spelling, in your own words?',
  'How do you check if a word is spelled right?',
  'What is a silent letter in a word?',
  'Tell me a spelling rule you know.',
  'What makes a word tricky to spell?'
];
const MARKS = [
  ['Spelling is writing words with the right letters', 'It means getting the letters in the correct order'],
  ['You can look it up in a book or on a computer', 'You can sound it out carefully'],
  ['A letter that you cannot hear when you say the word', "It is in the word but you don't make a sound for it"],
  ['A rule helps you spell words that sound the same', "Like 'i before e, except after c'"],
  ['Some letters sound the same, or some letters are quiet', 'It might have a tricky pattern of letters in it']
];
const TRANSCRIPT = [
  'Examiner: Hi! A few quick questions. Just say what you think - your own words are best.',
  'Student: ok',
  'Examiner: What is spelling, in your own words?',
  'Student: putting letters togethst to make a word',
  'Examiner: How do you check if a word is spelled right?',
  'Student: dictionary',
  'Examiner: What is a silent letter in a word?',
  'Student: a silent letter is a letter that is not pronounced even though its still in the word for instanse Gnome the G is silent',
  'Examiner: Tell me a spelling rule you know.',
  'Student: i before e except after x',
  'Examiner: What makes a word tricky to spell?',
  'Student: the lojnger they are',
  'Examiner: Great - that is everything I needed. Thank you for thinking it through!'
].join('\n');

const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/health`); break; } catch { await wait(300); } }
  const r = await fetch(`http://127.0.0.1:${PORT}/api/verdict`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'spelling', marks: MARKS, questions: QUESTIONS, transcript: TRANSCRIPT })
  });
  const j = JSON.parse(await r.text());
  const v = j.verdict || j;
  console.log('LEVEL:', v.level, '| points', v.pointsHit + '/' + v.pointsTotal, '| shown', v.shown, '| read:', v.readLevel || '-');
  (v.evidence || []).forEach(e => {
    console.log(` ${e.got}/${e.total} ${e.q}`);
    (e.points || []).forEach(p => console.log(`    ${p.hit ? 'YES' : 'no '} ${p.t} ${p.said ? '  <- ' + JSON.stringify(p.said) : ''}`));
  });
  srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
