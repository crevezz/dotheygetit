// Hand-written rebuild of all 10 ads on the approved quiet spine.
const fs = require('fs');
const END = { seconds: 3, onscreen: 'dotheygetit.app', vo: 'Free. Nothing to install. dotheygetit dot app.', visual: 'end card' };
const T3 = { seconds: 4, onscreen: 'Type a topic. It writes the questions.', vo: 'Get It? You type the topic. It writes the questions.', visual: 'laptop' };
const ads = {
  quiet: { h: [['Hands up. Always them.', 'Same three hands. Ellie. Sam. Noah.', ['Ellie','Sam','Noah'], 1], ['The answer nobody heard.', 'Maya knows the answer. She would never say it out loud.', ['Maya']]],
    ans: 'Every pupil answers privately, on any device.', q: 'Why does it eventually rain?', a: 'The droplets get too heavy.', res: ['Maya','Sam','Noah'], rs: 'Marked. Sorted. Instantly.' },
  nod: { h: [['"Any questions?" Silence.', 'Any questions? Silence. Leo nods. Mia nods. Sam nods.', ['Leo','Mia','Sam']], ["A nod isn't an answer.", 'Next lesson, Leo writes three x plus four.', ['Leo']]],
    ans: 'Every pupil answers privately, on any device. Nobody can nod.', q: 'Expand 3(x + 4)', a: '3x + 12', res: ['Mia','Sam','Leo'] },
  ninepm: { h: [['30 books. 9pm.', 'Thirty books. Nine p.m. Ella. Josh. Ruby.', ['Ella','Josh','Ruby']], ["Still don't know who got it.", 'And you still do not know who got it.', ['Ruby']]],
    ans: 'Every pupil answers privately, on any device.', q: 'What does Lady Macbeth want?', a: 'For Macbeth to kill the king.', res: ['Ella','Josh','Ruby'] },
  twominutes: { h: [['Exit tickets. Read at 10pm.', 'Exit tickets. Read at ten p.m. Zara. Ben. Finn.', ['Zara','Ben','Finn']], ['Useless by then.', 'By then, Finn has gone home confused.', ['Finn']]],
    ans: 'Every pupil answers privately, on any device. Mid-lesson.', q: 'What is 2/5 of 30?', a: '12', res: ['Zara','Ben','Finn'] },
  middle: { h: [['You know your top five and bottom five.', 'You know your top five. You know your bottom five.', ['Ava','Jake','Lily']], ['Name the middle.', 'Now name the middle. Harry?', ['Harry']]],
    ans: 'Every pupil answers privately, on any device.', q: 'Which is bigger: 2/3 or 7/10?', a: '7/10', res: ['Ava','Harry','Jake'] },
  cover: { h: [['Cover lesson. Not your subject.', 'Cover lesson. Not your subject. One sticky note.', ['Year 9','Science','Cover']], ['Did they get it? No idea.', 'Did Poppy get it? You will never know.', ['Poppy']]],
    ans: 'Every pupil answers privately, on any device.', q: 'What does a plant need for photosynthesis?', a: 'Light, water and carbon dioxide.', res: ['Ethan','Poppy','Alfie'] },
  proof: { h: [['"How do you know they got it?"', 'How do you know they got it? Your head of department.', ['Head of department']], ['"They seemed fine" isn\'t proof.', 'They seemed fine is not an answer. Did Oscar get it?', ['Oscar']]],
    ans: 'Every pupil answers privately, on any device.', q: 'What triggered the war in 1914?', a: 'The assassination of Franz Ferdinand.', res: ['Amelia','Oscar','Daniel'], rs: 'Evidence. By name.' },
  before: { h: [["Don't find out in the mock.", 'Do not find out in the mock. Evie. Jess. Kyle.', ['Evie','Jess','Kyle']], ['March is too late.', 'In March, Kyle\'s paper shows he never got it.', ['Kyle']]],
    ans: 'Every pupil answers privately, on any device. Today.', q: 'What does a catalyst do?', a: 'Speeds up the reaction.', res: ['Evie','Jess','Kyle'] },
  speak: { h: [['He can explain it perfectly.', 'Callum can explain erosion perfectly.', ['Callum'], 1], ["He just won't write it.", 'He just will not write it down.', ['Callum']]],
    ans: 'Every pupil answers privately, on any device. Callum just says it.', q: 'How does the sea wear away rock?', a: 'It throws stones at the cliff.', mode: 'speak', res: ['Callum','Nia','Rhys'] },
  plainly: { h: [['Cold calling.', 'Cold calling. Aisha. Tom. Grace.', ['Aisha','Tom','Grace']], ['Without the cold.', 'Tom freezes. Everyone watches.', ['Tom']]],
    ans: 'Every pupil answers privately, on any device. Nobody on the spot.', q: 'Which way does the water move?', a: 'From more water to less water.', res: ['Aisha','Tom','Grace'] },
};
let over = 'const OVERRIDES = {\n', par = 'const PARAMS = {\n', names = {};
for (const [id, d] of Object.entries(ads)) {
  const [g, a, r] = d.res;
  const beats = [
    { seconds: 3, onscreen: d.h[0][0], vo: d.h[0][1], visual: 'chips' },
    { seconds: 3, onscreen: d.h[1][0], vo: d.h[1][1], visual: 'chips quiet' },
    T3,
    { seconds: 3, onscreen: 'Every pupil answers. Any device.', vo: d.ans, visual: 'tablet' },
    { seconds: 4, onscreen: d.rs || 'Marked. Sorted. By name.', vo: `It marks every answer. ${g} got it. ${a} is unsure. ${r} needs help.`, visual: 'results' },
    END,
  ];
  fs.writeFileSync('scripts/' + id + '.json', JSON.stringify({ id, total_seconds: 20, beats }, null, 2));
  over += `  ${id}: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },\n`;
  const p = { 0: { chips: d.h[0][2] }, 1: { chips: d.h[1][2], quiet: 1 }, 3: { q: d.q, answer: d.a, mode: d.mode || 'type', tab: 1 }, 4: { hl: d.res }, 5: { min: 1 } };
  if (d.h[0][3]) p[0].hand = 1;
  par += `  ${id}: ${JSON.stringify(p)},\n`;
  names[id] = { g: [g, 'Isla', 'Omar', 'Kai', 'Priya'], a: [a, 'Layla', 'Idris', 'Elsie', 'Nia'].filter((x, i, s) => s.indexOf(x) === i), r: [r, 'Sofia', 'Grace', 'Tyler', 'Freya'].filter((x, i, s) => s.indexOf(x) === i) };
}
over += '};\n'; par += '};\n';
let c = fs.readFileSync('beats.config.js', 'utf8');
c = c.replace(/const OVERRIDES = \{[\s\S]*?\n\};\n/, over);
c = c.replace(/const PARAMS = \{[\s\S]*?\};\n/, par);
c = c.replace(/A\uFFFD|Â·/g, '·').replace(/ \uFFFD\?" /g, ' - ');
fs.writeFileSync('beats.config.js', c);
// names applied at runtime via cfgFor patch
if (!c.includes('NAMES_OVR')) {
  c = c.replace('function cfgFor(id) {\n  const c = Object.assign({}, base, per[id] || {});', 'const NAMES_OVR = ' + JSON.stringify(names) + ';\nfunction cfgFor(id) {\n  const c = Object.assign({}, base, per[id] || {});\n  if (NAMES_OVR[id]) c.names = NAMES_OVR[id];');
  fs.writeFileSync('beats.config.js', c);
}
const cf = require('./beats.config.js').cfgFor;
for (const id in ads) { const x = cf(id); console.log(id, Object.keys(x.params).length, x.cols.g.names[0], x.cols.a.names[0], x.cols.r.names[0]); }
