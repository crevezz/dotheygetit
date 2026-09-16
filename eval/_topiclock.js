// Split the shared prompts: keep the maths worked examples OUT unless the topic is maths.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(f, 'utf8');

const cut = (name) => { const i = s.indexOf('const ' + name + ' ='); const o = s.indexOf('`', i); const c = s.indexOf('`', o + 1); return { i, end: c + 1, text: s.slice(i, c + 1) }; };

const PLAIN = `const PLAIN_WORDS = \`Write it the way you would SAY it to a ten-year-old, out loud, in one breath.

Every question must pass all of these:
- ONE question mark. Never two questions joined into one.
- 18 words at most, and most should be under 12. No single sentence over 14 words.
- ONE job. If it needs two steps or two things worked out, that is two questions - so
  drop one. A quick check asks one thing at a time.
- No scene-setting. No "Imagine you have...", "Suppose that...", "Consider a...". Give
  the facts flat and let them get on with it.
- Plain words for the idea, and no long words to sound clever. Use the term the class
  used, once, with a plain gloss beside it.
- An "explain" question is fine, but it must name the thing to explain in everyday words
  and still be short.

Read it back once, at normal speed. Could a ten-year-old answer it straight off without
asking what you mean? If not, write it again, shorter.

WRONG -> RIGHT
"Consider the various factors that might influence the outcome of the experiment." ->
"What could change the result of the test?"
"Explain the reasoning behind the procedure you use when describing a character." ->
"How can you tell what a character is like?"
"Imagine you have a list of words to learn. Which ones would be trickiest and why?" ->
"Which of these words is hardest to spell, and why?"
"Say something about what happened at the start of the story." -> "How does the story
begin?"\`;

/* The maths worked examples. They are ONLY for a maths topic: dropped into a spelling or
   history check they overpower the topic and the model writes sums for the wrong subject. */
const PLAIN_MATHS = \`MATHS WRONG -> RIGHT
"Imagine you have a pizza cut into eight equal slices. If you eat three slices, what
fraction of the pizza is left?" -> "You eat 3 slices of a pizza cut into 8. What fraction
is left?"
"Explain why two quarters of a pizza is the same amount as half a pizza." -> "Why is 2
quarters the same as a half?"
"If you are saving up for a game that costs twenty pounds and you have already saved
eight pounds, how many more pounds do you need to save?" -> "A game costs 20 pounds. You
have 8 pounds. How much more do you need?"
"What is the answer when you add five and seven?" -> "What is 5 + 7?"
"Explain the reasoning behind the procedure you use when the denominators match." ->
"Why do you only add the top numbers?"
On a maths question put numbers as digits, not words: "5 + 7", not "five and seven".\`;`;

