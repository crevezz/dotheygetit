/* What the product looks like on screen, per ad.
 *
 * The scripts (marketing/scripts/*.json) carry the words: the on-screen line,
 * the voiceover, and a description of the picture. This file supplies the
 * concrete things that only a real product would have - the topic typed into
 * the box, the four questions, the pupil's answer, and the class results.
 *
 * One topic per ad. An earlier version defaulted everything to
 * "photosynthesis", so six of the ten films showed the same word on the board
 * and the same four questions - which made ten different angles look like one
 * ad. Now each ad teaches its own subject, and the board, the typed topic, the
 * questions, the pupil's answer and the results screen all agree with each
 * other and with the ad's angle.
 *
 * The results numbers are per class size, so a film whose subtitle says
 * "28 pupils" does not then show a 90-pupil result. The exception is `middle`,
 * which uses a real session from data.json (session 60, "Comparing fractions
 * (hard)", 90 pupils: 16 got it, 35 unsure, 39 needed help) because those real
 * proportions are the whole point of that ad. Names de-duplicated - the live
 * data has pupils who answered twice.
 */

/* The name pools. Eight per column is plenty on screen; short classes slice. */
const RES = {
  g: { count: 16, label: 'Got it', names: ['Noah', 'Isla', 'Omar', 'Kai', 'Ravi', 'Priya', 'Jonah', 'Iris'] },
  a: { count: 35, label: 'Unsure', names: ['Layla', 'Callum', 'Jack', 'Idris', 'Elsie', 'Nia', 'Leon', 'Megan'] },
  r: { count: 39, label: 'Needs help', names: ['Amira', 'Sofia', 'Grace', 'Tyler', 'Freya', 'Rhys', 'Dylan', 'Aisha'] },
};

const PHOTOSYNTHESIS = [
  'What does a plant need for photosynthesis?',
  'Where in the cell does it happen?',
  'Why is chlorophyll needed?',
  'What else is made besides glucose?',
];

const base = {
  topic: 'Photosynthesis',
  board: 'photosynthesis',
  typed: 'Photosynthesis',
  questions: PHOTOSYNTHESIS,
  mode: 'speak',
  resTopic: 'Photosynthesis',
  resSub: 'Class 8B · 28 pupils · answered on their phones',
  resFoot: 'Sorted automatically. No marking.',
  counts: { g: 11, a: 7, r: 10 },
};

