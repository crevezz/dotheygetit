// Re-grade Craig's exact spelling card: do the correct single-word answers credit now?
const { spawn } = require('child_process');
const path = require('path');
const PORT = 4673;

const QUESTIONS = [
  "What is the first letter in the word 'apple'?",
  "Spell the word 'cat'.",
  'How do you spell the sound a dog makes?',
  "Spell the word 'happy'.",
  "What is the last letter in the word 'banana'?"
];
const MARKS = [
  ['knows the first letter', "knows the word 'apple'"],
  ["says 'c-a-t'", 'spells the word correctly'],
  ["says 'woof' or 'bark'", 'spells the sound correctly'],
  ["says 'h-a-p-p-y'", 'spells the word correctly'],
  ['knows the last letter', "knows the word 'banana'"]
];
const TRANSCRIPT = [
  "Examiner: What is the first letter in the word 'apple'?", 'Student: A',
  "Examiner: Spell the word 'cat'.", 'Student: Cat',
  'Examiner: How do you spell the sound a dog makes?', 'Student: bark',
  "Examiner: Spell the word 'happy'.", 'Student: happy',
  "Examiner: What is the last letter in the word 'banana'?", 'Student: a'
].join('\n');

const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 30; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/verdict`); break; } catch { await wait(300); } }
  const r = await fetch(`http://127.0.0.1:${PORT}/api/verdict`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'level 1 spelling', marks: MARKS, questions: QUESTIONS, transcript: TRANSCRIPT })
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt).verdict || JSON.parse(txt); } catch { console.log('RAW:', txt.slice(0, 500)); srv.kill(); process.exit(1); }
  console.log('LEVEL:', j.level, '| points', j.pointsHit + '/' + j.pointsTotal, '| shown', j.shown);
  (j.evidence || []).forEach((e, i) => {
    console.log(`Q${i + 1} ${e.got}/${e.total}  ${e.question}`);
    (e.points || []).forEach(p => console.log(`   ${p.hit ? 'yes' : 'no '} ${p.text}${p.quote ? '  "' + p.quote + '"' : ''}`));
  });
  srv.kill();
  process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
