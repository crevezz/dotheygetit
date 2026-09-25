/* Generates 10 ad scripts (one per angle) with Opus 5.5 and writes them to
   marketing/scripts/<id>.json. Prints only a compact summary.
   Usage: node marketing/_write10.js            (skips ones already written)
          node marketing/_write10.js --force    (regenerate all) */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'scripts');
const KEY = fs.readFileSync(path.join(__dirname, '..', 'key.txt'), 'utf8').trim();
const FORCE = process.argv.includes('--force');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const ANGLES = [
    ['plainly', 'what the product IS, to a teacher who has never heard of it'],
    ['ninepm', 'the late-night marking pile that still does not tell you who understood'],
    ['nod', 'the nodding class - they all looked like they got it and they did not'],
    ['quiet', 'the quiet pupils who never put a hand up - the ones you are missing'],
    ['handsup', 'hands up does not tell you anything - only the confident answer'],
    ['speak', 'pupils who cannot or will not write, assessed by speaking the answer'],
    ['twominutes', 'how fast it is - a check you can run and act on in the same lesson'],
    ['cover', 'a cover teacher or a lesson with no prep, still checking understanding'],
    ['before', 'checking before you move on, instead of finding out weeks later'],
    ['proof', 'showing your head of department evidence of what the class understood'],
];

const PROMPT = `You write 20-second social video adverts for UK teachers. Write ONE ad.

THE PRODUCT (invent nothing beyond this):
"Get It?" (dotheygetit.app) - a free online understanding check. The teacher types a
topic. The app writes 3-6 questions about it. Pupils answer on their phone, by TYPING or
by SPEAKING their answer (speech becomes text). The teacher then sees in about two minutes
who understood, who is unsure, and who needs help. No marking. No photocopying. No hands
up. Nothing to install. Free.

THE AUDIENCE: UK primary/secondary teachers. Time-poor, and deeply sceptical of edtech.

WRITE LIKE A HUMAN BEING, NOT A BRAND:
- Use contractions (you're, don't, it's). Short sentences. Ordinary words.
- Sound like a teacher talking to another teacher in the staffroom.
- Never sound like marketing copy. No slogans, no taglines.
- Banned words: revolutionary, seamless, game-changer, empower, unlock, transform,
  effortless, streamline, leverage.
- No emoji. No exclamation marks. British English.

THE HOOK (first beat) IS THE MOST IMPORTANT PART:
- Open on a specific MOMENT or a CLAIM that stings - not a general musing.
- A statement beats a question. If unsure, use a statement.
- On-screen text: 6 WORDS MAX, must read in one glance.
- BAD: "Do you ever wonder who got your lesson?" (no tension, vague, soft).
  GOOD: "Half the class nodded." / "You marked thirty books and still don't know."

THE AD MUST DO FOUR THINGS, IN THIS ORDER:
1. Hook: a moment or claim the teacher recognises as true and slightly uncomfortable.
2. Say PLAINLY what the product is, in one short sentence a stranger would understand.
3. Show the product on screen - describe exactly what is visible.
4. Say the domain.

RULES:
- 5 beats. Roughly 45-55 voiceover words total, readable aloud in about 20 seconds.
- On-screen text: 6 words max per beat.
- Be concrete about what the teacher SEES. Never use "understanding" vaguely.
- End the voiceover by saying the domain: "dotheygetit dot app".

Return ONLY valid JSON, no markdown fence:
{"id":"one lowercase word","hook_type":"statement or question","angle":"one line",
 "beats":[{"seconds":3,"onscreen":"max six words","vo":"said aloud","visual":"what is on screen"}]}`;

(async () => {
    const made = [];
    for (const [id, angle] of ANGLES) {
        const file = path.join(OUT, id + '.json');
        if (!FORCE && fs.existsSync(file)) { made.push([id, '(kept)']); continue; }
        try {
            const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'anthropic/claude-opus-5.5', temperature: 0.8,
                    messages: [{ role: 'user', content: PROMPT + '\n\nTHIS AD\'S ANGLE: ' + angle }]
                })
            });
            const j = await r.json();
            if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 160));
            const s = JSON.parse(j.choices[0].message.content.replace(/^```json|```$/g, '').trim());
            s.id = id; s.angle_seed = angle;
            const words = s.beats.reduce((n, b) => n + b.vo.split(/\s+/).length, 0);
            s.vo_words = words;
            fs.writeFileSync(file, JSON.stringify(s, null, 2));
            made.push([id, s.beats[0].onscreen, words + 'w']);
        } catch (e) {
            made.push([id, 'FAILED: ' + e.message.slice(0, 70)]);
        }
    }
    console.log('\n--- 10 scripts ---');
    for (const m of made) console.log(m.join('  |  '));
})();