/* One subject each. Keep the counts summing to the class size in resSub. */
const per = {
  /* Year 8 biology, spoken answers. */
  plainly: {
    topic: 'Osmosis',
    board: 'osmosis',
    typed: 'Osmosis',
    questions: [
      'What is osmosis?',
      'Which way does the water move?',
      'What is a partially permeable membrane?',
      'What happens to a plant cell in pure water?',
    ],
    mode: 'speak',
    answer: 'Water moves from where there is more water to where there is less',
    resTopic: 'Osmosis',
    resSub: 'Year 8 · 28 pupils · 2 minutes ago',
    resFoot: 'Sorted automatically. No marking.',
    counts: { g: 11, a: 7, r: 10 },
  },

  /* English, marking at nine. The teacher is at the desk with books, so the
     topic is a text they are marking. */
  ninepm: {
    topic: 'Macbeth: ambition',
    board: 'macbeth: ambition',
    typed: 'Macbeth: ambition',
    questions: [
      'What does Lady Macbeth want him to do?',
      'Quote one line about ambition.',
      'How does Macbeth change in Act 1?',
      'What do the witches promise him?',
    ],
    mode: 'speak',
    answer: 'She wants him to kill the king so he can be king',
    resTopic: 'Macbeth: ambition',
    resSub: 'Year 10 · 30 pupils · 21:06',
    resFoot: 'No marking. Your evening back.',
    counts: { g: 12, a: 8, r: 10 },
  },

  /* Maths, and the class' foot line is about fourteen of them knowing - so the
     green count really is fourteen. */
  nod: {
    topic: 'Expanding brackets',
    board: 'expanding brackets',
    typed: 'Expanding brackets',
    questions: [
      'Expand 3(x + 4).',
      'Expand 2(3x - 5).',
      'Expand x(x + 7).',
      'Expand and simplify 2(x + 3) + 4(x + 1).',
    ],
    mode: 'speak',
    answer: 'You times the outside by both of the inside ones',
    resTopic: 'Expanding brackets',
    resSub: 'Year 8 · 30 pupils · after period 3',
    resFoot: 'Half of them said yes. Fourteen actually knew.',
    names: { g: ['Mia','Isla','Omar','Kai','Priya'], a: ['Sam','Layla','Callum','Idris','Elsie'], r: ['Leo','Sofia','Grace','Tyler','Freya'] },
    counts: { g: 14, a: 9, r: 7 },
  },

  /* Geography. The angle is the pupils who never put a hand up. */
  quiet: {
    topic: 'The water cycle',
    board: 'the water cycle',
    typed: 'The water cycle',
    questions: [
      'Name the four stages of the water cycle.',
      'What happens during evaporation?',
      'What happens during condensation?',
      'Why does it eventually rain?',
    ],
    mode: 'speak',
    answer: 'Water goes up as a gas and comes back down as rain',
    resTopic: 'The water cycle',
    resSub: 'Year 8 · 29 pupils · silent answers',
    resFoot: 'The ones who never put a hand up answered.',
    names: { g: ['Maya', 'Ellie', 'Isla', 'Omar', 'Kai', 'Priya', 'Jonah', 'Iris'], a: ['Sam', 'Layla', 'Callum', 'Idris', 'Elsie', 'Nia', 'Leon'], r: ['Noah', 'Sofia', 'Grace', 'Tyler', 'Freya', 'Rhys', 'Dylan', 'Aisha'] },
    counts: { g: 12, a: 7, r: 10 },
  },

  /* Year 9 cover - the script names photosynthesis on the board, so this one
     keeps it. */
  cover: {
    topic: 'Photosynthesis',
    board: 'photosynthesis',
    typed: 'Photosynthesis',
    questions: PHOTOSYNTHESIS,
    mode: 'speak',
    answer: 'Light and water and carbon dioxide',
    resTopic: 'Photosynthesis',
    resSub: 'Cover · Year 9 · 26 pupils',
    resFoot: 'No plan needed. No marking.',
    counts: { g: 10, a: 6, r: 10 },
  },

  /* Year 11 chemistry. The angle is the mock you have already sat. */
  before: {
    topic: 'Rates of reaction',
    board: 'rates of reaction',
    typed: 'Rates of reaction — Year 11',
    questions: [
      'Name four things that speed up a reaction.',
      'Why does surface area matter?',
      'What does a catalyst do?',
      'Why does temperature change the rate?',
    ],
    mode: 'speak',
    answer: 'More surface means more collisions',
    resTopic: 'Rates of reaction',
    resSub: 'Year 11 · 28 pupils · before you move on',
    resFoot: 'You found out in the lesson, not in the mock.',
    counts: { g: 12, a: 6, r: 10 },
  },

  /* History. The angle is evidence for a meeting with the head of department. */
  proof: {
    topic: 'Causes of the First World War',
    board: 'causes of the first world war',
    typed: 'Causes of the First World War',
    questions: [
      'Name two long-term causes of the war.',
      'What was the immediate trigger in 1914?',
      'How did alliances turn it into a world war?',
      'Which cause mattered most, and why?',
    ],
    mode: 'speak',
    answer: 'Alliances dragged everyone in after the shooting',
    resTopic: 'Causes of the First World War',
    resSub: 'Year 10 · 28 pupils · evidence for the meeting',
    resFoot: 'Names, not nods.',
    counts: { g: 12, a: 6, r: 10 },
    labels: { g: 'Understood', a: 'Unsure', r: 'Needs help' },
  },

  /* Geography, and the pupil's answer is spoken - which is the point of the ad. */
  speak: {
    topic: 'Erosion',
    board: 'erosion',
    typed: 'Erosion',
    questions: [
      'What is erosion?',
      'Name two things that cause erosion.',
      'How does water wear away rock?',
      'Where would you look for erosion near school?',
    ],
    mode: 'speak',
    answer: 'The sea takes the rock away bit by bit',
    resTopic: 'Erosion',
    resSub: 'Year 8 · 27 pupils · spoken answers',
    resFoot: 'Jayden is in Got it. In his book there was one line.',
    counts: { g: 11, a: 7, r: 9 },
  },

  /* Year 7 maths, same lesson as the exit ticket. */
  twominutes: {
    topic: 'Fractions of amounts',
    board: 'fractions of amounts',
    typed: 'Fractions of amounts',
    questions: [
      'What is 1/3 of 36?',
      'What is 2/5 of 30?',
      'How do you find 3/4 of 20?',
      'Explain your method for 2/5 of 30.',
    ],
    mode: 'speak',
    answer: 'Thirty divided by five is six, times two is twelve',
    resTopic: 'Fractions of amounts',
    resSub: 'Year 7 · 26 pupils · same lesson',
    resFoot: 'You can still reteach it. The lesson is not over.',
    counts: { g: 11, a: 6, r: 9 },
  },

  /* The one ad built on a real session, so it keeps the real 90-pupil split. */
  middle: {
    topic: 'Comparing fractions',
    board: 'comparing fractions',
    typed: 'Comparing fractions',
    questions: [
      'Order 3/4, 5/7 and 0.8, smallest first.',
      'How do you compare two fractions?',
      'Which is bigger: 2/3 or 7/10?',
      'How do you know 5/7 is smaller than 3/4?',
    ],
    mode: 'type',
    answer: '5/7 is smallest because 20/28 is less than 21/28',
    resTopic: 'Comparing fractions (hard)',
    resSub: 'Year 9 · 90 pupils · one lesson',
    resFoot: '16 got it. 39 need help. What about the 35 in between?',
    counts: { g: 16, a: 35, r: 39 },
  },
};

