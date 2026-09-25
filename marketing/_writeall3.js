/* The last three, held back by OpenRouter's in-flight budget (Retry-After 120).
 *   node marketing/_writeall3.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const JOBS = [
  ['before', 'Check they have got it before you move on, not months later in the mock.'],
  ['proof', 'When your head of department asks how you know the class got it, you can show names instead of nods.'],
  ['plainly', 'Explain what the product actually is to a teacher who has never heard of it, without the standard pitch.'],
];

/* cmd's `timeout` cannot take redirected input, so the pause lives here */
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

console.log('waiting out the in-flight budget...');
sleep(140000);

for (const [id, angle] of JOBS) {
  console.log('\n=== ' + id);
  const r = spawnSync(process.execPath, [path.join(__dirname, '_writescript.js'), angle, id],
    { stdio: 'inherit', cwd: __dirname });
  if (r.status !== 0) console.log('  !! ' + id + ' failed');
  sleep(25000);
}
console.log('\ndone');
