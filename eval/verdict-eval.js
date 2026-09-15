/* ============================================================================
   Does the AI's green / amber / red actually match what a teacher would say?

   This is the one part of Get It? that cannot be checked by looking at it. So:
   write out conversations where the RIGHT answer is obvious, run them through
   the real /api/verdict on the real server, and count the disagreements.

   Every case below is a real Year 6/7 shape - the wording is deliberately
   childlike, because that is where a grader goes wrong.

   Run:  node eval/verdict-eval.js
         node eval/verdict-eval.js --verbose     show the AI's reasoning
   ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4604;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

/* `truth` = what a teacher would write on the mark sheet.
   `why`   = the trap this case is testing. */
const CASES = [
  {
    id: 'solid-green', topic: 'Comparing fractions', truth: 'green',
    why: 'Explains it their own way and copes when pushed. Must be green.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', '4/5. If you do them as twentieths, 3/4 is 15/20 and 4/5 is 16/20, and 16 is bigger.'],
      ['Examiner', 'Why did you pick twentieths?'],
      ['Student', 'Cos 4 and 5 both go into 20. You could use 40 but 20 is the smallest one.']
    ]
  },
  {
    id: 'green-childlike', topic: 'Comparing fractions', truth: 'green',
    why: 'Right answers, clumsy writing. A grader that punishes spelling is useless.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', '4/5 is bigger. I done it by doing 4x5 and 5x4 to get 20 then times the tops'],
      ['Examiner', 'Can you say what that finds you?'],
      ['Student', 'The comon bottom so you can see how meny fifths and how meny forths it is']
    ]
  },
  {
    id: 'green-rephrased-question', topic: 'Photosynthesis', truth: 'green',
    why: 'Never uses the word, but the understanding is unmistakably there.',
    said: [
      ['Examiner', 'Explain how a plant gets its food.'],
      ['Student', 'It does not eat anything. It takes the gas out of the air and water up the roots and makes its own sugar using sunlight.'],
      ['Examiner', 'What happens if you put it in a cupboard?'],
      ['Student', 'It would not be able to make the sugar so it would use up what it saved and then die.']
    ]
  },
  {
    id: 'amber-one-gap', topic: 'Comparing fractions', truth: 'amber',
    why: 'Method works, reasoning has a hole. Amber, never green.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', '4/5 because 5 is bigger than 4.'],
      ['Examiner', 'Is one fifth always bigger than one quarter?'],
      ['Student', 'No, a fifth is smaller. So that is wrong. 4/5 is still bigger though, I think, because you have got more of them.'],
      ['Examiner', 'How sure are you?'],
      ['Student', 'About half. I cannot really show it.']
    ]
  },
  {
    id: 'amber-thin-but-right', topic: 'The water cycle', truth: 'amber',
    why: 'Thin but correct. The prompt says this must NOT be red.',
    said: [
      ['Examiner', 'What happens to rain after it lands?'],
      ['Student', 'It goes into the ground and then it gets hot and goes up again.'],
      ['Examiner', 'Anything else?'],
      ['Student', 'It goes in the sea anall. I dont know the words for it.']
    ]
  },
  {
    id: 'red-nothing-right', topic: 'Comparing fractions', truth: 'red',
    why: 'Pushes back but each reason is wrong. Should be red - but note the gotRight list.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', '3/4 because 3 and 4 are smaller.'],
      ['Examiner', 'Smaller numbers mean a bigger fraction?'],
      ['Student', 'Yes. Like a half is smaller than a whole.'],
      ['Examiner', 'What about one tenth?'],
      ['Student', 'That is the biggest one.']
    ]
  },
  {
    id: 'red-blank', topic: 'Comparing fractions', truth: 'red',
    why: 'Nothing to grade. Must not invent understanding.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', 'dunno'],
      ['Examiner', 'Have a go, even a guess helps.'],
      ['Student', 'idk miss']
    ]
  },
  {
    id: 'red-off-topic', topic: 'The water cycle', truth: 'red',
    why: 'Talks confidently about the wrong thing. Must not be marked green.',
    said: [
      ['Examiner', 'What happens to rain after it lands?'],
      ['Student', 'Rain comes from clouds. Clouds are made of water. I like the rain because you get to stay in at break. My nan lives near a river.']
    ]
  },
  {
    id: 'faked-copied', topic: 'Photosynthesis', truth: 'amber',
    why: 'Textbook sentence, cannot unpack it, contradicts itself. faked should be true.',
    said: [
      ['Examiner', 'Explain how a plant gets its food.'],
      ['Student', 'Through the process of photosynthesis the plant converts light energy into chemical energy in the chloroplasts.'],
      ['Examiner', 'How does the light get in?'],
      ['Student', 'Through the roots and then into the leaves.'],
      ['Examiner', 'Are the roots above ground?'],
      ['Student', 'Yes they are the green bits.']
    ]
  },
  {
    id: 'faked-ai-written', topic: 'The water cycle', truth: 'amber',
    why: 'Polished, formally structured, then falls apart on a simple question.',
    said: [
      ['Examiner', 'What happens to rain after it lands?'],
      ['Student', 'Precipitation that reaches the surface is subsequently subjected to evaporation, transpiration, infiltration and surface runoff, thereby perpetuating the hydrological cycle.'],
      ['Examiner', 'Where does the water go after it soaks in?'],
      ['Student', 'hello what do you mean'],
      ['Examiner', 'Into the ground - then where?'],
      ['Student', 'the sky']
    ]
  },
  {
    id: 'amber-right-answer-wrong-method', topic: 'Comparing fractions', truth: 'amber',
    why: 'Right answer, invented reasoning. Classic false green trap.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', '4/5 because I worked out 3 divide 4 and 4 divide 5 on a calculator and 4/5 was bigger.'],
      ['Examiner', 'What would you do without a calculator?'],
      ['Student', 'I would have to guess. I do not know another way.']
    ]
  },
  {
    id: 'green-self-corrected', topic: 'Comparing fractions', truth: 'green',
    why: 'Started wrong, worked out why, fixed it. Getting there unaided is the whole point.',
    said: [
      ['Examiner', 'Which is bigger, 3/4 or 4/5?'],
      ['Student', '3/4 cos 4 is bigger than 5, no wait that is backwards.'],
      ['Examiner', 'Why is it backwards?'],
      ['Student', 'Because in fractions the bottom being bigger means each bit is smaller. So 4/5 has more bits and each bit is smaller but there is more of them. I need to make the bottoms the same.'],
      ['Examiner', 'Then what?'],
      ['Student', '20, so 15/20 against 16/20, so 4/5 is bigger by one twentieth.']
    ]
  }
];