/* Scenes are picked from the beat's own description; these are the beats where
   the description is ambiguous, or where a visual reads better a different way. */
const OVERRIDES = {
  explainer: { 0: 'chips', 1: 'chips', 2: 'text', 3: 'laptop', 4: 'text', 5: 'phone', 6: 'phone', 7: 'results', 8: 'text', 9: 'text', 10: 'domain' },
  quiet: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  nod: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  ninepm: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  twominutes: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  middle: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  cover: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  proof: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  before: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  speak: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
  plainly: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },
};

/* Per-beat scene params. None of these sets `board` any more: the classroom
   takes its board from the ad's own topic, so the board always matches the
   questions and the results. */
const PARAMS = {
  explainer: {"0":{"chips":["Ellie","Sam","Noah"],"icon":"hand","hand":1},"1":{"chips":["Maya"],"quiet":1},"5":{"q":"Why does it eventually rain?","answer":"The droplets get too heavy.","mode":"type","tab":1},"6":{"q":"Where do clouds come from?","answer":"Water evaporates and then condenses.","mode":"speak","tab":1},"7":{"hl":["Maya","Sam","Noah"]},"10":{"min":1}},
  quiet: {"0":{"chips":["Ellie","Sam","Noah"],"icon":"hand","hand":1},"1":{"chips":["Maya"],"quiet":1},"3":{"q":"Why does it eventually rain?","answer":"The droplets get too heavy.","mode":"type","tab":1},"4":{"hl":["Maya","Sam","Noah"]},"5":{"min":1}},
  nod: {"0":{"chips":["Leo","Mia","Sam"],"icon":"thumb"},"1":{"chips":["Leo"],"quiet":1,"icon":"cross"},"3":{"q":"Expand 3(x + 4)","answer":"3x + 12","mode":"type","tab":1},"4":{"hl":["Mia","Sam","Leo"]},"5":{"min":1}},
  ninepm: {"0":{"chips":["Ella","Josh","Ruby"],"icon":"book"},"1":{"chips":["Ruby"],"quiet":1,"icon":"ask"},"3":{"q":"What does Lady Macbeth want?","answer":"For Macbeth to kill the king.","mode":"type","tab":1},"4":{"hl":["Ella","Josh","Ruby"]},"5":{"min":1}},
  twominutes: {"0":{"chips":["Zara","Ben","Finn"],"icon":"ticket"},"1":{"chips":["Finn"],"quiet":1,"icon":"ask"},"3":{"q":"What is 2/5 of 30?","answer":"12","mode":"type","tab":1},"4":{"hl":["Zara","Ben","Finn"]},"5":{"min":1}},
  middle: {"0":{"chips":["Ava","Jake","Lily"],"icon":"star"},"1":{"chips":["Harry"],"quiet":1,"icon":"ask"},"3":{"q":"Which is bigger: 2/3 or 7/10?","answer":"7/10","mode":"type","tab":1},"4":{"hl":["Ava","Harry","Jake"]},"5":{"min":1}},
  cover: {"0":{"chips":["Year 9","Science","Cover"],"icon":"note"},"1":{"chips":["Poppy"],"quiet":1,"icon":"ask"},"3":{"q":"What does a plant need for photosynthesis?","answer":"Light, water and carbon dioxide.","mode":"type","tab":1},"4":{"hl":["Ethan","Poppy","Alfie"]},"5":{"min":1}},
  proof: {"0":{"chips":["Head of department"],"icon":"quote"},"1":{"chips":["Oscar"],"quiet":1,"icon":"ask"},"3":{"q":"What triggered the war in 1914?","answer":"The assassination of Franz Ferdinand.","mode":"type","tab":1},"4":{"hl":["Amelia","Oscar","Daniel"]},"5":{"min":1}},
  before: {"0":{"chips":["Evie","Jess","Kyle"],"icon":"exam"},"1":{"chips":["Kyle"],"quiet":1,"icon":"cross"},"3":{"q":"What does a catalyst do?","answer":"Speeds up the reaction.","mode":"type","tab":1},"4":{"hl":["Evie","Jess","Kyle"]},"5":{"min":1}},
  speak: {"0":{"chips":["Callum"],"icon":"mic","hand":1},"1":{"chips":["Callum"],"quiet":1,"icon":"pen"},"3":{"q":"How does the sea wear away rock?","answer":"It throws stones at the cliff.","mode":"speak","tab":1},"4":{"hl":["Callum","Nia","Rhys"]},"5":{"min":1}},
  plainly: {"0":{"chips":["Aisha","Tom","Grace"],"icon":"target"},"1":{"chips":["Tom"],"quiet":1,"icon":"ask"},"3":{"q":"Which way does the water move?","answer":"From more water to less water.","mode":"type","tab":1},"4":{"hl":["Aisha","Tom","Grace"]},"5":{"min":1}},
};