const MARKS = `const MARK_RULES = \`Write 2 or 3 mark points for each question - 2 for a question with one main idea,
3 only for a richer question. Never pad a question out to three: if two points say the
same thing in different words, that is one point, and the pupil's mark is meaningless.

FIRST, and above everything else: a point must be something the pupil could actually SAY
in their answer to that question. If the question asks for a fact or a word, one point has
to BE that fact or word. A point a short, correct answer cannot reach is dead weight: it
marks every pupil down for something the question never asked. A short answer question
still gets TWO points - the answer itself, and the working or the reason.
WORK OUT THE RIGHT ANSWER YOURSELF FIRST, then write the point that gives THAT answer. A
point carrying the wrong answer is worse than no point at all: it marks the pupils who are
right down for being right, and hands credit to the ones who are wrong.
For a question that asks WHY - "explain why..." - there is no single word to give, so its
points are the reasons. One of them must be the claim itself, in the words a pupil would
likely use, so that a muddled but real attempt can reach it. A pupil who gets there in
clumsy words has shown the idea; never write a point that needs tidy wording to be reachable.
On a WHY question the points are separate REASONS. Two reasons that are the same idea in
different words are ONE point; writing both doubles the marks against a pupil who gave that
one reason. If you can say "in other words..." and your second point is what follows, delete it.
WRITE EVERY POINT IN THE WORDS THE PUPIL WOULD SAY OUT LOUD, not the words from the
textbook. This is the difference between marking the idea and marking the vocabulary. A
point written in schoolbook language is reachable ONLY by the pupil who has memorised the
phrase - the child who understands it but says it their own way scores nothing, which is
backwards and is the one thing a teacher will not forgive. Written plainly, both reach it.
That means a question with several valid ways to answer has ONE working point, not one per
way. Write the ONE point so any route reaches it, and let the answer point carry the rest.
Never repeat the same idea as two points: if two points would both be ticked by the same
answer, they are ONE point, not two.
NEVER WRITE THE ANSWER TWICE. The same fact said another way is ONE point, not two, and it
wastes half the question. The second point is always the WORKING or the REASON: how they got
there. A pupil who just gives the answer has shown the first and not the second, and that is
the honest mark.
Each point is ONE idea in ONE short sentence, twelve words or so. Never put two ideas in
one point and never write a list inside one. If you catch yourself writing a comma followed
by "and", that is two points - split them.
They must be about the subject, and never about how it is written.
Bad: "clear answer", "good use of vocabulary".\`;

/* Only for a maths topic - see the note on PLAIN_MATHS. */
const MARK_MATHS = \`MATHS EXAMPLES (work the answer out yourself first):
Q: "What is 5 + 7?"  Good: ["says 12", "adds the two numbers together"]
Bad: ["explains that five and seven were added together"] - the pupil never says that.
Q: "You eat 2 of 10 apples. How many are left?"  Good: ["says 8", "takes 2 away from 10"]
Q: "A pizza of eight slices has three eaten. What fraction is left?"
Good: ["says five eighths", "works out eight take away three"]   Bad: ["says three eighths"]
A question that just asks for the result of a sum - "What is 15 + 8?", "30 - 12" - has ONE
point: the answer, in the words a pupil would say. Do NOT add "adds the two numbers
together" or "subtracts 12 from 30" as a second point. There is no method a pupil can show
on a bare sum - the number IS the answer - and the extra point can only mark them down for
answering a sum correctly, which is the one thing a teacher will not forgive.
Where a question can be answered by more than one valid method - a common denominator,
cross-multiplying, decimals, a drawing, comparing each to a whole - the working point must
be reachable by ANY of them, so a pupil who shows the same idea another way still reaches it.
Q: "What is 105 + 7?" -> "says 112" and "adds the two numbers together".\`;`;

for (const [name, text] of [['PLAIN_WORDS', PLAIN], ['MARK_RULES', MARKS]]) {
  const c = cut(name);
  if (c.i < 0) { console.error('MISS ' + name); process.exit(1); }
  s = s.slice(0, c.i) + text + s.slice(c.end + 1);
}

/* topic-aware pickers, inserted just before the question writer */
const anchor = 'function questionWriterSystem(';
if (!s.includes(anchor)) { console.error('MISS anchor'); process.exit(1); }
const helpers = `/* Is this a maths topic? Only maths checks get the maths worked examples in the prompts -
   in a spelling or history check those examples hijack the subject. */
function isMathsTopic(t) {
  return /math|arithmetic|number|sum|add|subtract|multipl|divid|times table|fraction|decimal|percentage|percent|algebra|geometry|shape|measur|money|count|equation|area|perimeter|place value|rounding/.test(String(t || '').toLowerCase());
}
function plainWordsFor(t) { return isMathsTopic(t) ? PLAIN_WORDS + '\\n\\n' + PLAIN_MATHS : PLAIN_WORDS; }
function markRulesFor(t) { return isMathsTopic(t) ? MARK_RULES + '\\n\\n' + MARK_MATHS : MARK_RULES; }

`;
s = s.replace(anchor, helpers + anchor);

let a = 0, b = 0;
s = s.replace(/\$\{PLAIN_WORDS\}/g, () => { a++; return '${plainWordsFor(topic)}'; });
s = s.replace(/\$\{MARK_RULES\}/g, () => { b++; return '${markRulesFor(topic)}'; });
console.log('PLAIN_WORDS usages ->', a, '| MARK_RULES usages ->', b);

fs.writeFileSync(f, s);
console.log('written');
