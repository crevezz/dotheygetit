/* Generates a structured 20-second ad SCRIPT with Opus 5.5.
 *
 *   node marketing/_writescript.js "<angle>" <id>
 *
 * Writes marketing/scripts/<id>.json itself. The old route was
 *   node _writescript.js "..." > scripts/x.json
 * which appended the trailing "--- vo words: N ---" summary to the file and
 * broke require() on it. Never do that again.
 *
 * WHY THIS PROMPT CHANGED: the first version mandated a fixed four-step
 * structure (pain -> say what the product is -> show it -> say the domain).
 * The model optimised to that template, so eight of the ten ads ended up with
 * near-identical middle beats - "Get It? is a free website. Type a topic, it
 * writes the questions." / "Pupils answer on their phones, typing or speaking."
 * / "you see who's got it, who's unsure, who needs help." Ten angles, one ad.
 *
 * Now the prompt passes in every line the other nine ads already use and bans
 * them outright, and it allows at most one beat to define the product. The
 * exclusivity is what does the work - a rule alone is not enough, because the
 * model cannot avoid repeating what it has not been shown.
 */
const fs = require('fs');
const path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, '..', 'key.txt'), 'utf8').trim();
const { cfgFor } = require('./beats.config');

const SCRIPTS = path.join(__dirname, 'scripts');
const ANGLE = process.argv[2] || 'what it actually is - explain the product to a teacher who has never heard of it';
const ID = (process.argv[3] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
if (!ID) {
  console.error('usage: node marketing/_writescript.js "<angle>" <id>');
  process.exit(1);
}

const cfg = cfgFor(ID);

/* Everything the other ads already say, so this one cannot say it again. */
const used = { vo: [], onscreen: [] };
for (const f of fs.readdirSync(SCRIPTS).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
  const id = j.id || path.basename(f, '.json');
  if (id === ID) continue;
  for (const b of j.beats || []) {
    if (b.vo) used.vo.push(b.vo.trim());
    if (b.onscreen) used.onscreen.push(b.onscreen.trim());
  }
}
const asList = (a) => a.map((s) => '  - "' + s + '"').join('\n');

const prompt = `You write 20-second social video adverts for UK teachers. Write ONE.

THE PRODUCT (do not invent features beyond this):
"Get It?" (dotheygetit.app) - a free online understanding check.
The teacher types a topic. The app writes 3-6 questions about it. Pupils answer on their
phone - by TYPING or by SPEAKING their answer out loud (speech is turned into text). The
teacher then sees, in about 2 minutes, who understood, who is unsure, and who needs help.
No marking. No photocopying. No hands up. Nothing to install. Free.

THE AUDIENCE: UK primary/secondary teachers. Time-poor and deeply sceptical of edtech
claims. They have seen a hundred tools that promised to save time.

THE ONE THING THIS AD MUST NOT DO: explain the product the same way the other nine ads
do. The single most common failure is that every advert for this product is really the
same advert with a different opening line. Do not add to that.

ALREADY USED BY THE OTHER NINE ADS - DO NOT REUSE ANY OF THESE, in any tense or word order:
${asList(used.vo)}

ALREADY USED AS ON-SCREEN TEXT - DO NOT REUSE:
${asList(used.onscreen)}

PERMANENTLY BANNED SENTENCES (these appeared in almost every earlier ad and are why they
all felt like one ad - never write these, or close paraphrases of them, whatever the angle):
  - "Get It? is a free website." / "Get It's a free check." / "Get It is a free online check."
  - "Type a topic, it writes the questions."
  - "Pupils answer on their phones, typing or speaking."
  - "you see who's got it, who's unsure, who needs help"
  - "Two minutes later..."
  - "No marking. Nothing to install." / "Nothing to install."
  - "dotheygetit dot app" tacked onto the end of an unrelated sentence
  - on screen: "Type a topic. Get questions." / "Got it. Unsure. Needs help." /
    "Typed or spoken answers." / "Who got it. Who didn't."

HARD STRUCTURE RULES:
- 5 or 6 beats, about 45-55 voiceover words in total, roughly 20 seconds.
- AT MOST ONE beat may define what the product is. The other four beats must earn their
  place with something only THIS ad could say - a specific moment, detail or objection
  that follows from the angle below.
- Do not reuse the shape "list three pain points, then the product, then the domain".
  Vary it: you may open inside the product, open mid-lesson, open on a pupil, open on a
  number, or open on the objection the teacher is actually thinking.
- The LAST beat must say the domain aloud: "dotheygetit dot app".
- British English. No emoji. No exclamation marks.
- Banned words: revolutionary, seamless, game-changer, empower, unlock, transform,
  effortless, game changing.
- Never write "understanding" as a vague abstraction. Be concrete about what the teacher
  sees on the screen.
- Do not use the phrase "no marking" as a throwaway on its own any more; if absence of
  marking matters to this angle, make it specific.
- On-screen text: max 6 words per beat. The voiceover carries the meaning.
- The on-screen text must not be a shortened copy of the voiceover line.

THE TOPIC THIS AD USES ON SCREEN: "${cfg.topic}"
The film will show the teacher typing that topic and the app writing these questions:
${(cfg.questions || []).map((q) => '  - ' + q).join('\n')}
So any beat that describes the product in use must be consistent with that subject. Do not
mention a different topic anywhere in the voiceover or the visuals.

THE RESULTS SCREEN THIS AD ENDS ON:
  ${cfg.resSub} - ${cfg.cols.g.count} got it, ${cfg.cols.a.count} unsure, ${cfg.cols.r.count} need help
Any number you say out loud must match those exactly. Do not invent a different class size,
and do not say a number the screen does not show.

Return ONLY valid JSON, no markdown fence:
{
  "id": "${ID}",
  "angle": "one line on what this ad leans on",
  "total_seconds": 20,
  "beats": [
    { "seconds": 2.5, "onscreen": "max six words", "vo": "what is said aloud", "visual": "what is on screen - max 15 words" }
  ]
}`;

(async () => {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-opus-5.5',
      temperature: 0.85,
      /* Without this, OpenRouter reserves its default ceiling (65536) against
         the credit balance and rejects the call with a 402 once the balance is
         low. 1600 turned out to be too tight and truncated the JSON mid-object,
         which is worse than a clean failure - "RAW (could not parse)". 4000
         leaves room for six beats with visuals. */
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt + '\n\nANGLE FOR THIS AD: ' + ANGLE }],
    }),
  });
  const j = await r.json();
  if (!j.choices || !j.choices[0] || !j.choices[0].message || !j.choices[0].message.content) {
    throw new Error('OpenRouter: ' + JSON.stringify(j).slice(0, 600));
  }
  const out = j.choices[0].message.content.trim();

  let s;
  try {
    s = JSON.parse(out.replace(/^```json|```$/g, '').trim());
  } catch (e) {
    console.log('RAW (could not parse):\n' + out);
    process.exit(1);
  }

  /* the id decides the filename, the config profile and the params */
  s.id = ID;
  if (!Array.isArray(s.beats) || !s.beats.length) throw new Error('no beats');
  s.total_seconds = s.beats.reduce((n, b) => n + (Number(b.seconds) || 0), 0) || 20;

  /* refuse to write an ad that repeats a line we banned */
  const flat = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mine = s.beats.map((b) => flat(b.vo));
  const clash = [];
  for (const v of used.vo) {
    const k = flat(v);
    if (k.length > 24 && mine.some((m) => m.includes(k))) clash.push(v);
  }
  const dom = s.beats[s.beats.length - 1];
  if (!/dotheygetit/i.test(dom.vo || '')) clash.push('LAST BEAT DOES NOT SAY THE DOMAIN');
  const words = s.beats.reduce((n, b) => n + String(b.vo).split(/\s+/).length, 0);
  if (words < 38 || words > 62) clash.push('VO words ' + words + ' outside 38-62');

  fs.writeFileSync(path.join(SCRIPTS, ID + '.json'), JSON.stringify(s, null, 2) + '\n');
  console.log('wrote scripts/' + ID + '.json   beats ' + s.beats.length + '  words ' + words +
    '  seconds ' + s.total_seconds);
  if (clash.length) {
    console.log('\n  REVIEW - these look like repeats:');
    clash.forEach((c) => console.log('    ! ' + c));
  }
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
