/* Points on the result card: one fact is one point, a quote only ticks the
   point it actually shows, and Next is a step for the teacher.
   No API key and no calls out. The saved marker is deliberately too generous,
   which is the failure on the live WW2 card. */
const assert = require('assert');
const { gradeCheck, setMarker, fitQuestion, asksOneThing, questionWriterSystem, criticSystem } = require('./server');

let mode = 'tick-all';
let transcriptReply = null;

function tickAll(messages) {
  const user = (messages || []).filter(m => m.role === 'user').map(m => String(m.content || '')).join('\n');
  if (user.startsWith('Transcript:')) return JSON.stringify(transcriptReply);
  if (mode === 'none') return JSON.stringify({ shown: [], reason: false });
  const sys = (messages || []).filter(m => m.role === 'system').map(m => String(m.content || '')).join('\n');
  const shown = [];
  sys.split('\n').forEach(line => {
    const m = line.match(/^(\d+)\. /);
    if (m) shown.push(Number(m[1]));
  });
  return JSON.stringify({ shown, reason: false });
}

function transcriptOf(questions, answers) {
  return questions.map((q, i) => 'Examiner: ' + q + '\nStudent: ' + (answers[i] == null ? '' : answers[i])).join('\n');
}

const WW2_Q = [
  'Who was the leader of Germany during World War Two?',
  'What was the name of the big war fought between countries in Europe and beyond?',
  'Why did Britain join World War Two?',
  'What was the Blitz, a time when German planes bombed cities?',
  'How did the end of World War Two change the world?'
];
const WW2_M = [
  ['Adolf Hitler was the leader of Germany', 'He was the dictator of Nazi Germany'],
  ['The big war fought between countries in Europe and beyond was called World War Two', 'It was also known as the Second World War'],
  ['Britain joined World War Two after Germany invaded Poland', 'Germany invaded Poland in September 1939'],
  ['The Blitz was a sustained bombing campaign by Germany against Britain', 'It primarily targeted cities and industrial areas'],
  [
    'The end of World War Two led to the formation of the United Nations',
    'It also resulted in the division of Germany and the beginning of the Cold War',
    'The war led to a significant shift in global power dynamics'
  ]
];

function pointText(ev) {
  return (ev.points || []).map(p => p.t).join(' | ');
}

