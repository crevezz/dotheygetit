/* Which run is this? Find the check with "105 + 7" in the local store and print, for each
   pupil, what they actually typed and what came back. */
const fs = require('fs');
const store = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const hits = store.sessions.filter(s => JSON.stringify(s.questions || []).includes('105 + 7'));
console.log('sessions with that question:', hits.length);
for (const s of hits) {
  console.log('\n=== ' + s.topic + '  id=' + s.id + '  ' + new Date(s.createdAt).toLocaleString() +
    '  pupils=' + (s.students || []).length);
  console.log('    marks: ' + JSON.stringify(s.marks));
  const last = (s.students || [])[s.students.length - 1];
  if (!last) continue;
  console.log('    last pupil: ' + last.name + '  level=' + ((last.verdict || {}).level) +
    '  points ' + ((last.verdict || {}).pointsHit) + '/' + ((last.verdict || {}).pointsTotal) +
    '  shown ' + ((last.verdict || {}).shown) + '/' + ((last.verdict || {}).qs));
  console.log('    transcript:');
  console.log(String(last.transcript || '').split('\n').map(l => '      ' + l).join('\n'));
}
