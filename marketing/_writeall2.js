/* The six ads that failed on the first pass (OpenRouter 402: max_tokens was
 * unset so it reserved 65536 tokens per call against the credit balance).
 *   node marketing/_writeall2.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const JOBS = [
  ['speak', 'Some pupils know the answer but will not write it down, so they get to say it instead.'],
  ['twominutes', 'Exit tickets tell you who is lost days later. This tells you while you can still reteach in the same lesson.'],
  ['cover', 'A cover teacher with no plan can still find out, in minutes, who followed the lesson and who did not.'],
  ['before', 'Check they have got it before you move on, not months later in the mock.'],
  ['proof', 'When your head of department asks how you know the class got it, you can show names instead of nods.'],
  ['plainly', 'Explain what the product actually is to a teacher who has never heard of it, without the standard pitch.'],
];

for (const [id, angle] of JOBS) {
  console.log('\n=== ' + id);
  const r = spawnSync(process.execPath, [path.join(__dirname, '_writescript.js'), angle, id],
    { stdio: 'inherit', cwd: __dirname });
  if (r.status !== 0) console.log('  !! ' + id + ' failed');
}
console.log('\ndone');
