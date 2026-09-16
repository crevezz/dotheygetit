/* After-run: confusion matrix + the evidence behind every miss. */
const fs = require('fs');
const code = process.argv[2];
const src = fs.readFileSync('eval/lesson-sim.js', 'utf8');
const profs = [];
const re = /\{ band: '(\w+)', who: '([^']+)', a: \[/g;
let m;
while ((m = re.exec(src))) profs.push({ band: m[1], who: m[2] });
const simq = (src.match(/const QUESTIONS = \[([\s\S]*?)\];/) || [])[1] || '';
console.log('sim questions:' + simq.replace(/\s+/g, ' '));
const db = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const cls = db.classes.find(c => c.code === code);
const ses = db.sessions.filter(s => s.classId === cls.id).pop();
console.log('check ' + ses.id + ': ' + JSON.stringify(ses.questions));
console.log('marks: ' + JSON.stringify(ses.marks) + '\n');
const order = ['green', 'amber', 'red'];
const rows = [];
for (let i = 0; i < 30; i++) {
  const p = profs[i % profs.length];
  const rec = ses.students.filter(s => s.name === cls.roster[i]).pop();
  const v = (rec || {}).verdict || {};
  rows.push({ name: cls.roster[i], band: p.band, who: p.who, level: v.level, hit: v.pointsHit, tot: v.pointsTotal, note: String(v.gets || ''), capped: v.cappedBy, ev: v.evidence || [] });
}
const grid = {};
for (const r of rows) grid[r.band + '->' + r.level] = (grid[r.band + '->' + r.level] || 0) + 1;
console.log('teacher band -> marker verdict');
for (const b of order) console.log('  ' + b.padEnd(6) + order.map(l => l + ':' + String(grid[b + '->' + l] || 0).padStart(2)).join('   '));
console.log('\nexact agreement: ' + rows.filter(r => r.level === r.band).length + '/30');
console.log('two bands out : ' + rows.filter(r => Math.abs(order.indexOf(r.level) - order.indexOf(r.band)) >= 2).length + '/30');
console.log('capped by the read (note said nothing): ' + rows.filter(r => r.capped).length + '/30');
console.log('\nreds the marker still passes:');
for (const r of rows.filter(r => r.band === 'red' && r.level !== 'red'))
  console.log('  ' + r.name.padEnd(8) + '-> ' + r.level.padEnd(6) + r.hit + '/' + r.tot + '  ' + r.who + '  note: "' + r.note.slice(0, 70) + '"');
console.log('\ngreens the marker drops:');
for (const r of rows.filter(r => r.band === 'green' && r.level !== 'green'))
  console.log('  ' + r.name.padEnd(8) + '-> ' + r.level + '  ' + r.hit + '/' + r.tot + '  ' + r.who);
for (const r of rows) {
  const wrong = r.ev.filter(e => e.points.some(p => p.hit && p.said));
  r.ev.forEach((e, qi) => e.points.forEach(p => {
    if (!p.hit || !p.said) return;
    const fracs = s => (String(s).toLowerCase().match(/\d+\/\d+/g) || []);
    const need = fracs(p.t).filter(f => !fracs(e.q).includes(f));
    const miss = need.filter(f => !fracs(p.said).includes(f) && !p.said.includes(f));
    if (miss.length) console.log('  ~ ' + r.name + ' Q' + (qi + 1) + ' "' + p.t.slice(0, 46) + '" needs ' + miss.join(',') + ' <- "' + p.said.slice(0, 60) + '"');
  }));
}
