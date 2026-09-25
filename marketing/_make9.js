/* Rebuild the other nine ads in the "quiet" shape: hook, problem, type a topic,
   every pupil answers on any device, marked and sorted by name, then the domain.
   Writes scripts/<id>.json and replaces the OVERRIDES + PARAMS blocks. */
const fs = require('fs');
const D = __dirname;

/* hook scenes vary per ad so the feed doesn't look like ten of the same card */
const ADS = {
  before: {
    hook: 'text',
    beats: [
      ['The mock tells you in March.', 'The mock tells you who missed rates of reaction. In March.'],
      ['Or while you are still teaching it.', 'Or ask now, while the last slide is still up.'],
      ['Type a topic. It writes the questions.', 'Get It? You type the topic. It writes the questions.'],
      ['Every pupil answers. Any device.', 'Every pupil answers privately, on any device.'],
      ['Marked. Sorted. Instantly.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Check first, not in the mock. dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  cover: {
    hook: 'text',
    beats: [
      ['Period 4. One sticky note.', 'Year 9 science, on cover. The note says photosynthesis.'],
      ['No lesson plan. No science.', 'You teach French. No plan, no science.'],
      ['Type a topic. It writes the questions.', 'You type that word into Get It? It writes the questions.'],
      ['Every pupil answers. Any device.', 'Twenty-six pupils answer privately, on any device.'],
      ['Marked. Sorted. Even on cover.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Leave their teacher more than they were fine. dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  middle: {
    hook: 'classroom',
    beats: [
      ['Ninety pupils. One lesson.', 'Ninety Year 9 pupils. The lost ones, you spot. The flyers too.'],
      ['The middle drifts.', 'But the middle get two right, guess one, and stay quiet.'],
      ['Type a topic. It writes the questions.', 'Get It? You type the topic. It writes the questions.'],
      ['Every pupil answers. Any device.', 'Ninety pupils answer privately, on any device.'],
      ['Every name, including the middle.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Meet the middle at dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  ninepm: {
    hook: 'desk',
    beats: [
      ['21:06. Still at the table.', 'Six past nine. Thirty Macbeth essays, every apostrophe fixed.'],
      ['Neat margins. No answers.', 'Still no idea who followed Lady Macbeth plan.'],
      ['Type a topic. It writes the questions.', 'Get It? You type the topic. It writes the questions.'],
      ['Every pupil answers. Any device.', 'Asked in class, they answered privately, on any device.'],
      ['Already marked. Hours ago.', 'It marked every answer before you got home. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Put the red pen down. dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  nod: {
    hook: 'chips',
    chips: ['Leo', 'Mia', 'Sam'],
    beats: [
      ['Everyone happy with that?', 'Thirty nods. Leo. Mia. Sam. Everyone happy with that.'],
      ['A nod is not an answer.', 'Next lesson, three of them only multiplied the x.'],
      ['Type a topic. It writes the questions.', 'So Get It? puts four bracket questions on their phones.'],
      ['Every pupil answers. Any device.', 'You cannot nod at a phone. Every pupil answers privately, on any device.'],
      ['Every nod, checked.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Check the nods at dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  plainly: {
    hook: 'text',
    beats: [
      ['Sceptical is fair.', 'Heard saves time before? Fine. Watch.'],
      ['Type a topic. It writes the questions.', 'One word, osmosis, became these four questions.'],
      ['Every pupil answers. Any device.', 'Leo does not type. He tells his phone: towards more water. It arrives as text, with his name.'],
      ['Marked. Sorted. Instantly.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'That is it. Free. dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  proof: {
    hook: 'results',
    beats: [
      ['Department meeting. Your turn.', 'How do you know Year 10 got the causes?'],
      ['Impressions do not hold up.', 'They seemed engaged will not survive a follow-up.'],
      ['Type a topic. It writes the questions.', 'Last lesson, Get It? asked all twenty-eight which cause mattered most.'],
      ['Every pupil answers. Any device.', 'Every pupil answered privately, on any device.'],
      ['Evidence, sorted by name.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Walk in with names. dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
  speak: {
    hook: 'chips',
    chips: ['Callum'],
    beats: [
      ['One line. Underlined twice.', 'Callum erosion page: the date, underlined twice.'],
      ['Knows it. Will not write it.', 'Ask about the cliffs and he will not stop.'],
      ['Type a topic. It writes the questions.', 'In Get It?, erosion became four questions.'],
      ['Every pupil answers. Any device.', 'Callum does not type. He tells his phone: the sea chucks stones at the rock. It arrives as text.'],
      ['Placed with the eleven.', 'It marks every answer. Callum said abrasion. He is right.'],
      ['dotheygetit.app', 'Let them say it. dotheygetit dot app.'],
    ],
    hl: ['Callum'],
  },
  twominutes: {
    hook: 'text',
    beats: [
      ['A carrier bag of slips.', 'Exit tickets get read that evening.'],
      ['Too late to reteach.', 'By then, the lesson that could fix it is over.'],
      ['Type a topic. It writes the questions.', 'So, mid-lesson, Get It? puts four questions on their phones.'],
      ['Every pupil answers. Any device.', 'Every pupil answers privately, on any device.'],
      ['Same room. Same period.', 'It marks every answer. Noah got it. Layla is unsure. Amira needs help.'],
      ['dotheygetit.app', 'Reteach it today. dotheygetit dot app.'],
    ],
    hl: ['Noah', 'Layla', 'Amira'],
  },
};

const VIS = {
  text: 'big centred line, no picture',
  chips: 'name cards pop up with hands',
  classroom: 'the room, rows of pupils',
  desk: 'the kitchen table, late',
  results: 'the results screen',
};

for (const [id, a] of Object.entries(ADS)) {
  const scenes = [a.hook, ...Array(a.beats.length - 3).fill('text'), 'laptop', 'phone', 'results', 'domain'];
  /* last four beats are always laptop, phone, results, domain */
  const fixed = ['laptop', 'phone', 'results', 'domain'];
  const head = a.beats.length - 4;
  const plan = [];
  for (let i = 0; i < head; i++) plan.push(a.hook);
  plan.push(...fixed);
  const json = {
    id,
    angle: 'Get It? in one line: type a topic, every pupil answers privately on any device, every answer marked and sorted by name.',
    total_seconds: a.beats.reduce((n) => n + 3, 0),
    beats: a.beats.map(([on, vo], i) => ({
      seconds: i === 0 || i === 2 ? 4 : 3,
      onscreen: on,
      vo,
      visual: VIS[plan[i]] || 'scene',
    })),
  };
  fs.writeFileSync(`${D}/scripts/${id}.json`, JSON.stringify(json, null, 2));
  a.plan = plan;
}

/* rebuild OVERRIDES + PARAMS */
let src = fs.readFileSync(`${D}/beats.config.js`, 'utf8');
const oStart = src.indexOf('const OVERRIDES = {');
const oEnd = src.indexOf('/* Per-beat scene params.');
const oBlock = src.slice(oStart, oEnd);
const pStart = src.indexOf('const PARAMS = {');
const pEnd = src.indexOf('function cfgFor(id)');
if (oStart < 0 || pStart < 0) throw new Error('blocks');

const overrides = { speak: { 0: 'desk' }, quiet: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' }, proof: {} };
const params = { plainly: { 0: { nod: 1, hi: 4 } }, nod: { 0: { nod: 1 } } };

for (const [id, a] of Object.entries(ADS)) {
  overrides[id] = Object.fromEntries(a.plan.map((s, i) => [i, s]));
  const p = {};
  if (a.hook === 'chips') p[0] = { chips: a.chips || [], hand: 1 };
  if (a.hook === 'ninepm') p[0] = { night: 1, books: 9, mug: 1, pen: 1, clock: '21:04' };
  if (a.hook === 'classroom') p[0] = { up: [1, 2, 3], dim: [0, 7] };
  p[p.length] = null;
  /* phone beat */
  const phoneIdx = a.plan.indexOf('phone');
  p[phoneIdx] = { mode: 'type', tab: 1 };
  const resIdx = a.plan.indexOf('results');
  p[resIdx] = { hl: a.hl };
  p[a.plan.length - 1] = { min: 1 };
  params[id] = p;
}

/* keep quiet's params, drop the placeholder */
params.quiet = { 0: { chips: ['Ellie', 'Sam', 'Noah'], hand: 1 }, 1: { chips: ['Maya'], quiet: 1 }, 3: { q: 'Why does it eventually rain?', answer: 'The droplets get too heavy.', mode: 'type', tab: 1 }, 4: { hl: ['Maya', 'Sam', 'Noah'] }, 5: { min: 1 } };
params.speak = { 3: { mode: 'type', tab: 1 }, 4: { hl: ['Callum'] }, 5: { min: 1 } };
params.nod = Object.assign({}, params.nod, { 3: { mode: 'type', tab: 1 }, 4: { hl: ['Noah', 'Layla', 'Amira'] }, 5: { min: 1 } });
params.plainly = Object.assign({}, params.plainly, { 2: { mode: 'type', tab: 1 }, 3: { hl: ['Noah', 'Layla', 'Amira'] }, 4: { min: 1 } });
for (const k of Object.keys(params)) if (params[k] && params[k][null] === undefined) delete params[k];
for (const k of Object.keys(params)) for (const kk of Object.keys(params[k])) if (params[k][kk] === null) delete params[k][kk];

const fmt = (o) => JSON.stringify(o, null, 2).replace(/"/g, "'");
src = src.slice(0, oStart) + 'const OVERRIDES = ' + fmt(overrides) + ';\n\n' + src.slice(oEnd);
src = src.slice(0, src.indexOf('const PARAMS = {')) + 'const PARAMS = ' + fmt(params) + ';\n\n' + src.slice(src.indexOf('function cfgFor(id)'));
fs.writeFileSync(`${D}/beats.config.js`, src);
console.log('wrote scripts + config for', Object.keys(ADS).join(' '));