const NAMES_OVR = {"quiet":{"g":["Maya","Isla","Omar","Kai","Priya"],"a":["Sam","Layla","Idris","Elsie","Nia"],"r":["Noah","Sofia","Grace","Tyler","Freya"]},"nod":{"g":["Mia","Isla","Omar","Kai","Priya"],"a":["Sam","Layla","Idris","Elsie","Nia"],"r":["Leo","Sofia","Grace","Tyler","Freya"]},"ninepm":{"g":["Ella","Isla","Omar","Kai","Priya"],"a":["Josh","Layla","Idris","Elsie","Nia"],"r":["Ruby","Sofia","Grace","Tyler","Freya"]},"twominutes":{"g":["Zara","Isla","Omar","Kai","Priya"],"a":["Ben","Layla","Idris","Elsie","Nia"],"r":["Finn","Sofia","Grace","Tyler","Freya"]},"middle":{"g":["Ava","Isla","Omar","Kai","Priya"],"a":["Harry","Layla","Idris","Elsie","Nia"],"r":["Jake","Sofia","Grace","Tyler","Freya"]},"cover":{"g":["Ethan","Isla","Omar","Kai","Priya"],"a":["Poppy","Layla","Idris","Elsie","Nia"],"r":["Alfie","Sofia","Grace","Tyler","Freya"]},"proof":{"g":["Amelia","Isla","Omar","Kai","Priya"],"a":["Oscar","Layla","Idris","Elsie","Nia"],"r":["Daniel","Sofia","Grace","Tyler","Freya"]},"before":{"g":["Evie","Isla","Omar","Kai","Priya"],"a":["Jess","Layla","Idris","Elsie","Nia"],"r":["Kyle","Sofia","Grace","Tyler","Freya"]},"speak":{"g":["Callum","Isla","Omar","Kai","Priya"],"a":["Nia","Layla","Idris","Elsie"],"r":["Rhys","Sofia","Grace","Tyler","Freya"]},"plainly":{"g":["Aisha","Isla","Omar","Kai","Priya"],"a":["Tom","Layla","Idris","Elsie","Nia"],"r":["Grace","Sofia","Tyler","Freya"]}};
per.explainer = Object.assign({}, per.quiet);
NAMES_OVR.explainer = NAMES_OVR.quiet;
function cfgFor(id) {
  const c = Object.assign({}, base, per[id] || {});
  if (NAMES_OVR[id]) c.names = NAMES_OVR[id];
  const labels = c.labels || {};
  const counts = c.counts || {};
  /* a short class must not list more names than it has pupils */
  const col = (key) => {
    const count = counts[key] || RES[key].count;
    return Object.assign({}, RES[key], { count, names: ((c.names && c.names[key]) || RES[key].names).slice(0, Math.min(5, count)) },
      labels[key] ? { label: labels[key] } : {});
  };
  c.cols = { g: col('g'), a: col('a'), r: col('r') };
  c.overrides = OVERRIDES[id] || {};
  c.params = PARAMS[id] || {};
  return c;
}

module.exports = { cfgFor, RES };
