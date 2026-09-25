/* Regenerates the ten ad scripts one after another.
 * Sequential on purpose: each new script sees the ones already regenerated in
 * its "already used, do not reuse" list, so the set pulls apart as it goes.
 *   node marketing/_writeall.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const JOBS = [
  ['nod', "The whole class nodded along, and the next lesson proved half of them hadn't got it."],
  ['quiet', 'The same few pupils always answer, so you never find out what the quiet ones actually know.'],
  ['ninepm', 'The late-night marking pile that still does not tell you who followed the lesson.'],
  ['middle', 'The pupils in the unsure middle get no attention because the teacher cannot see who they are.'],
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