(async () => {
  let failed = 0;
  function check(cond, name, detail) {
    if (cond) console.log('  OK   ' + name);
    else { failed++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
  }

  check(asksOneThing(WW2_Q[0]), 'who-was is one fact');
  check(asksOneThing(WW2_Q[1]), 'what was the name is one fact');
  check(!asksOneThing(WW2_Q[2]), 'why Britain joined can have more than one point');
  check(asksOneThing(WW2_Q[3]), 'what was the Blitz is one fact');
  check(!asksOneThing(WW2_Q[4]), 'how the world changed can have more than one point');
  check(!asksOneThing('What is 1/4 + 1/4?'), 'a fraction sum is not collapsed to one point');
  check(fitQuestion('What is 1/4 + 1/4?', ['says one half', 'adds the top numbers']).length === 2, 'fraction mark points stay as answer plus method');

  const who = fitQuestion(WW2_Q[0], WW2_M[0]);
  check(who.length === 1 && /hitler/i.test(who[0]) && !/dictator/i.test(who[0]), 'who-was keeps the leader and drops the dictator point', JSON.stringify(who));
  const name = fitQuestion(WW2_Q[1], WW2_M[1]);
  check(name.length === 1 && /world war two/i.test(name[0]) && !/second world war/i.test(name[0]), 'the other name of the war is not a second point', JSON.stringify(name));
  const blitz = fitQuestion(WW2_Q[3], WW2_M[3]);
  check(blitz.length === 1 && !/industrial/i.test(blitz[0]), 'the Blitz definition does not grow an industrial-areas point', JSON.stringify(blitz));
  const how = fitQuestion('How did the war change the world?', [
    'The war was called World War Two',
    'It was also known as the Second World War',
    'The United Nations was formed'
  ]);
  check(how.length === 2 && how.some(p => /united nations/i.test(p)) && how.filter(p => /world war/i.test(p)).length === 1,
    'a how-question drops a renamed duplicate and keeps a real second point', JSON.stringify(how));

  const y9 = questionWriterSystem('World War Two', 5, 'Year 9');
  check(/KS3/.test(y9) && !/ten-year-old/i.test(y9), 'Year 9 questions are pitched at KS3');
  check(/too small/i.test(y9) && /name of the big war/i.test(y9), 'the writer is told not to ask for the name of the topic');
  const plain = questionWriterSystem('World War Two', 5, '');
  check(/secondary/i.test(plain) && /KS3 or GCSE/.test(plain), 'with no year group the questions are still secondary');
  const critic = criticSystem('World War Two', '1. Question: Who was the leader?');
  check(/ONE point/.test(critic) && /marks/.test(critic) && !/plus the WORKING/.test(critic) && /1\/2 or 1\/4/.test(critic),
    'the critic still checks the scheme, and it no longer pads every question');

  setMarker(tickAll);
  transcriptReply = {
    level: 'amber',
    gets: 'some of the war',
    shaky: 'causes and what changed',
    faked: false,
    notes: 'The pupil has a basic understanding of some key figures and events of WW2.',
    nextStep: 'The pupil has a basic understanding of some key figures and events of WW2.'
  };
  mode = 'tick-all';
  const card = await gradeCheck('World War Two', transcriptOf(WW2_Q, [
    'Hitler',
    'WW2',
    '',
    'the blitz was a sustained attack town/cities in the uk by the german air force',
    ''
  ]), WW2_Q, WW2_M, 'Year 9');

  const ev = card.evidence || [];
  check(ev.length === 5, 'five questions on the card', String(ev.length));
  check(ev[0] && ev[0].total === 1 && ev[0].got === 1 && ev[0].points[0].hit, 'Hitler is full marks on who led Germany', JSON.stringify(ev[0]));
  check(ev[0] && !/dictator/i.test(pointText(ev[0])), 'the dictator line is not on the card');
  check(ev[1] && ev[1].total === 1 && ev[1].got === 1 && ev[1].points[0].hit, 'WW2 is full marks on the name of the war', JSON.stringify(ev[1]));
  check(ev[1] && !/second world war/i.test(pointText(ev[1])), 'Second World War is not a separate miss');
  check(ev[2] && ev[2].got === 0 && ev[2].total === 2, 'the Poland points stay, and a blank answer misses them', JSON.stringify(ev[2]));
  check(ev[3] && ev[3].total === 1 && !/industrial/i.test(pointText(ev[3])), 'industrial areas is not a Blitz point', JSON.stringify(ev[3]));
  check(card.pointsTotal === 8 && card.pointsHit === 3, 'the total is the real points, 3 of 8, not 5 of 11', card.pointsHit + ' of ' + card.pointsTotal);
  check(/^Recap:/i.test(card.nextStep) && /poland/i.test(card.nextStep) && /united nations|cold war/i.test(card.nextStep),
    'Next names the gaps', card.nextStep);
  check(!/basic understanding/i.test(card.nextStep), 'Next does not repeat the summary', card.nextStep);
  check(!/[\u2014\u2013]/.test(card.nextStep), 'Next has no em dash');

  transcriptReply = Object.assign({}, transcriptReply, {
    nextStep: 'Recap why Britain joined (Germany invaded Poland, September 1939) and what changed after the war (the UN and the Cold War).'
  });
  const kept = await gradeCheck('World War Two', transcriptOf(WW2_Q, ['Hitler', 'WW2', '', 'the blitz was a sustained attack', '']), WW2_Q, WW2_M, 'Year 9');
  check(/Cold War/.test(kept.nextStep) && /Poland/.test(kept.nextStep) && !/^Recap:/i.test(kept.nextStep),
    'a real next step from the model is kept', kept.nextStep);

  mode = 'tick-all';
  const shared = await gradeCheck('World War Two', transcriptOf(
    ['Why did Britain join World War Two?'],
    ['Germany invaded Poland']
  ), ['Why did Britain join World War Two?'], [[
    'Britain joined World War Two after Germany invaded Poland',
    'Germany invaded Poland in September 1939'
  ]], 'Year 9');
  const sp = (shared.evidence && shared.evidence[0] && shared.evidence[0].points) || [];
  check(sp.length === 2 && sp[0].hit && !sp[1].hit, 'invaded Poland does not also tick September 1939', JSON.stringify(sp));
  check(sp[0] && /poland/i.test(sp[0].said || '') && !(sp[1] && sp[1].said), 'the quote is not reused on the date');

  const places = await gradeCheck('The Blitz', transcriptOf(
    ['What was the Blitz, and which places did it hit?'],
    ['the blitz was a sustained attack town/cities in the uk by the german air force']
  ), ['What was the Blitz, and which places did it hit?'], [[
    'The Blitz was a sustained bombing campaign by Germany against Britain',
    'It primarily targeted cities and industrial areas'
  ]], 'Year 9');
  const bp = (places.evidence && places.evidence[0] && places.evidence[0].points) || [];
  check(bp.length === 2 && bp[0].hit && !bp[1].hit, 'towns and cities do not show industrial areas', JSON.stringify(bp));

  mode = 'none';
  const whoMissed = await gradeCheck('World War Two', transcriptOf(
    ['Who was the leader of Germany during World War Two?'],
    ['Hitler']
  ), ['Who was the leader of Germany during World War Two?'], [[
    'Adolf Hitler was the leader of Germany',
    'He was the dictator of Nazi Germany'
  ]], 'Year 9');
  const hp = whoMissed.evidence && whoMissed.evidence[0];
  check(hp && hp.total === 1 && hp.got === 1 && /hitler/i.test(hp.points[0].t) && !/dictator/i.test(pointText(hp)),
    'Hitler is full marks even when the marker ticks nothing', JSON.stringify(hp));

  const syn = await gradeCheck('World War Two', transcriptOf(
    ['What was the name of the big war fought between countries in Europe and beyond?'],
    ['WW2']
  ), ['What was the name of the big war fought between countries in Europe and beyond?'], [[
    'It was also known as the Second World War'
  ]], 'Year 10');
  const np = syn.evidence && syn.evidence[0];
  check(np && np.total === 1 && np.got === 1 && np.points[0].hit, 'WW2 counts as the Second World War even when the marker misses it', JSON.stringify(np));

  console.log('\n' + (failed ? failed + ' failed' : 'all passed'));
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