const fmt = (c) => c.said.map(([who, t]) => who + ': ' + t).join('\n');
const RANK = { red: 0, amber: 1, green: 2 };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  const stop = () => { try { srv.kill(); } catch {} };
  process.on('exit', stop);

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(BASE + '/api/health'); up = true; } catch {}
  }
  if (!up) { console.log('server did not start'); stop(); process.exit(1); }
  console.log('server up on ' + PORT + ' - running ' + CASES.length + ' transcripts\n');

  const REPEAT = Number((process.argv.find(a => a.startsWith('--repeat=')) || '').split('=')[1]) || 1;

  const results = [];
  for (const c of CASES) {
    let v = null, err = '';
    const t0 = Date.now();
    if (REPEAT > 1) {
      const seen = [];
      for (let k = 0; k < REPEAT; k++) {
        const r = await fetch(BASE + '/api/verdict', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: c.topic, transcript: fmt(c) })
        });
        const j = (await r.json()).verdict;
        seen.push(j && j.level);
        if (k === 0) v = j;
      }
      const uniq = [...new Set(seen)];
      results.push({ got: seen[0], v, err: '', ms: Date.now() - t0, stable: uniq.length === 1, seen, truth: c.truth, id: c.id, why: c.why });
      console.log((uniq.length === 1 ? '  stable   ' : '  UNSTABLE ') + c.id.padEnd(30) +
        'teacher: ' + c.truth.padEnd(6) + 'ai: ' + seen.join('/') + '   ' + (Date.now() - t0) / 1000 + 's');
      continue;
    }
    try {
      const r = await fetch(BASE + '/api/verdict', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: c.topic, transcript: fmt(c) })
      });
      v = (await r.json()).verdict;
    } catch (e) { err = e.message; }
    const got = v && v.level;
    results.push(Object.assign({ got, v, err, ms: Date.now() - t0 }, c));

    const exact = got === c.truth;
    const off = Math.abs((RANK[got] ?? 1) - RANK[c.truth]);
    console.log((exact ? '  OK   ' : off >= 2 ? '  WAY OFF  ' : '  close    ') +
      c.id.padEnd(30) + 'teacher: ' + c.truth.padEnd(6) + 'ai: ' + String(got).padEnd(6) +
      (v && v.faked ? 'faked ' : '      ') + (Date.now() - t0) / 1000 + 's');
    if (VERBOSE && v) console.log('           gets: ' + v.gets + '\n           shaky: ' + v.shaky +
      '\n           next:  ' + v.nextStep);
  }

  const unstable = results.filter(r => r.stable === false);
  if (REPEAT > 1) {
    console.log('\n  repeatability (' + REPEAT + ' runs each): ' +
      (results.length - unstable.length) + '/' + results.length + ' gave the same level every time');
    if (unstable.length) console.log('  UNSTABLE: ' + unstable.map(r => r.id + ' [' + r.seen.join(',') + ']').join('  '));
  }

  const exact = results.filter(r => r.got === r.truth).length;
  const inverted = results.filter(r => Math.abs((RANK[r.got] ?? 1) - RANK[r.truth]) >= 2);
  const over = results.filter(r => r.got === 'green' && r.truth !== 'green').length;
  const under = results.filter(r => r.got === 'red' && r.truth === 'amber').length;

  console.log('\n--- where it disagreed ---');
  for (const r of results.filter(x => x.got !== x.truth)) {
    console.log('  ' + r.id + ': teacher ' + r.truth + ' vs ai ' + r.got);
    console.log('     ' + r.why);
    console.log('     ai said: ' + (r.v ? ('gets="' + r.v.gets + '" shaky="' + r.v.shaky + '"') : r.err));
  }

  console.log('\n' + '='.repeat(60));
  console.log('  exact agreement      ' + exact + '/' + results.length +
    '  (' + (exact / results.length * 100).toFixed(0) + '%)');
  console.log('  two levels out       ' + inverted.length +
    '   <- these are the ones that destroy trust');
  console.log('  false green          ' + over + '   <- tells a teacher a lost child is fine');
  console.log('  false red on amber   ' + under + '   <- tells a child who tried they failed');
  console.log('  flagged as faked     ' + results.filter(r => r.v && r.v.faked).map(r => r.id).join(', '));
  console.log('='.repeat(60));

  stop();
  process.exit(0);
})();