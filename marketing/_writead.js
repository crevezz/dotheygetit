/* One-off: write a single advert with Claude Opus 5.5 via OpenRouter.
 *
 *   node marketing/_writead.js "the idea for this ad"
 *
 * Reads the key from key.txt. Prints strict JSON: {id, a, b, vo}
 * The copy goes into ads.js (a, b) and ad-vo.js (vo) - see ad-film.js.
 */
const fs = require('fs');
const path = require('path');

const KEY = fs.readFileSync(path.join(__dirname, '..', 'key.txt'), 'utf8').trim();
const MODEL = process.env.MODEL || 'anthropic/claude-opus-5.5';
const IDEA = process.argv.slice(2).join(' ') || 'a pupil who cannot or will not write can still be assessed, because they can just say the answer';

/* The existing ads, pasted in so the model copies the rhythm rather than inventing one. */
const EXISTING = `
a: "Thirty students nodded." / b: "Nodding isn't understanding"
   vo "Thirty students nodded. But nodding isn't understanding. Get It is the free two-minute check that shows who really got it. Try it free."
a: "Type your lesson topic." / b: "Get a check in seconds."
   vo "Type your lesson topic, and get a check in seconds. Get It. The free understanding check for teachers. Try it free."
a: "Pupils answer on their phones." / b: "You know in 2 minutes."
   vo "Pupils answer on their phones. You know who understood in two minutes. Get It. Free for teachers. Try it free."
a: "No marking." / b: "Just who understood."
   vo "No marking. No photocopying. Just who understood. Get It. The free two-minute check for teachers. Try it free."`.trim();

const SYS = `You write very short social video adverts for a UK teacher audience.

THE PRODUCT
"Get It?" (dotheygetit.app) is a free 2-minute understanding check for teachers.
A teacher types a lesson topic. Pupils answer a few questions online. They can
TYPE their answer or SPEAK it - speech is turned into text automatically. The
teacher instantly sees who understood, who is unsure, and who needs help.
No marking. No photocopying. Free.

THE RHYTHM OF THE EXISTING ADS
${EXISTING}

YOUR TASK
Write ONE new ad whose single idea is: ${IDEA}

THE RULES, WHICH ARE STRICT
- "a": 2 to 5 words. Plain. NO punctuation at the end. This is the setup.
- "b": 2 to 5 words. The punchline. NO punctuation at the end.
- "vo": 18 to 30 words, to be SPOKEN aloud. Plain English, short sentences.
  It must end with exactly "Try it free."
- British English spelling.
- No emoji. No exclamation marks. No hype ("revolutionary", "game-changing").
- Do not claim it replaces teachers, and do not make any medical or diagnostic claim.
- Keep line "a" and line "b" short enough to stay huge on a phone screen.

Return ONLY this JSON and nothing else:
{"id":"sayit","a":"...","b":"...","vo":"..."}`;

(async () => {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: 'Write the ad.' }],
    }),
  });
  if (!r.ok) { console.error('OpenRouter ' + r.status + ': ' + (await r.text()).slice(0, 500)); process.exit(1); }
  const j = await r.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message.content) || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) { console.error('no JSON in reply:\n' + text); process.exit(1); }
  const ad = JSON.parse(m[0]);
  console.log('model: ' + MODEL);
  console.log(JSON.stringify(ad, null, 2));
  console.log('\nwords: a=' + ad.a.split(' ').length + '  b=' + ad.b.split(' ').length + '  vo=' + ad.vo.split(' ').length);
})();
